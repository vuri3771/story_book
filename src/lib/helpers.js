import { S, setState, commit, closeSheet, goHome, toast } from './store';
import { MODELS, defaultState, newStory, uid } from './constants';
import { ask } from '../sheets';

export const escT = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export const chatById = id => S.chats.find(c => c.id === id);
// 스토리와 그 대화를 함께 지운다, 다른 기기에는 다음 동기화 때 지워진다
export function deleteStory(id, after){
  ask('이 스토리와 대화를 모두 삭제할까요?', '삭제', () => {
    S.stories = S.stories.filter(s => s.id !== id); S.chats = S.chats.filter(c => c.storyId !== id);
    commit(); toast('스토리를 삭제했어요.'); after?.();
  });
}
export const storyOf = c => S.stories.find(s => s.id === (c?.storyId ?? c));
export const personaOf = c => S.personas.find(p => p.id === c?.personaId) || S.personas[0];
export const modelOf = id => MODELS.find(m => m.id === id) || MODELS[1];
export const mainChar = st => st?.characters?.find(x => x.name)?.name || '캐릭터';
export function fill(t, c){ const st = storyOf(c); const u = personaOf(c)?.name || '나', ch = mainChar(st);
  return String(t||'').replaceAll('{{user}}', u).replaceAll('{{char}}', ch).replaceAll('{user}', u).replaceAll('{char}', ch); }
// 달러 표시 : 1센트 아래는 소수 셋째 자리까지
export const usd = n => '$' + (Math.abs(n) < 0.01 && n ? n.toFixed(3) : (n || 0).toFixed(2));
// 이번 달 쓴 달러 : 서버 기록이 있으면 그걸, 없으면(내 키 모드) 이 기기 누적만 알 수 있다
export const monthUsd = S => { const m = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7); return (S.spend?.days || []).filter(d => d.day.startsWith(m)).reduce((a, d) => a + d.usd, 0); };
export function won(n){ return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('ko-KR'); }
export function plain(t){ return String(t).replace(/```[\s\S]*?```/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[*|"]/g, '').replace(/\s+/g, ' ').trim(); }
export function ago(t){ if (!t) return ''; const m = (Date.now() - t) / 60000; return m < 1 ? '방금' : m < 60 ? Math.floor(m) + '분 전' : m < 1440 ? Math.floor(m/60) + '시간 전' : Math.floor(m/1440) + '일 전'; }

// 이미지가 없을 때 쓰는 표지
function coverSVG(title){
  let h = 0; for (const ch of String(title||'스토리')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const t = escT(String(title || '새 스토리')).slice(0, 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},45%,32%)"/><stop offset="1" stop-color="hsl(${(h+50)%360},50%,14%)"/></linearGradient></defs><rect width="300" height="400" fill="url(#g)"/><circle cx="230" cy="90" r="70" fill="hsl(${(h+30)%360},60%,70%)" opacity=".18"/><text x="24" y="350" font-family="Noto Sans KR,sans-serif" font-size="30" font-weight="700" fill="#fff">${t}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export const coverOf = st => st?.cover || coverSVG(st?.title);

// 파일 선택창을 그때그때 만들어 띄운다
export function pickFiles({accept, multiple = false}){
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}
export function readImage(file, max){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.82));
    }; img.onerror = rej; img.src = fr.result; };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

// 백업 내보내기, 키는 비운다
export function exportAll(){
  const d = JSON.parse(JSON.stringify(S)); d.settings.apiKey = ''; d.settings.naiKey = '';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], {type:'application/json'}));
  a.download = 'story-backup-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
}

// 스토리 파일 하나 또는 전체 백업을 불러온다
export async function importFile(){
  const [f] = await pickFiles({accept:'.json'}); if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.kind === 'story' && d.story){
      const st = Object.assign(newStory(), d.story, {id:uid()});
      st.characters = (st.characters||[]).map(x => ({id:uid(), image:'', ...x}));
      st.shortcuts = (st.shortcuts||[]).map(x => ({...x, id:uid()}));
      // 파일에 대화 프로필이 같이 들어 있으면 같은 이름 프로필을 갱신하거나 새로 만들고 이 스토리의 기본으로 건다
      if (d.persona?.name){
        let p = S.personas.find(x => x.name === d.persona.name);
        if (p) p.desc = d.persona.desc || p.desc;
        else S.personas.push(p = {id:uid(), name:d.persona.name, desc:d.persona.desc || ''});
        st.personaId = p.id;
      }
      // 같은 제목이 이미 있으면 그 자리를 새 내용으로 바꿀지 묻는다, id 를 유지해서 진행 중인 대화가 그대로 이어진다
      const old = S.stories.find(x => x.title === st.title);
      const add = () => { S.stories.push(st); closeSheet(); commit(); goHome(); toast(`'${st.title}' 스토리를 추가했어요.`); };
      if (!old) return add();
      ask(`'${st.title}' 스토리가 이미 있어요. 새 파일 내용으로 바꿀까요? 진행 중인 대화는 그대로 남아요.`, '바꾸기', () => {
        Object.assign(old, st, {id:old.id, created:old.created});
        commit(); goHome(); toast(`'${st.title}' 스토리를 새 내용으로 바꿨어요.`);
      });
      return;
    }
    const key = S.settings.apiKey, nk = S.settings.naiKey;
    const next = Object.assign(defaultState(), d);
    next.settings = Object.assign(defaultState().settings, d.settings, {apiKey:key, naiKey:nk});
    setState(next); closeSheet(); commit(); goHome(); toast('불러왔어요.');
  } catch(e){ toast('백업 파일을 읽지 못했어요.'); }
}
