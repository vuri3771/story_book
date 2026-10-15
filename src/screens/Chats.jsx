import { useStore, go, commit, toast } from '../lib/store';
import { storyOf, personaOf, coverOf, plain, ago } from '../lib/helpers';
import { run, isAdultChat } from '../lib/engine';
import { Badge19 } from '../render';
import { ask } from '../sheets';
import { Icon } from '../icons';

export default function Chats(){
  const S = useStore();
  const chats = S.chats.slice().sort((a,b) => (b.updated||0) - (a.updated||0)).filter(c => storyOf(c));
  const del = c => ask(`'${storyOf(c).title}' 대화를 삭제할까요? 되돌릴 수 없어요.`, '삭제', () => {
    if (run.busy && run.chatId === c.id) run.abort?.abort();
    S.chats = S.chats.filter(x => x.id !== c.id); commit(); toast('대화를 삭제했어요.');
  });
  return <>
    <div className="hdr"><div className="t">이어서 하기</div></div>
    <div className="scroll"><div className="page">
      {chats.length ? <>
        <div className="sec">대화 {chats.length}개</div>
        {chats.map(c => {
          const st = storyOf(c), last = c.messages[c.messages.length-1];
          return <div key={c.id} className="crow">
            <button className="row" onClick={() => go('chat', {id:c.id})}>
              <img className="th" src={coverOf(st)} alt=""/>
              <div className="mid"><b>{st.title}{isAdultChat(c, st) && <Badge19 className="inline"/>}</b><span>{c.branchOf ? '분기 · ' : ''}{personaOf(c)?.name || '나'} · {c.messages.filter(m => m.role === 'assistant').length}턴 · {plain(last?.text || '').slice(0, 50)}</span></div>
              <small>{ago(c.updated)}</small>
            </button>
            <button className="icon-btn" aria-label="대화 삭제" onClick={() => del(c)}><Icon n="trash"/></button>
          </div>;
        })}
      </> : <div className="empty-box" style={{marginTop:24}}>진행 중인 대화가 없어요. 스토리에서 새 대화를 시작해보세요.</div>}
    </div></div>
  </>;
}
