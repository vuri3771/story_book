// 서버(AWS) 연결 : VITE_API_URL 이 있을 때만 켜진다
// 브라우저 저장소(IndexedDB)는 그대로 두고, 바뀐 항목만 골라 DynamoDB 로 올린다
// 지갑은 서버가 정본이라 올리지 않고 받아오기만 한다
import { S, setState, notify, save, toast } from './store';
import { defaultState, uid } from './constants';
import { run } from './engine';
import { adoptLook } from './look';

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

// ----- 전체 받기 : 서버가 4MB 씩 나눠 주면(next) 끝까지 이어 받는다. 예전 서버는 next 없이 한 번에 준다 -----
async function getState(){
  const items = []; let cur = '';
  for (let i = 0; i < 200; i++){
    const j = await call('/state' + (cur ? '?cursor=' + encodeURIComponent(cur) : ''));
    items.push(...(j.items || []));
    if (!j.next) break; cur = j.next;
  }
  return {items};
}

// ----- 끊긴 답변 되찾기 : 서버가 이 대화의 마지막 답변을 끝까지 받아 남겨 둔 것 -----
export async function fetchLast(chatId){
  if (!remoteOn) return null;
  try { return await call('/last?chat=' + encodeURIComponent(chatId)); } catch(e){ return null; }
}

// ----- 쓴 금액 : 서버가 날짜별로 기록한 것을 받아온다 -----
export async function refreshWallet(){
  if (!remoteOn) return;
  try { const u = await call('/usage'); S.spend = {days:u.days || [], totalUsd:u.totalUsd || 0, at:Date.now()}; notify(); save(); }
  catch(e){ console.warn('사용 금액 불러오기 실패', e); }
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
// 서버가 아직 sc# 를 모르면(옛 Lambda) 거절해서 저장 전체가 막힌다. 그때는 이번 실행 동안 예전처럼 meta 에 담는다
let scOff = false;
function toItems(state){
  const items = new Map();
  const {apiKey, naiKey, ...settings} = state.settings || {};
  items.set('meta', JSON.stringify({settings, personas:state.personas, usage:state.usage, ...(scOff ? {shortcuts:state.shortcuts} : {})}));
  // 단축어는 하나씩 sc#<id> 로 따로 둔다. meta 에 묶어 두면 다른 기기가 설정, 쓴 금액만 바꿔도 옛 단축어 목록으로 덮어써졌다
  if (!scOff) (state.shortcuts || []).forEach((s, o) => { s.id ||= uid(); items.set('sc#' + s.id, JSON.stringify({...s, o})); });
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

// ----- 동기화 상태 : 설정 화면에 보여준다 -----
const MAX_ITEM = 380 * 1024;
export let syncStatus = {at:0, error:'', skipped:0};
function setStatus(s){ syncStatus = s; notify(); }

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
    const put = [], del = [], skipped = [];
    for (const [k, d] of items){
      const h = hash(d); if (synced[k] === h) continue;
      // 한 항목이 서버 한도(400KB)를 넘으면 그것만 빼고 나머지는 올린다. 예전엔 하나 때문에 전부 막혔다
      if (new Blob([d]).size > MAX_ITEM){ skipped.push(k); continue; }
      put.push({k, d, h});
    }
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
    setStatus({at:Date.now(), error:'', skipped:skipped.length});
  } catch(e){
    console.warn('서버 저장 실패', e);
    // 옛 서버가 sc# 를 거절했으면 단축어를 meta 에 담는 방식으로 바로 다시 올린다
    if (!scOff && /sc#/.test(e.message)){ scOff = true; again = true; }
    else setStatus({...syncStatus, error:e.message});
  } finally {
    syncing = false;
    if (again){ again = false; scheduleSync(); }
  }
}

// ----- 받기 : 새 기기이거나 연결 코드를 바꿨을 때 -----
export async function pullState(){
  const {items} = await getState();
  if (!items.length) return false;
  const map = new Map(items.map(x => [x.k, x.d]));
  const meta = JSON.parse(map.get('meta') || '{}');
  const next = defaultState();
  next.settings = Object.assign(next.settings, meta.settings || {}, {apiKey:S.settings.apiKey, naiKey:S.settings.naiKey});
  if (meta.personas?.length) next.personas = meta.personas;
  // 단축어 : sc# 항목이 있으면 그걸, 없으면(옛 서버 자료) meta 안의 목록을 쓴다
  const scs = [...map].filter(([k]) => k.startsWith('sc#')).map(([, d]) => JSON.parse(d)).sort((a, b) => a.o - b.o).map(({o, ...s}) => s);
  if (scs.length) next.shortcuts = scs; else if (meta.shortcuts) next.shortcuts = meta.shortcuts;
  if (meta.usage) next.usage = meta.usage;
  next.spend = S.spend;
  adoptLook(next.settings.look);
  const stories = [...map].filter(([k]) => /^story#[^#]+$/.test(k)).map(([, d]) => JSON.parse(d));
  // 이미지 받아서 자리 채우기
  const need = new Set();
  for (const st of stories) for (const [o, f] of IMG_FIELDS(st)) if (typeof o[f] === 'string' && o[f].startsWith('img:')) need.add('img#' + o[f].slice(4));
  const imgs = await fetchImages([...need]);
  for (const st of stories) fillImages(st, imgs);
  next.stories = stories;
  next.chats = [...map].filter(([k]) => /^chat#[^#]+$/.test(k)).map(([k]) => assembleChat(k, map));
  setState(next);
  // 받은 내용이 서버와 같다고 표시해 다시 올리지 않게 한다
  synced = {};
  for (const [k, d] of toItems(next)) synced[k] = hash(d);
  lsSet(SYNCED_KEY, JSON.stringify(synced));
  notify(); save();
  return true;
}

// ----- 받기 도우미 -----
// 이미지 하나가 최대 380KB 라 Lambda 응답 한도(6MB)를 넘지 않게 8개씩 받는다
async function fetchImages(keys){
  const out = {};
  // 이 기기에 이미 있는 이미지는 다시 받지 않는다
  for (const st of S.stories) for (const [o, f] of IMG_FIELDS(st)){ const v = o[f]; if (typeof v === 'string' && v.startsWith('data:')) out['img#' + hash(v)] = v; }
  const missing = [...new Set(keys)].filter(k => !out[k]);
  for (let i = 0; i < missing.length; i += 8) Object.assign(out, (await call('/images', {keys: missing.slice(i, i + 8)})).images);
  return out;
}
function fillImages(st, imgs){
  for (const [o, f] of IMG_FIELDS(st)) if (typeof o[f] === 'string' && o[f].startsWith('img:')) o[f] = imgs['img#' + o[f].slice(4)] || '';
}
function assembleChat(k, map){
  const c = JSON.parse(map.get(k)), parts = c.parts || 1; delete c.parts;
  c.messages = [];
  for (let i = 0; i < parts; i++) c.messages.push(...JSON.parse(map.get(`${k}#${i}`) || '[]'));
  return c;
}
// 항목 키를 묶음 단위로 : meta, story#id, chat#id(본체와 메시지 조각 전부)
const groupOf = k => k === 'meta' ? 'meta' : (k.match(/^(story#[^#]+|chat#[^#]+|sc#[^#]+)/) || [])[1];
function grouped(entries){
  const g = new Map();
  for (const [k, d] of entries){ const gk = groupOf(k); if (!gk) continue; if (!g.has(gk)) g.set(gk, new Map()); g.get(gk).set(k, d); }
  return g;
}
// 마지막으로 맞춘 뒤(synced) 이 묶음이 바뀌었는지
function changedSinceSync(gk, items){
  const keys = items ? [...items.keys()] : [];
  const was = Object.keys(synced).filter(k => groupOf(k) === gk);
  if (was.length !== keys.length) return true;
  return keys.some(k => synced[k] !== hash(items.get(k)));
}

// ----- 다른 기기 변경 받아오기(양방향 동기화) -----
// 서버 쪽만 바뀐 묶음은 받아서 바꾸고, 이 기기만 바뀐 묶음은 그대로 두었다가 올린다
// 둘 다 바뀌었으면 대화는 더 최근에 쓴 쪽, 나머지는 이 기기 쪽을 남긴다
export async function mergeRemote(){
  if (!remoteOn || syncing) return 0;
  syncing = true;
  let applied = 0;
  try {
    const remoteMap = new Map((await getState()).items.map(x => [x.k, x.d]));
    const remote = grouped(remoteMap), local = grouped(toItems(S));
    const all = new Set([...remote.keys(), ...local.keys(), ...Object.keys(synced).map(groupOf).filter(Boolean)]);
    const apply = [];
    for (const gk of all){
      if (!changedSinceSync(gk, remote.get(gk))) continue;
      if (gk.startsWith('chat#') && run.busy && run.chatId === gk.slice(5)) continue;
      if (changedSinceSync(gk, local.get(gk))){
        if (!gk.startsWith('chat#') || !remote.has(gk) || !local.has(gk)) continue;
        const ru = JSON.parse(remote.get(gk).get(gk)).updated || 0, lu = S.chats.find(c => c.id === gk.slice(5))?.updated || 0;
        if (ru <= lu) continue;
      }
      apply.push(gk);
    }
    if (!apply.length) return 0;
    const need = [];
    for (const gk of apply) if (gk.startsWith('story#') && remote.has(gk)){
      const st = JSON.parse(remote.get(gk).get(gk));
      for (const [o, f] of IMG_FIELDS(st)) if (typeof o[f] === 'string' && o[f].startsWith('img:')) need.push('img#' + o[f].slice(4));
    }
    const imgs = need.length ? await fetchImages(need) : {};
    for (const gk of apply){
      const items = remote.get(gk);
      if (gk === 'meta'){
        const meta = JSON.parse(items.get('meta'));
        S.settings = Object.assign({}, S.settings, meta.settings || {}, {apiKey:S.settings.apiKey, naiKey:S.settings.naiKey});
        if (meta.personas?.length) S.personas = meta.personas;
        if (scOff && meta.shortcuts) S.shortcuts = meta.shortcuts;
        if (meta.usage) S.usage = meta.usage;
        adoptLook(S.settings.look);
      } else if (gk.startsWith('sc#')){
        // 단축어 하나 : 서버에서 지워졌으면 지우고, 새로 생겼으면 원래 순서 자리에 넣는다
        const id = gk.slice(3), i = S.shortcuts.findIndex(x => x.id === id);
        if (!items){ if (i >= 0) S.shortcuts.splice(i, 1); }
        else {
          const {o, ...s} = JSON.parse(items.get(gk));
          if (i >= 0) S.shortcuts[i] = s; else S.shortcuts.splice(Math.min(o ?? S.shortcuts.length, S.shortcuts.length), 0, s);
        }
      } else {
        const id = gk.split('#')[1], list = gk.startsWith('story#') ? 'stories' : 'chats';
        const i = S[list].findIndex(x => x.id === id);
        if (!items){ if (i >= 0) S[list].splice(i, 1); }
        else {
          const obj = list === 'stories' ? JSON.parse(items.get(gk)) : assembleChat(gk, remoteMap);
          if (list === 'stories') fillImages(obj, imgs);
          if (i >= 0) S[list][i] = obj; else S[list].push(obj);
        }
      }
      // 이 묶음은 이제 서버와 같다
      for (const k of Object.keys(synced)) if (groupOf(k) === gk) delete synced[k];
      if (items) for (const [k, d] of items) synced[k] = hash(d);
      applied++;
    }
    lsSet(SYNCED_KEY, JSON.stringify(synced));
    notify(); save();
    return applied;
  } catch(e){
    console.warn('서버에서 받기 실패', e);
    return 0;
  } finally {
    syncing = false;
    if (again){ again = false; scheduleSync(); }
  }
}

// 시작할 때 : 이 기기에 아무것도 없으면 통째로 받고, 있으면 다른 기기 변경을 합친 뒤 바뀐 것만 올린다
// 앱으로 돌아올 때와 열려 있는 동안 45초마다 다시 합친다
let pollTimer;
export async function startRemote(){
  if (!remoteOn) return;
  await refreshWallet();
  try {
    const empty = !S.stories.length && !S.chats.length;
    if (empty && await pullState()) toast('서버에서 불러왔어요.');
    else { if (await mergeRemote()) toast('다른 기기 변경 내용을 불러왔어요.'); scheduleSync(); }
  } catch(e){ console.warn('서버 연결 실패', e); toast('서버에 연결하지 못했어요. 이 기기에만 저장돼요.'); }
  const tick = async () => { if (document.visibilityState !== 'visible') return; if (await mergeRemote()) toast('다른 기기 변경 내용을 불러왔어요.'); refreshWallet(); };
  document.addEventListener('visibilitychange', tick);
  clearInterval(pollTimer); pollTimer = setInterval(tick, 45000);
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
