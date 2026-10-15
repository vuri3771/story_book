import { useRef } from 'react';
import { useStore, go } from '../lib/store';
import { coverOf, importFile, deleteStory } from '../lib/helpers';
import { Icon } from '../icons';
import { Badge19 } from '../render';

export default function Stories(){
  const S = useStore();
  // 카드를 꾹 누르거나 오른쪽 클릭하면 삭제를 묻는다
  const press = useRef({t:0, fired:0});
  const hold = id => ({
    onPointerDown: e => { if (e.pointerType === 'mouse') return; clearTimeout(press.current.t); press.current.t = setTimeout(() => { press.current.fired = Date.now(); navigator.vibrate?.(10); deleteStory(id); }, 550); },
    onPointerUp: () => clearTimeout(press.current.t), onPointerCancel: () => clearTimeout(press.current.t), onPointerLeave: () => clearTimeout(press.current.t),
    onContextMenu: e => { e.preventDefault(); if (Date.now() - press.current.fired > 800) deleteStory(id); },
  });
  return <>
    <div className="hdr"><div className="t">내 스토리</div><button className="icon-btn" aria-label="새 스토리" onClick={() => go('editor', {id:null})}><Icon n="plus"/></button></div>
    <div className="scroll"><div className="page">
      <div className="sec">스토리 {S.stories.length}개</div>
      <div className="grid">
        {S.stories.map(st => <button key={st.id} className="scard" {...hold(st.id)} onClick={() => { if (Date.now() - press.current.fired > 800) go('story', {id:st.id}); }}><img className="cv" src={coverOf(st)} alt=""/>{st.adult && <Badge19 className="corner"/>}<div className="nm">{st.title || '제목 없음'}</div><div className="ds">{st.intro}</div></button>)}
        <button className="scard new" onClick={() => go('editor', {id:null})}><b>+</b>새 스토리 만들기</button>
      </div>
      <div style={{padding:'0 16px 28px'}}><button className="linkbtn" onClick={importFile}>+ 스토리 파일 가져오기</button><div className="hint-sm">카드를 꾹 누르면 삭제할 수 있어요.</div></div>
    </div></div>
  </>;
}
