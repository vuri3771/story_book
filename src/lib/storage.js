// ================= 저장 (IndexedDB, 실패하면 localStorage) =================
import { defaultState, newStory, uid } from './constants';

const KEY = 'storychat_v2';
let _db;
function idb(){ return _db || (_db = new Promise((res, rej) => { const r = indexedDB.open('storychat', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); }

export async function load(){
  try { const db = await idb(); const v = await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); if (v) return v; } catch(e){}
  try { const v = localStorage.getItem(KEY); if (v) return JSON.parse(v); } catch(e){}
  try { const old = JSON.parse(localStorage.getItem('storychat_v1')); if (old) return migrateV1(old); } catch(e){}
  return null;
}

// 실패하면 false 를 돌려줘서 호출부가 안내를 띄운다
export async function saveNow(state){
  const data = JSON.parse(JSON.stringify(state));
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(data, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch(e){}
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch(e){ return false; }
}

function migrateV1(o){
  const s = defaultState();
  Object.assign(s.settings, {apiKey:o.settings?.apiKey || ''});
  if (o.personas?.length) s.personas = o.personas;
  for (const ch of o.characters || []){
    const st = newStory(); Object.assign(st, {id: ch.id, title: ch.name, intro: (ch.profile||'').slice(0,40), world: ch.world||'', greeting: ch.greeting||'', memory: ch.memory||'', infoOn:false});
    st.characters = [{id:uid(), name: ch.name, profile: ch.profile||'', image:''}];
    s.stories.push(st);
  }
  for (const c of o.chats || []) s.chats.push({id:c.id, storyId:c.charId, personaId:c.personaId, messages:c.messages||[], memory:c.memory||'', notes:c.notes||'', summarizedUpTo:c.summarizedUpTo||0, cost:c.cost||0, updated:Date.now()});
  return s;
}
