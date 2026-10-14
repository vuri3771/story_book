// 서버(AWS) 연결 : VITE_API_URL 이 있을 때만 켜진다
// 브라우저 저장소(IndexedDB)는 그대로 두고, 바뀐 항목만 골라 DynamoDB 로 올린다
// 지갑은 서버가 정본이라 올리지 않고 받아오기만 한다
import { S, setState, notify, save, toast } from './store';
import { defaultState } from './constants';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const remoteOn = !!API;
const TOKEN_KEY = 'storychat_token', SYNCED_KEY = 'storychat_synced';

// ----- 기기 토큰 : 이 값이 곧 계정이다 -----
function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} }
export function token(){
  let t = lsGet(TOKEN_KEY);
  if (!t){ t = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, ''); lsSet(TOKEN_KEY, t); }
  return t;
}
export const authHeader = () => ({authorization:'Bearer ' + token()});

async function call(path, body){
  const res = await fetch(API + path, {method: body ? 'POST' : 'GET', headers:{...authHeader(), ...(body ? {'content-type':'application/json'} : {})}, body: body && JSON.stringify(body)});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `서버 오류 ${res.status}`);
  return j;
}

// ----- 지갑 -----
export async function refreshWallet(){
  if (!remoteOn) return;
  try { const w = await call('/wallet'); S.wallet = {balance:w.balance, history:w.history || []}; notify(); save(); }
  catch(e){ console.warn('지갑 불러오기 실패', e); }
}
export async function testCharge(pkg, method){
  const w = await call('/wallet/test-charge', {pkg, method});
  S.wallet = {balance:w.balance, history:w.history || []}; notify(); save();
}

// ----- 상태를 항목으로 쪼개기 -----
// 이미지 data URL 은 img#<해시> 로 따로 빼고 자리에는 img:<해시> 를 남긴다
const IMG_FIELDS = st => [
  [st, 'cover'],
  ...(st.characters || []).map(c => [c, 'image']),
  ...(st.images || []).map(i => [i, 'data'])
];
function hash(s){ // cyrb53, 충돌 걱정 없을 만큼 길게 두 번
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + s.length.toString(36);
}
const CHUNK = 280 * 1024; // 한 항목 최대 400KB, 한글은 3바이트라 여유 있게
function toItems(state){
  const items = new Map();
  const {apiKey, naiKey, ...settings} = state.settings || {};
  items.set('meta', JSON.stringify({settings, personas:state.personas, shortcuts:state.shortcuts, usage:state.usage}));
  for (const st0 of state.stories || []){
    const st = JSON.parse(JSON.stringify(st0));
    for (const [o, f] of IMG_FIELDS(st)){
      const v = o[f];
      if (typeof v === 'string' && v.startsWith('data:')){ const k = 'img#' + hash(v); items.set(k, v); o[f] = 'img:' + k.slice(4); }
    }
    items.set('story#' + st.id, JSON.stringify(st));
  }
  for (const c of state.chats || []){
    const {messages = [], ...rest} = c;
    const parts = []; let cur = [], size = 2;
    for (const m of messages){
      const s = JSON.stringify(m).length * 3;
      if (cur.length && size + s > CHUNK){ parts.push(cur); cur = []; size = 2; }
      cur.push(m); size += s;
    }
    parts.push(cur);
    items.set('chat#' + c.id, JSON.stringify({...rest, parts:parts.length}));
    parts.forEach((p, i) => items.set(`chat#${c.id}#${i}`, JSON.stringify(p)));
  }
  return items;
}

// ----- 올리기 -----
let synced = (() => { try { return JSON.parse(lsGet(SYNCED_KEY)) || {}; } catch(e){ return {}; } })();
let syncTimer, syncing = false, again = false;
export function scheduleSync(){
  if (!remoteOn) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 1500);
}
export async function pushNow(){
  if (!remoteOn) return;
  if (syncing){ again = true; return; }
  syncing = true;
  try {
    const items = toItems(S);
    const put = [], del = [];
    for (const [k, d] of items){ const h = hash(d); if (synced[k] !== h) put.push({k, d, h}); }
    for (const k of Object.keys(synced)) if (!items.has(k)) del.push(k);
    // 요청 하나가 4MB 를 넘지 않게 나눠 보낸다
    let batch = [], size = 0;
    const flush = async (dels = []) => {
      if (!batch.length && !dels.length) return;
      await call('/sync', {put: batch.map(({k, d}) => ({k, d})), del: dels});
      for (const p of batch) synced[p.k] = p.h;
      for (const k of dels) delete synced[k];
      lsSet(SYNCED_KEY, JSON.stringify(synced));
      batch = []; size = 0;
    };
    for (const p of put){
      const s = p.d.length * 3;
      if (batch.length && (size + s > 4e6 || batch.length >= 200)) await flush();
      batch.push(p); size += s;
    }
    await flush();
    for (let i = 0; i < del.length; i += 200) await flush(del.slice(i, i + 200));
  } catch(e){
    console.warn('서버 저장 실패', e);
  } finally {
    syncing = false;
    if (again){ again = false; scheduleSync(); }
  }
}

// ----- 받기 : 새 기기이거나 연결 코드를 바꿨을 때 -----
export async function pullState(){
  const {items} = await call('/state');
  if (!items.length) return false;
  const map = new Map(items.map(x => [x.k, x.d]));
  const meta = JSON.parse(map.get('meta') || '{}');
  const next = defaultState();
  next.settings = Object.assign(next.settings, meta.settings || {}, {apiKey:S.settings.apiKey, naiKey:S.settings.naiKey});
  if (meta.personas?.length) next.personas = meta.personas;
  if (meta.shortcuts) next.shortcuts = meta.shortcuts;
  if (meta.usage) next.usage = meta.usage;
  next.wallet = S.wallet;
  const stories = [...map].filter(([k]) => /^story#[^#]+$/.test(k)).map(([, d]) => JSON.parse(d));
  // 이미지 받아서 자리 채우기
  const need = new Set();
  for (const st of stories) for (const [o, f] of IMG_FIELDS(st)) if (typeof o[f] === 'string' && o[f].startsWith('img:')) need.add('img#' + o[f].slice(4));
  const imgs = {}, keys = [...need];
  for (let i = 0; i < keys.length; i += 20) Object.assign(imgs, (await call('/images', {keys: keys.slice(i, i + 20)})).images);
  for (const st of stories) for (const [o, f] of IMG_FIELDS(st)) if (typeof o[f] === 'string' && o[f].startsWith('img:')) o[f] = imgs['img#' + o[f].slice(4)] || '';
  next.stories = stories;
  next.chats = [...map].filter(([k]) => /^chat#[^#]+$/.test(k)).map(([k, d]) => {
    const c = JSON.parse(d), parts = c.parts || 1; delete c.parts;
    c.messages = [];
    for (let i = 0; i < parts; i++) c.messages.push(...JSON.parse(map.get(`${k}#${i}`) || '[]'));
    return c;
  });
  setState(next);
  // 받은 내용이 서버와 같다고 표시해 다시 올리지 않게 한다
  synced = {};
  for (const [k, d] of toItems(next)) synced[k] = hash(d);
  lsSet(SYNCED_KEY, JSON.stringify(synced));
  notify(); save();
  return true;
}

// 시작할 때 : 이 기기에 아무것도 없으면 서버에서 받고, 있으면 바뀐 것만 올린다
export async function startRemote(){
  if (!remoteOn) return;
  await refreshWallet();
  try {
    const empty = !S.stories.length && !S.chats.length;
    if (empty && await pullState()) toast('서버에서 불러왔어요.');
    else scheduleSync();
  } catch(e){ console.warn('서버 연결 실패', e); toast('서버에 연결하지 못했어요. 이 기기에만 저장돼요.'); }
}

// 다른 기기의 연결 코드로 바꾸기 : 이 기기 내용은 그 계정 내용으로 바뀐다
export async function switchAccount(code){
  const c = String(code).trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(c)) throw new Error('연결 코드 형식이 아니에요.');
  const old = token();
  lsSet(TOKEN_KEY, c); synced = {}; lsSet(SYNCED_KEY, null);
  try {
    await refreshWallet();
    if (!(await pullState())) throw new Error('그 코드로 저장된 내용이 없어요.');
  } catch(e){ lsSet(TOKEN_KEY, old); synced = {}; throw e; }
}
