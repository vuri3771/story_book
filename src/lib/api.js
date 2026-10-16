// ================= API =================
// VITE_CLAUDE_PROXY_URL 이 있으면 키 없이 그 주소(예: Lambda)로 보내고, 키는 서버가 붙인다
// 없으면 원본처럼 브라우저에 저장한 키로 api.anthropic.com 을 직접 부른다
import { S, save } from './store';
import { NAI_BASE } from './constants';
import { modelOf } from './helpers';
import { openSettings } from '../sheets';
import { authHeader, refreshWallet } from './remote';

const PROXY = import.meta.env.VITE_CLAUDE_PROXY_URL || '';

// 서버 키 모드에서는 끝날 때마다 서버에 기록된 쓴 금액을 다시 받아온다
export async function callClaude(args){
  try { return await callClaudeRaw(args); }
  finally { if (PROXY && modelOf(args.model).provider !== 'nai') refreshWallet(); }
}

async function callClaudeRaw({model, system, messages, max_tokens, effort, onText, signal}){
  const md = modelOf(model);
  if (md.provider === 'nai') return callNovelAI({system, messages, max_tokens, onText, signal});
  if (!PROXY && !S.settings.apiKey){ openSettings(); throw new Error('먼저 API 키를 넣어주세요.'); }
  const body = {model, max_tokens, system, messages, stream: !!onText};
  if (effort) body.output_config = {effort};
  const headers = PROXY
    ? {'content-type':'application/json', ...authHeader()}
    : {'content-type':'application/json', 'x-api-key':S.settings.apiKey, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'};
  const useFb = md.fb && !S.settings.noFallback;
  if (useFb){ body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
  let res = await safeFetch(PROXY || 'https://api.anthropic.com/v1/messages', {method:'POST', headers, body:JSON.stringify(body), signal});
  if (res.status === 400 && useFb){
    const t = await res.text();
    if (/fallback|beta/i.test(t)){ S.settings.noFallback = true; save(); return callClaudeRaw({model, system, messages, max_tokens, effort, onText, signal}); }
    throw new Error(apiError(400, t));
  }
  if (!res.ok) throw new Error(apiError(res.status, await res.text()));
  const usage = {in:0, out:0, cw:0, cr:0};
  const addU = u => { if (!u) return; usage.in += u.input_tokens||0; usage.cw += u.cache_creation_input_tokens||0; usage.cr += u.cache_read_input_tokens||0; if (u.output_tokens) usage.out = u.output_tokens; };
  if (!onText){ const j = await res.json(); addU(j.usage); return {text:(j.content||[]).filter(b => b.type === 'text').map(b => b.text).join(''), usage, stop:j.stop_reason}; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '', stop = null;
  try {
    while (true){
      if (signal?.aborted){ try { reader.cancel(); } catch(e){} stop = 'aborted'; break; }
      const {done, value} = await reader.read(); if (done) break;
      buf += dec.decode(value, {stream:true});
      let k;
      while ((k = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, k).trim(); buf = buf.slice(k+1);
        if (!line.startsWith('data:')) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch(e){ continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta'){ text += ev.delta.text; onText(text); }
        else if (ev.type === 'message_start') addU(ev.message?.usage);
        else if (ev.type === 'message_delta'){ addU(ev.usage); stop = ev.delta?.stop_reason || stop; }
        else if (ev.type === 'error') throw new Error(ev.error?.message || '응답 중 오류가 났어요.');
      }
    }
  } catch(e){ if (e.name !== 'AbortError') throw e; stop = 'aborted'; }
  return {text, usage, stop};
}

// NovelAI 는 OpenAI 호환 chat completions 형식, 구독 정액이라 토큰 요금은 0으로 센다
async function callNovelAI({system, messages, max_tokens, onText, signal}){
  const s = S.settings;
  if (!s.naiKey){ openSettings(); throw new Error('먼저 NovelAI 키를 넣어주세요.'); }
  const flat = c => Array.isArray(c) ? c.map(b => b.text || '').join('\n\n') : c;
  const sys = flat(system), hist = messages.map(m => ({role:m.role, content:flat(m.content)}));
  // 요금제마다 한 번에 받는 글 길이(문맥)가 다르다(Tablet 12288). 넘치면 400 이 나니 보내기 전에 맞춰 줄인다
  // 글자당 토큰 비율과 한도는 한 번 오류가 나면 그 숫자로 배워서 다음부터 맞춘다
  let limit = s.naiCtx || 12288, ratio = s.naiRatio || 1.1, res, out;
  for (let attempt = 0; attempt < 2; attempt++){
    out = Math.min(max_tokens, Math.max(1500, Math.floor(limit * 0.3)));
    const msgs = fitNai(sys, hist, Math.floor((limit - out) * ratio * 0.95));
    const body = {model:s.naiModel || 'glm-4-6', messages:msgs, max_tokens:out, stream: !!onText};
    try {
      res = await safeFetch((s.naiBase || NAI_BASE).replace(/\/+$/, '') + '/chat/completions', {method:'POST', signal, body:JSON.stringify(body),
        headers:{'content-type':'application/json', 'authorization':'Bearer ' + s.naiKey}});
    } catch(e){
      if (e.name === 'AbortError') return {text:'', usage:{in:0, out:0, cw:0, cr:0}, stop:'aborted'};
      throw new Error('NovelAI에 연결하지 못했어요. 브라우저가 접속을 막았을 수 있어요. 설정의 NovelAI 주소를 확인해주세요.');
    }
    if (res.status !== 400 || attempt) break;
    const t = await res.clone().text();
    const m = t.match(/got (\d+) \+ (\d+), max is (\d+)/);
    if (!m) break;
    // 실제 토큰 수로 글자당 비율을 다시 재고, 한도를 기억한 뒤 한 번 더 보낸다
    const chars = msgs.reduce((n, x) => n + x.content.length, 0);
    ratio = chars / +m[1]; limit = +m[3];
    s.naiRatio = +ratio.toFixed(3); s.naiCtx = limit;
  }
  if (!res.ok){
    const t = await res.text();
    if (res.status === 401) throw new Error('NovelAI 키가 맞지 않아요. 설정에서 키를 확인해주세요.');
    if (res.status === 402 || res.status === 403) throw new Error('NovelAI 구독이 필요하거나 이 모델을 쓸 수 없는 요금제예요.');
    throw new Error(apiError(res.status, t));
  }
  const usage = {in:0, out:0, cw:0, cr:0};
  const clean = t => t.replace(/<think>[\s\S]*?(<\/think>\s*|$)/g, '');
  if (!onText){ const j = await res.json(); return {text:clean(j.choices?.[0]?.message?.content || ''), usage, stop:j.choices?.[0]?.finish_reason}; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '', stop = null;
  try {
    while (true){
      if (signal?.aborted){ try { reader.cancel(); } catch(e){} stop = 'aborted'; break; }
      const {done, value} = await reader.read(); if (done) break;
      buf += dec.decode(value, {stream:true});
      let k;
      while ((k = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, k).trim(); buf = buf.slice(k+1);
        if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch(e){ continue; }
        if (ev.error) throw new Error(ev.error.message || '응답 중 오류가 났어요.');
        const ch = ev.choices?.[0];
        if (ch?.delta?.content){ text += ch.delta.content; onText(clean(text)); }
        if (ch?.finish_reason) stop = ch.finish_reason;
      }
    }
  } catch(e){ if (e.name !== 'AbortError') throw e; stop = 'aborted'; }
  return {text:clean(text), usage, stop};
}

// NovelAI 문맥 한도(글자 수 budget)에 맞춰 줄인다
// 1. 최근 대화는 최소 4개 남기고, 오래된 것부터 뺀다
// 2. 그래도 넘치면 시스템 프롬프트에서 이미지 목록, 최근 대화에 안 나온 인물, 인물별 크랙 대화 메모 순으로 뺀다
// 3. 그래도 넘치면 시스템 프롬프트 가운데를 잘라 앞(형식 규칙)과 끝(진행 원칙)을 남긴다
function fitNai(sys, hist, budget){
  const keepMin = Math.min(4, hist.length);
  const tail = n => hist.slice(hist.length - n);
  const size = a => a.reduce((n, x) => n + x.content.length, 0);
  if (sys.length + size(tail(keepMin)) > budget){
    const recent = tail(6).map(x => x.content).join('\n');
    // 인물 프로필 안의 크랙 메모 블록은 그 인물 칸에 붙어 있게 표시를 바꿔 둔다
    let parts = sys.replace(/\n\n\[크랙 대화에서 보인 모습\]/g, '\n\n⟦크랙⟧').split(/\n\n(?=\[)/);
    const shrink = [
      p => !p.startsWith('[이미지]'),
      p => { const m = p.match(/^\[등장인물: ([^\]]+)\]/); return !m || recent.includes(m[1].split(' ')[0]) || recent.includes(m[1]); },
    ];
    for (const keep of shrink){ if (parts.join('\n\n').length + size(tail(keepMin)) <= budget) break; parts = parts.filter(keep); }
    sys = parts.join('\n\n');
    if (sys.length + size(tail(keepMin)) > budget) sys = sys.replace(/\n\n⟦크랙⟧[\s\S]*?(?=\n\n\[|$)/g, '');
    sys = sys.replace(/⟦크랙⟧/g, '[크랙 대화에서 보인 모습]');
    const room = budget - size(tail(keepMin));
    if (sys.length > room){ const half = Math.max(500, Math.floor(room / 2)); sys = sys.slice(0, half) + '\n…(줄임)…\n' + sys.slice(-half); }
  }
  let n = keepMin;
  while (n < hist.length && sys.length + size(tail(n + 1)) <= budget) n++;
  return [{role:'system', content:sys}, ...tail(n)];
}

// 일부 미리보기 환경은 fetch 에 AbortSignal 을 넘기지 못해서 signal 없이 다시 보낸다
async function safeFetch(url, opts){
  try { return await fetch(url, opts); }
  catch(e){
    if (opts?.signal && (e.name === 'DataCloneError' || /clone/i.test(e.message))){ const o = {...opts}; delete o.signal; return await fetch(url, o); }
    if (e.name === 'AbortError') throw e;
    if (e instanceof TypeError) throw new Error('서버에 연결하지 못했어요. 네트워크 상태를 확인해주세요.');
    throw e;
  }
}
function apiError(status, t){
  let msg = t; try { msg = JSON.parse(t).error?.message || t; } catch(e){}
  if (status === 401) return PROXY ? '서버 인증에 실패했어요. 새로고침 후 다시 시도해주세요.' : 'API 키가 맞지 않아요. 설정에서 키를 확인해주세요.';
  if (status === 429) return '요청이 너무 많아요. 잠시 후 다시 보내주세요.';
  if (status === 529 || status >= 500) return '서버가 바빠요. 잠시 후 다시 시도해주세요.';
  if (/credit|balance/i.test(msg)) return 'Anthropic 잔액이 부족해요. console.anthropic.com에서 충전해주세요.';
  return `오류 ${status}: ${String(msg).slice(0, 200)}`;
}
export function costOf(u, modelId){ const m = modelOf(modelId); return (u.in * m.in + u.cw * m.in * 1.25 + u.cr * m.cr + u.out * m.out) / 1e6 * S.settings.krw; }
export function track(u, modelId, chat, msg){
  const k = costOf(u, modelId);
  S.usage.krw = (S.usage.krw || 0) + k;
  if (chat) chat.cost = (chat.cost || 0) + k;
  if (msg){ msg.cost = (msg.cost || 0) + k; const tot = u.in + u.cr + u.cw; msg.cache = tot ? Math.round(u.cr / tot * 100) : 0; }
  if (msg && chat) chat.lastUsage = u;
  return k;
}
export const usingProxy = !!PROXY;
