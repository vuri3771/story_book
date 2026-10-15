import { useStore, go, back, replace, commit, openSheet } from '../lib/store';
import { CharacterSheet, CharPh } from '../sheets';
import { Badge19 } from '../render';
import { uid } from '../lib/constants';
import { storyOf, personaOf, coverOf, plain, ago } from '../lib/helpers';
import { Icon } from '../icons';

function newChat(S, storyId){
  const st = storyOf(storyId), s = S.settings;
  const c = {id:uid(), storyId, personaId:S.personas[0]?.id, messages:[], memory:'', notes:'', summarizedUpTo:0, cost:0,
    model:s.model, effort:s.effort, length:s.length, style:'novel', customStyle:'', noImpersonate:true, updated:Date.now()};
  if (st.greeting) c.messages.push({role:'assistant', text: st.greeting});
  S.chats.push(c); commit(); return c;
}

export default function StoryPage({id}){
  const S = useStore();
  const st = storyOf(id);
  if (!st){ queueMicrotask(back); return null; }
  const chats = S.chats.filter(c => c.storyId === id).sort((a,b) => (b.updated||0) - (a.updated||0));
  const cast = st.characters.filter(x => x.name);
  return <>
    <div className="hdr"><button className="icon-btn" aria-label="뒤로" onClick={back}><Icon n="back"/></button><div className="t">{st.title}</div><button className="icon-btn" aria-label="편집" onClick={() => go('editor', {id})}><Icon n="pen"/></button></div>
    <div className="scroll">
      <div className="hero"><img src={coverOf(st)} alt=""/><div className="ov"><h1>{st.title || '제목 없음'}{st.adult && <Badge19 className="inline"/>}</h1><p>{st.intro}</p></div></div>
      <div className="btns" style={{paddingTop:14}}><button className="btn red" onClick={() => { const c = newChat(S, id); replace('chat', {id:c.id}); }}>새 대화 시작</button></div>
      {cast.length > 0 && <>
        <div className="sec">등장인물 {cast.length}명</div>
        <div className="cast">{cast.map((x, i) => {
          const role = (x.profile.match(/^\s*\[([^\]]+)\]/) || [])[1]?.replace(/\s*\d+\s*\/\s*\d+\s*$/, '');
          return <button key={x.id || i} onClick={() => openSheet(<CharacterSheet ch={x}/>)}>
            {x.image ? <img className="ph" src={x.image} alt=""/> : <CharPh name={x.name}/>}
            <span>{x.name}</span>{role && <small>{role}</small>}
          </button>;
        })}</div>
      </>}
      {chats.length > 0 && <div className="sec">진행 중인 대화</div>}
      {chats.map(c => <button key={c.id} className="row" onClick={() => go('chat', {id:c.id})}><div className="mid"><b>{personaOf(c)?.name || '나'}의 이야기 · {c.messages.filter(m => m.role === 'assistant').length}턴</b><span>{plain(c.messages[c.messages.length-1]?.text || '').slice(0, 60)}</span></div><small>{ago(c.updated)}</small></button>)}
      {st.guide && <><div className="sec">플레이 가이드</div><div style={{padding:'0 16px 24px', whiteSpace:'pre-wrap', lineHeight:1.7, color:'var(--narr)'}}>{st.guide}</div></>}
    </div>
  </>;
}
