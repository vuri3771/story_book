import { useStore, go, tab } from '../lib/store';
import { storyOf, coverOf, plain, ago, credit, importFile } from '../lib/helpers';
import { usingProxy } from '../lib/api';
import { isAdultChat } from '../lib/engine';
import { Badge19 } from '../render';
import { openSettings } from '../sheets';

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

      <div className="sec-h"><b>크레딧</b></div>
      <div className="wallet"><div><small>보유 크레딧</small><div className="wv">{credit(bal)}</div></div><button onClick={() => tab('charge')}>충전하기</button></div>
      <div style={{height:28}}/>
    </div></div>
  </>;
}
