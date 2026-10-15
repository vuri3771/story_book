import { useStore, go, tab } from '../lib/store';
import { storyOf, coverOf, plain, ago, credit, importFile } from '../lib/helpers';
import { usingProxy } from '../lib/api';
import { isAdultChat } from '../lib/engine';
import { Badge19 } from '../render';
import { openSettings, Sheet } from '../sheets';
import { useState } from 'react';
import { openSheet, closeSheet, toast } from '../lib/store';
import { recommendIdeas, buildStory } from '../lib/recommend';

// 홈을 떠났다 와도 받아둔 추천이 남도록 화면 밖에 둔다
let recs = [], recKw = '';


export default function Home(){
  const S = useStore();
  const chats = S.chats.slice().sort((a,b) => (b.updated||0) - (a.updated||0)).filter(c => storyOf(c));
  const stories = S.stories.slice().sort((a,b) => (b.created||0) - (a.created||0));
  const bal = S.wallet?.balance || 0;
  return <>
    <div className="hdr"><div className="t">스토리챗</div><button className="pill" onClick={() => tab('charge')}>{credit(bal)} 크레딧</button></div>
    <div className="scroll"><div className="page">
      {!usingProxy && !S.settings.apiKey && <div className="banner">API 키를 넣으면 바로 대화할 수 있어요.<button onClick={openSettings}>키 입력</button></div>}
      <div className="hero-home">
        <h2>오늘은 어떤 이야기를 써볼까요?</h2>
        <p>세계관과 인물을 만들고 AI와 함께 장면을 이어가요.</p>
        <div className="hb">
          <button onClick={() => go('editor', {id:null})}>+ 새 스토리</button>
          <button className="ghost" onClick={importFile}>스토리 파일 가져오기</button>
        </div>
      </div>

      <div className="sec-h"><b>이어서 하기</b>{chats.length > 0 && <button onClick={() => tab('chats')}>전체 보기</button>}</div>
      {chats.length ? <div className="hscroll">{chats.slice(0, 8).map(c => {
        const st = storyOf(c), last = c.messages[c.messages.length-1];
        return <button key={c.id} className="ccard" onClick={() => go('chat', {id:c.id})}><img src={coverOf(st)} alt=""/>{isAdultChat(c, st) && <Badge19 className="corner"/>}<div className="cb"><b>{st.title}</b><span>{plain(last?.text || '').slice(0, 80)}</span><small>{ago(c.updated)}</small></div></button>;
      })}</div> : <div className="empty-box">아직 진행 중인 대화가 없어요</div>}

      <div className="sec-h"><b>내 스토리</b>{stories.length > 0 && <button onClick={() => tab('stories')}>전체 보기</button>}</div>
      {stories.length ? <div className="hscroll">{stories.slice(0, 10).map(st => <button key={st.id} className="scard" onClick={() => go('story', {id:st.id})}><img className="cv" src={coverOf(st)} alt=""/>{st.adult && <Badge19 className="corner"/>}<div className="nm">{st.title || '제목 없음'}</div><div className="ds">{st.intro}</div></button>)}</div>
        : <div className="empty-box">위에서 새 스토리를 만들어보세요</div>}

      <Recommend/>

      <div className="sec-h"><b>크레딧</b></div>
      <div className="wallet"><div><small>보유 크레딧</small><div className="wv">{credit(bal)}</div></div><button onClick={() => tab('charge')}>충전하기</button></div>
      <div style={{height:28}}/>
    </div></div>
  </>;
}

function Recommend(){
  const [list, setList] = useState(recs);
  const [kw, setKw] = useState(recKw);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    try { recs = await recommendIdeas(kw.trim()); recKw = kw; setList(recs); }
    catch(e){ toast('추천 실패 : ' + e.message); }
    setBusy(false);
  };
  return <>
    <div className="sec-h"><b>AI 추천 스토리</b>{list.length > 0 && <button disabled={busy} onClick={ask}>다시 추천</button>}</div>
    <div className="rec-q">
      <input value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy) ask(); }} placeholder="원하는 키워드 (비워도 돼요) 예: 학원, 로맨스, 미스터리"/>
      <button disabled={busy} onClick={ask}>{busy ? '추천 중…' : '추천 받기'}</button>
    </div>
    {busy && <div className="gen-bar"><i/></div>}
    {list.length > 0 && <div className="hscroll">{list.map((x, i) => <button key={i} className="rcard" onClick={() => openSheet(<IdeaSheet idea={x}/>)}>
      <small>{x.genre}</small><b>{x.title}</b><span>{x.hook || x.intro}</span>
    </button>)}</div>}
  </>;
}

function IdeaSheet({idea}){
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try { const st = await buildStory(idea); closeSheet(); toast('스토리를 만들었어요.'); go('story', {id:st.id}); }
    catch(e){ toast('만들기 실패 : ' + e.message); setBusy(false); }
  };
  return <Sheet>
    <h3>{idea.title}</h3>
    <div className="note">{idea.genre}</div>
    <div className="rec-body">
      <p>{idea.intro || idea.hook}</p>
      {Array.isArray(idea.cast) && idea.cast.length > 0 && <><b>등장인물</b><ul>{idea.cast.map((c, i) => <li key={i}>{String(c)}</li>)}</ul></>}
      <div className="note" style={{padding:0}}>만들기를 누르면 기본 모델이 세계관, 인물 설정, 첫 장면까지 써서 내 스토리에 추가해요. 크레딧이 조금 들어요.</div>
    </div>
    {busy && <div className="gen-bar" style={{margin:'0 20px 8px'}}><i/></div>}
    <div className="sb"><button className="btn" disabled={busy} onClick={closeSheet}>닫기</button><button className="btn dark" disabled={busy} onClick={make}>{busy ? '만드는 중… (30초쯤)' : '이 스토리 만들기'}</button></div>
  </Sheet>;
}
