// story-claude : Lambda 함수 URL(응답 스트리밍)로 Claude 를 대신 부르고 쓴 만큼 크레딧을 깎는다
// Anthropic 키는 이 함수의 환경변수 ANTHROPIC_API_KEY 에만 있다. CORS 는 함수 URL 설정이 붙인다
import { uidFrom, getWallet, deduct, costKrw, PRICES } from './common.mjs';

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
// 서버측 도구(웹 검색 등)로 요금이 새지 않게 허용한 필드만 넘긴다
const ALLOWED = ['model', 'max_tokens', 'system', 'messages', 'stream', 'output_config', 'fallbacks'];

export async function handle(event, out){
  const method = event.requestContext?.http?.method;
  if (method === 'OPTIONS'){ out.start(204, {}); return out.end(); }
  const json = (status, message) => { out.start(status, {'content-type':'application/json'}); out.write(JSON.stringify({error:{message}})); out.end(); };
  const uid = uidFrom(event.headers);
  if (!uid) return json(401, '로그인 정보가 없어요.');
  let req;
  try { req = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || ''); }
  catch(e){ return json(400, '잘못된 요청이에요.'); }
  if (!PRICES[req.model]) return json(400, '쓸 수 없는 모델이에요.');
  const body = {};
  for (const k of ALLOWED) if (req[k] !== undefined) body[k] = req[k];
  body.max_tokens = Math.min(Math.max(1, +body.max_tokens || 1024), 20000);

  const w = await getWallet(uid);
  if (w.balance <= 0) return json(402, '크레딧이 부족해요. 충전 후 이용해주세요.');

  const headers = {'content-type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01'};
  const beta = event.headers?.['anthropic-beta'];
  if (beta && /^[\w,.-]{1,200}$/.test(beta)) headers['anthropic-beta'] = beta;
  const res = await fetch(ANTHROPIC, {method:'POST', headers, body:JSON.stringify(body)});

  const u = {in:0, out:0, cw:0, cr:0};
  const addU = x => { if (!x) return; u.in += x.input_tokens || 0; u.cw += x.cache_creation_input_tokens || 0; u.cr += x.cache_read_input_tokens || 0; if (x.output_tokens) u.out = x.output_tokens; };

  if (!res.ok || !body.stream){
    const t = await res.text();
    if (res.ok){ try { addU(JSON.parse(t).usage); } catch(e){} }
    out.start(res.status, {'content-type':'application/json'}); out.write(t); out.end();
    if (res.ok) await deduct(uid, costKrw(body.model, u));
    return;
  }

  out.start(200, {'content-type':'text/event-stream', 'cache-control':'no-cache'});
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  try {
    while (true){
      const {done, value} = await reader.read(); if (done) break;
      out.write(value);
      buf += dec.decode(value, {stream:true});
      let k;
      while ((k = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
        if (!line.startsWith('data:')) continue;
        try { const ev = JSON.parse(line.slice(5)); if (ev.type === 'message_start') addU(ev.message?.usage); else if (ev.type === 'message_delta') addU(ev.usage); } catch(e){}
      }
    }
  } finally {
    out.end();
    await deduct(uid, costKrw(body.model, u));
  }
}

const lambda = globalThis.awslambda;
export const handler = typeof lambda?.streamifyResponse === 'function'
  ? lambda.streamifyResponse(async (event, rs) => {
      let s = rs;
      await handle(event, {
        start: (statusCode, headers) => { s = lambda.HttpResponseStream.from(rs, {statusCode, headers}); },
        write: c => s.write(c),
        end: () => s.end()
      });
    })
  : handle;
