// 앱 상태 저장소
// S 는 원본처럼 직접 고치고 commit() 으로 화면 갱신과 저장을 함께 건다
// 스트리밍처럼 저장이 필요 없는 갱신은 notify() 만 부른다
import { useSyncExternalStore } from 'react';
import { defaultState, DEFAULT_SHORTCUTS } from './constants';
import { load, saveNow } from './storage';

export let S = defaultState();
export function setState(next){ S = next; }

let ver = 0;
const listeners = new Set();
const subscribe = l => { listeners.add(l); return () => listeners.delete(l); };
export function notify(){ ver++; listeners.forEach(l => l()); }
export function useStore(){ useSyncExternalStore(subscribe, () => ver); return S; }

// 저장 뒤에 할 일(서버 동기화)을 main 에서 끼워 넣는다
let afterSave = null;
export function onSaved(fn){ afterSave = fn; }
let saveTimer;
export function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(async () => { if (!(await saveNow(S))) toast('저장 공간이 부족해요. 이미지나 오래된 대화를 지워주세요.'); afterSave?.(); }, 250); }
export function commit(){ notify(); save(); }

// 화면 상태 : 이동 스택, 시트, 사이드 메뉴, 토스트
// 이동 스택 맨 아래는 항상 탭 화면(home, stories, chats, charge, settings) 하나
export const ui = { nav:[{name:'home'}], sheet:null, sheetSeq:0, sheetClosing:false, drawer:null, drawerSeq:0, drawerClosing:false, toast:'', pendingPop:null, scTab:'all' };
// 이동할 때마다 브라우저 기록에 이동 스택을 통째로 남겨서, 휴대폰 뒤로가기와 앞으로가기 제스처가 앱 안 화면 이동이 된다
const snap = () => JSON.parse(JSON.stringify(ui.nav));
const hasHist = typeof history !== 'undefined';
function record(push){ if (!hasHist) return; try { history[push ? 'pushState' : 'replaceState']({nav:snap()}, ''); } catch(e){} }
export function go(name, props = {}){ ui.nav.push({name, props}); record(true); notify(); }
export function back(){
  // 앱이 쌓은 기록이 있으면 브라우저 뒤로가기로 처리해서 앞으로가기도 남게 한다
  if (ui.nav.length > 1 && hasHist && history.state?.nav?.length === ui.nav.length) return history.back();
  ui.nav.pop(); if (!ui.nav.length) ui.nav.push({name:'home'}); record(false); notify();
}
export function forward(){ if (hasHist) history.forward(); }
export function replace(name, props = {}){ ui.nav[ui.nav.length-1] = {name, props}; record(false); notify(); }
export function tab(name){ ui.nav = [{name}]; record(true); notify(); }

// 지워진 스토리나 대화를 가리키는 기록으로 돌아가면 그 화면부터 버린다
const alive = e => {
  const id = e.props?.id;
  if (e.name === 'chat') return S.chats.some(c => c.id === id);
  if (e.name === 'story') return S.stories.some(x => x.id === id);
  if (e.name === 'editor') return !id || S.stories.some(x => x.id === id);
  if (e.name === 'shortcut') return !e.props?.chatId || S.chats.some(c => c.id === e.props.chatId);
  return true;
};
export function startHistory(){
  if (!hasHist) return;
  record(false);
  addEventListener('popstate', ev => {
    const nav = ev.state?.nav;
    if (!Array.isArray(nav) || !nav.length) return;
    const ok = [];
    for (const e of nav){ if (!alive(e)) break; ok.push(e); }
    ui.nav = ok.length ? ok : [{name:'home'}];
    if (ok.length !== nav.length) record(false);
    closeSheet(); closeDrawer();
    notify();
  });
}
export function goHome(){ tab('home'); }

// 닫을 때 애니메이션이 끝난 뒤에 지운다
const CLOSE_MS = 200;
let sheetTimer, drawerTimer;
export function openSheet(el){ clearTimeout(sheetTimer); ui.sheet = el; ui.sheetSeq++; ui.sheetClosing = false; notify(); }
export function closeSheet(){ if (!ui.sheet || ui.sheetClosing) return; ui.sheetClosing = true; notify(); sheetTimer = setTimeout(() => { ui.sheet = null; ui.sheetClosing = false; notify(); }, CLOSE_MS); }
export function openDrawer(el){ clearTimeout(drawerTimer); ui.drawer = el; ui.drawerSeq++; ui.drawerClosing = false; notify(); }
export function closeDrawer(){ if (!ui.drawer || ui.drawerClosing) return; ui.drawerClosing = true; notify(); drawerTimer = setTimeout(() => { ui.drawer = null; ui.drawerClosing = false; notify(); }, CLOSE_MS); }
let toastTimer;
export function toast(msg){ ui.toast = msg; notify(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.toast = ''; notify(); }, 2600); }

export async function boot(){
  const d = await load();
  if (d){ S = Object.assign(defaultState(), d); S.settings = Object.assign(defaultState().settings, d.settings); if (!S.shortcuts) S.shortcuts = DEFAULT_SHORTCUTS.map(x => ({...x})); delete S.wallet; }
  notify();
}
