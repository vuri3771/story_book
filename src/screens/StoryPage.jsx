import { useState } from 'react';
import { useStore, go, back, replace, commit, openSheet, closeSheet, goHome, toast } from '../lib/store';
import { genOpenings } from '../lib/recommend';
import { CharacterSheet, CharPh, Sheet } from '../sheets';
import { Badge19, Ava } from '../render';
import { uid, LITE_URL } from '../lib/constants';
import { freeStart } from '../lib/engine';
import { storyOf, personaOf, coverOf, plain, ago, deleteStory, openLite } from '../lib/helpers';
import { Icon } from '../icons';

function newChat(S, storyId, opening){
  const st = storyOf(storyId), s = S.settings;
  // 스토리에 지정된 대화 프로필과 사칭 방지 기본값이 있으면 그걸로 시작한다
  const personaId = S.personas.some(p => p.id === st.personaId) ? st.personaId : S.personas[0]?.id;
  const c = {id:uid(), storyId, personaId, messages:[], memory:'', notes:'', summarizedUpTo:0, cost:0,
    model:s.model, effort:s.effort, length:s.length, style:'novel', customStyle:'', noImpersonate:st.noImpersonate !== false, updated:Date.now()};
  const o = opening || openingsOf(st)[0];
  if (o.free){ c.freeStart = true; S.chats.push(c); commit(); freeStart(c); return c; }
  if (o.text) c.messages.push({role:'assistant', text:o.text});
  if (o.setup?.trim()){ c.setup = o.setup; c.openingTitle = o.title; }
  S.chats.push(c); commit(); return c;
}
// 시나리오 없이 INFO 창만 띄우고 내 첫 *행동*으로 장면을 연다
const FREE = {title:'자유 시작', free:true};
const FREE_DESC = '시나리오 없이 INFO 창만 띄워요. 첫 입력에 *행동·상황*을 써서 장면을 직접 열어요.';

// 시작 장면이 여러 개인 스토리는 새 대화 때 고른다
export const openingsOf = st => [{title:st.greetingTitle || '기본 시작', text:st.greeting || '', setup:st.greetingSetup || ''}, ...(st.altGreetings || []).filter(g => g.text?.trim())];
const preview = t => String(t).replace(/```[\s\S]*?```/g, '').replace(/^\s*-\s*/gm, '').replace(/\{\{?user\}\}?/g, '나').replace(/[*"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);

function OpeningSheet({st, onPick}){
  const list = openingsOf(st);
  const pick = g => { closeSheet(); onPick(g); };
  return <Sheet><h3>시작 시나리오 고르기</h3>
    <div className="openings">
      {list.map((g, i) => <button key={i} onClick={() => pick(g)}><b>{g.title || `시작 ${i + 1}`}</b><span>{preview(g.setup || g.text) || '빈 장면으로 시작'}</span></button>)}
      <button onClick={() => pick(FREE)}><b>{FREE.title}</b><span>{FREE_DESC}</span></button>
      <button className="rand" onClick={() => pick(list[Math.floor(Math.random() * list.length)])}><b>무작위로 시작</b></button>
    </div>
    <div className="sb"><button className="btn" onClick={closeSheet}>취소</button></div>
  </Sheet>;
}

export default function StoryPage({id}){
  const S = useStore();
  const [making, setMaking] = useState(false);
  const st = storyOf(id);
  if (!st){ queueMicrotask(back); return null; }
  const chats = S.chats.filter(c => c.storyId === id).sort((a,b) => (b.updated||0) - (a.updated||0));
  const cast = st.characters.filter(x => x.name);
  const opens = openingsOf(st);
  const start = g => { const c = newChat(S, id, g); replace('chat', {id:c.id}); };
  const make = async () => {
    if (making) return; setMaking(true);
    try { const l = await genOpenings(st, 3); toast(`시작 시나리오 ${l.length}개를 만들었어요. 편집에서 고칠 수 있어요.`); }
    catch(e){ toast(e.message); } finally { setMaking(false); }
  };
  return <>
    <div className="hdr"><button className="icon-btn" aria-label="뒤로" onClick={back}><Icon n="back"/></button><div className="t">{st.title}</div><button className="icon-btn" aria-label="편집" onClick={() => go('editor', {id})}><Icon n="pen"/></button></div>
    <div className="scroll">
      <div className="hero"><img src={coverOf(st)} alt=""/><div className="ov"><h1>{st.title || '제목 없음'}{st.adult && <Badge19 className="inline"/>}</h1><p>{st.intro}</p></div></div>
      <div className="btns" style={{paddingTop:14}}><button className="btn red" onClick={() => {
        if (opens.length > 1) openSheet(<OpeningSheet st={st} onPick={start}/>); else start();
      }}>새 대화 시작</button>
        <a className="btn" style={{textDecoration:'none', textAlign:'center'}} href={LITE_URL} target="_blank" rel="noopener noreferrer" onClick={() => openLite(st)}>claude.ai에서 하기</a></div>
      <div className="sec-h"><b>시작 시나리오 {opens.length}개</b>{opens.length > 1 && <button onClick={() => start(opens[Math.floor(Math.random() * opens.length)])}>무작위로 시작</button>}</div>
      <div className="scen">
        {opens.map((g, i) => <button key={i} onClick={() => start(g)}><b>{g.title || `시작 ${i + 1}`}</b><span>{preview(g.setup || g.text) || '빈 장면으로 시작'}</span><em>이걸로 시작 ›</em></button>)}
        <button onClick={() => start(FREE)}><b>{FREE.title}</b><span>{FREE_DESC}</span><em>이걸로 시작 ›</em></button>
        <button className="gen" disabled={making} onClick={make}>{making ? 'AI가 시나리오 3개를 쓰는 중… (1분쯤)' : '+ AI로 시작 시나리오 3개 만들기'}</button>
      </div>
      {cast.length > 0 && <>
        <div className="sec">등장인물 {cast.length}명</div>
        <div className="cast">{cast.map((x, i) => {
          const role = (x.profile.match(/^\s*\[([^\]]+)\]/) || [])[1]?.replace(/\s*\d+\s*\/\s*\d+\s*$/, '');
          return <button key={x.id || i} onClick={() => openSheet(<CharacterSheet ch={x}/>)}>
            {x.image ? <Ava ch={x} className="ph"/> : <CharPh name={x.name}/>}
            <span>{x.name}</span>{role && <small>{role}</small>}
          </button>;
        })}</div>
      </>}
      {chats.length > 0 && <div className="sec">진행 중인 대화</div>}
      {chats.map(c => <button key={c.id} className="row" onClick={() => go('chat', {id:c.id})}><div className="mid"><b>{personaOf(c)?.name || '나'}의 이야기 · {c.messages.filter(m => m.role === 'assistant').length}턴</b><span>{plain(c.messages[c.messages.length-1]?.text || '').slice(0, 60)}</span></div><small>{ago(c.updated)}</small></button>)}
      {st.guide && <><div className="sec">플레이 가이드</div><div style={{padding:'0 16px 24px', whiteSpace:'pre-wrap', lineHeight:1.7, color:'var(--narr)'}}>{st.guide}</div></>}
      <div style={{padding:'8px 16px 32px'}}><button className="linkbtn danger" onClick={() => deleteStory(id, goHome)}>스토리 삭제</button></div>
    </div>
  </>;
}
