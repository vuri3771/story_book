import { useState } from 'react';
import { S, back, commit, toast } from '../lib/store';
import { uid } from '../lib/constants';
import { chatById, storyOf } from '../lib/helpers';
import { pushNow } from '../lib/remote';
import { ask } from '../sheets';
import { Icon } from '../icons';

export default function ShortcutEditor({chatId, owner, id}){
  // 설정 화면에서 열면 chatId 가 없다. 그때는 내 단축어만 다룬다
  const st = chatId ? storyOf(chatById(chatId)) : null;
  const listOf = o => o === 'st' ? (st.shortcuts = st.shortcuts || []) : S.shortcuts;
  const orig = listOf(owner).find(s => s.id === id);
  const [name, setName] = useState(orig?.name || '');
  const [desc, setDesc] = useState(orig?.desc || '');
  const [body, setBody] = useState(orig?.body || '');
  const ok = !!(name && desc && body.trim());

  const saveIt = () => {
    if (!ok) return;
    const d = {name, desc, body};
    // 새 단축어는 무조건 모든 스토리 공통(내 단축어)으로 저장하고 바로 서버에 올린다
    if (orig) Object.assign(orig, d); else S.shortcuts.push({id:uid(), ...d});
    commit(); pushNow(); toast('저장했어요.'); back();
  };

  return <>
    <div className="hdr"><button className="icon-btn" aria-label="뒤로" onClick={back}><Icon n="back"/></button><div className="t center">{orig ? '단축어 수정' : '단축어 추가'}</div><span style={{width:36}}/></div>
    <div className="scroll"><div className="form" style={{padding:'0 16px 24px'}}>
      <label>단축어 이름<span className="req">*</span><small>{name.length}/10</small></label>
      <div style={{position:'relative'}}><span style={{position:'absolute', left:14, top:12, color:'var(--muted)'}}>/</span><input maxLength={10} value={name} onChange={e => setName(e.target.value.replace(/^\/+/, '').replace(/\s/g, ''))} style={{paddingLeft:26}}/></div>
      <label>설명<span className="req">*</span><small>{desc.length}/30</small></label>
      <input maxLength={30} value={desc} onChange={e => setDesc(e.target.value)} placeholder="예: 캐릭터의 일기를 몰래 살펴보세요."/>
      <label>프롬프트 본문<span className="req">*</span><small>{'{char} {user}'} 사용 가능</small></label>
      <textarea rows="14" value={body} onChange={e => setBody(e.target.value)} placeholder="이 단축어를 쓰면 모델에게 전달할 지시"/>
      {orig && <button className="linkbtn danger" style={{marginTop:18}} onClick={() => ask(`/${orig.name} 단축어를 삭제할까요?`, '삭제', () => { const arr = listOf(owner); arr.splice(arr.indexOf(orig), 1); commit(); pushNow(); back(); })}>단축어 삭제</button>}
    </div></div>
    <div className="page-foot"><button className="btn dark" style={{width:'100%'}} disabled={!ok} onClick={saveIt}>저장</button></div>
  </>;
}
