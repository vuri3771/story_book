// 실제 두 핸들러를 로컬 http 서버로 띄워 브라우저와 함께 시험한다
// DynamoDB 는 메모리, Anthropic 은 가짜 스트림. AWS 에 배포하지 않고 프론트 연동을 확인하는 용도
//   node test/local-server.mjs 8787
import http from 'node:http';
import { setDdb } from '../src/common.mjs';
import { handler as api } from '../src/api.mjs';
import { handle as claude } from '../src/claude.mjs';

const db = new Map();
const key = (u, k) => u + '|' + k;
setDdb({ async send(cmd){
  const n = cmd.constructor.name, i = cmd.input;
  if (n === 'GetCommand') return {Item: db.get(key(i.Key.uid, i.Key.k))};
  if (n === 'UpdateCommand'){
    const it = db.get(key(i.Key.uid, i.Key.k)) || {uid:i.Key.uid, k:i.Key.k};
    const v = i.ExpressionAttributeValues;
    if (i.UpdateExpression.includes('balance :n')){ it.balance = (it.balance || 0) + v[':n']; it.spent = (it.spent || 0) + v[':c']; }
    if (i.UpdateExpression.includes('balance :c')){ it.balance = (it.balance || 0) + v[':c']; it.history = [...v[':h'], ...(it.history || [])]; }
    db.set(key(i.Key.uid, i.Key.k), it); return {};
  }
  if (n === 'QueryCommand'){ const u = i.ExpressionAttributeValues[':u']; return {Items:[...db.values()].filter(x => x.uid === u && !x.k.startsWith('img#') && x.k !== 'wallet')}; }
  if (n === 'BatchWriteCommand'){
    for (const r of Object.values(i.RequestItems)[0]){
      if (r.PutRequest) db.set(key(r.PutRequest.Item.uid, r.PutRequest.Item.k), r.PutRequest.Item);
      else db.delete(key(r.DeleteRequest.Key.uid, r.DeleteRequest.Key.k));
    }
    return {};
  }
  if (n === 'BatchGetCommand') return {Responses:{story_app: Object.values(i.RequestItems)[0].Keys.map(kk => db.get(key(kk.uid, kk.k))).filter(Boolean)}};
  throw new Error('unknown ' + n);
}});

process.env.ALLOW_TEST_CHARGE = '1';
process.env.ANTHROPIC_API_KEY = 'fake';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (!String(url).includes('api.anthropic.com')) return realFetch(url, opts);
  const body = JSON.parse(opts.body);
  const text = body.stream ? '```info\n신력 47년 | 📍 본관\n```\n*서류철이 놓였다.*\n정소연 | "앉으세요."' : '다정하게 인사한다\n###\n장난스럽게 웃는다\n###\n대담하게 묻는다';
  const usage = {input_tokens:1000, cache_read_input_tokens:9000};
  if (!body.stream) return new Response(JSON.stringify({content:[{type:'text', text}], usage:{...usage, output_tokens:100}, stop_reason:'end_turn'}), {status:200});
  const ev = [{type:'message_start', message:{usage:{...usage, output_tokens:1}}}, {type:'content_block_delta', delta:{type:'text_delta', text}}, {type:'message_delta', delta:{stop_reason:'end_turn'}, usage:{output_tokens:500}}];
  return new Response(ev.map(e => 'data: ' + JSON.stringify(e) + '\n').join(''), {status:200});
};

const cors = {'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type,authorization,anthropic-beta', 'access-control-allow-methods':'GET,POST,OPTIONS'};
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS'){ res.writeHead(204, cors); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const url = new URL(req.url, 'http://x');
  const event = {requestContext:{http:{method:req.method}}, rawPath:url.pathname.replace(/^\/claude$/, '/'), headers:req.headers, body: body || undefined};
  if (url.pathname === '/claude'){
    return claude(event, {start:(s, h) => res.writeHead(s, {...h, ...cors}), write:c => res.write(c), end:() => res.end()});
  }
  const r = await api(event);
  res.writeHead(r.statusCode, {...(r.headers || {}), ...cors}); res.end(r.body || '');
}).listen(+process.argv[2] || 8787, () => console.log('local server ready'));
