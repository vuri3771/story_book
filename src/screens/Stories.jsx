import { useStore, go } from '../lib/store';
import { coverOf, importFile } from '../lib/helpers';
import { Icon } from '../icons';

export default function Stories(){
  const S = useStore();
  return <>
    <div className="hdr"><div className="t">내 스토리</div><button className="icon-btn" aria-label="새 스토리" onClick={() => go('editor', {id:null})}><Icon n="plus"/></button></div>
    <div className="scroll"><div className="page">
      <div className="sec">스토리 {S.stories.length}개</div>
      <div className="grid">
        {S.stories.map(st => <button key={st.id} className="scard" onClick={() => go('story', {id:st.id})}><img className="cv" src={coverOf(st)} alt=""/><div className="nm">{st.title || '제목 없음'}</div><div className="ds">{st.intro}</div></button>)}
        <button className="scard new" onClick={() => go('editor', {id:null})}><b>+</b>새 스토리 만들기</button>
      </div>
      <div style={{padding:'0 16px 28px'}}><button className="linkbtn" onClick={importFile}>+ 스토리 파일 가져오기</button></div>
    </div></div>
  </>;
}
