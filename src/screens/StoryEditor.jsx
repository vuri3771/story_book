import { useReducer, useState } from 'react';
import { S, back, replace, commit, goHome, toast } from '../lib/store';
import { newStory, uid, DEFAULT_INFO } from '../lib/constants';
import { storyOf, pickFiles, readImage } from '../lib/helpers';
import { ask } from '../sheets';
import { autoTag } from '../lib/engine';
import { Icon } from '../icons';

const getPath = (o, path) => path.split('.').reduce((t, k) => t?.[k], o) ?? '';
function setPath(o, path, v){ const ks = path.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]]; t[ks[ks.length-1]] = v; }

export default function StoryEditor({id}){
  const orig = id ? storyOf(id) : null;
  const isNew = !orig;
  const [d] = useState(() => orig ? JSON.parse(JSON.stringify(orig)) : newStory());
  const [, bump] = useReducer(x => x + 1, 0);

  const bind = k => ({value:getPath(d, k), onChange:e => { setPath(d, k, e.target.value); bump(); }});
  const f = (k, label, ph, rows, hint) => <>
    <label>{label}{hint && <small>{hint}</small>}</label>
    {rows ? <textarea rows={rows} placeholder={ph} {...bind(k)}/> : <input placeholder={ph} {...bind(k)}/>}
  </>;

  const [tagging, setTagging] = useState(() => new Set());
  const tagImage = async im => {
    setTagging(s => new Set(s).add(im.id));
    // 키워드가 오기 전에 저장하고 나가도 붙도록, 이미 저장된 스토리면 다시 저장한다
    try { const t = await autoTag(im.data); if (t && !im.tag){ im.tag = t; if (S.stories.includes(d)) commit(); } }
    catch(e){ toast('키워드 자동 생성 실패 : ' + e.message); }
    setTagging(s => { const n = new Set(s); n.delete(im.id); return n; });
  };

  const addImages = async target => {
    const files = await pickFiles({accept:'image/*', multiple: target === 'vault'});
    const added = [];
    try {
      for (const file of files){
        const data = await readImage(file, target === 'vault' ? 900 : 640);
        if (target === 'cover') d.cover = data;
        else if (target.startsWith('char:')) d.characters[+target.slice(5)].image = data;
        else if (d.images.length < 50){ const im = {id:uid(), tag:'', data}; d.images.push(im); added.push(im); }
      }
    } catch(e){ toast('이미지를 읽지 못했어요.'); }
    bump();
    added.forEach(tagImage);
  };

  const saveStory = () => {
    if (!d.title.trim()) return toast('제목을 입력해주세요.');
    d.characters = d.characters.filter(x => x.name.trim() || x.profile.trim());
    if (!d.characters.length) d.characters.push({id:uid(), name:'', profile:'', image:''});
    const i = S.stories.findIndex(s => s.id === d.id);
    if (i >= 0) S.stories[i] = d; else S.stories.push(d);
    commit(); toast('저장했어요.');
    if (isNew) replace('story', {id:d.id}); else back();
  };

  return <>
    <div className="hdr"><button className="icon-btn" aria-label="뒤로" onClick={back}><Icon n="back"/></button><div className="t center">{isNew ? '새 스토리' : '스토리 편집'}</div><span style={{width:36}}/></div>
    <div className="scroll"><div className="edit form" style={{padding:'0 16px 24px'}}>
      <label>표지 이미지<small>3:4 비율 추천</small></label>
      <button className="coverpick" onClick={() => addImages('cover')}>{d.cover ? <img src={d.cover} alt=""/> : '이미지 추가'}</button>
      {f('title', <>제목<span className="req">*</span></>, '예: 달그림자 헌책방')}
      {f('intro', '한 줄 소개', '목록에 보이는 짧은 소개', 2)}
      {f('world', '세계관 · 배경', '시대, 장소, 분위기, 규칙 등', 5)}
      <label>등장인물<small>여러 명 가능</small></label>
      {d.characters.map((ch, i) => <div key={ch.id || i} className="charbox">
        <div className="top"><button className="av" onClick={() => addImages('char:' + i)}>{ch.image ? <img src={ch.image} alt=""/> : '사진'}</button>
          <input placeholder="이름" {...bind(`characters.${i}.name`)}/></div>
        <textarea rows="4" placeholder="나이, 외모, 성격, 말투, 과거, 다른 인물과의 관계" {...bind(`characters.${i}.profile`)}/>
        {d.characters.length > 1 && <button className="linkbtn danger" onClick={() => { d.characters.splice(i, 1); bump(); }}>이 인물 삭제</button>}
      </div>)}
      <button className="linkbtn" onClick={() => { d.characters.push({id:uid(), name:'', profile:'', image:''}); bump(); }}>+ 등장인물 추가</button>
      {f('greeting', '첫 메시지', '대화를 시작하는 장면. {{user}} 쓰면 내 이름이 들어가요.', 5)}
      {f('guide', '플레이 가이드', '플레이 방법이나 추천 진행 방향', 3)}
      <div className="fl" style={{marginTop:18}}>매 답변 INFO 창<button className={'toggle ' + (d.infoOn ? 'on' : '')} aria-label="INFO 창 사용" onClick={() => { d.infoOn = !d.infoOn; if (d.infoOn && !d.info) d.info = DEFAULT_INFO; bump(); }}/></div>
      {d.infoOn && f('info', 'INFO 창 형식', '', 4, '모델이 이 형식을 채워 매 답변 위에 보여줘요')}
      {f('memory', '장기 기억', '한 줄에 하나씩. 이 스토리의 모든 대화에 항상 적용돼요.', 4)}
      <label>이미지 보관함<small>{d.images.length}/50</small></label>
      <div className="edit-hint" style={{fontSize:12.5, color:'var(--muted)', lineHeight:1.6}}>키워드(쉼표로 여러 개)를 붙여두면 답변 내용과 맞는 이미지가 대화 중에 자동으로 나와요. 키가 있으면 넣는 순간 키워드를 자동으로 달아줘요.</div>
      <div className="fl" style={{marginTop:8}}>상황에 맞는 이미지 자동 표시<button className={'toggle ' + (d.autoImages !== false ? 'on' : '')} aria-label="이미지 자동 표시" onClick={() => { d.autoImages = d.autoImages === false; bump(); }}/></div>
      <div className="vgrid">{d.images.map((im, i) => <div key={im.id || i} className="vitem"><img src={im.data} alt=""/>
        <input placeholder={tagging.has(im.id) ? '키워드 만드는 중…' : '예: 비, 헌책방, 밤'} {...bind(`images.${i}.tag`)}/>
        <button onClick={() => { d.images.splice(i, 1); bump(); }}>삭제</button></div>)}</div>
      {d.images.length < 50 && <button className="linkbtn" onClick={() => addImages('vault')}>+ 이미지 추가</button>}
      {!isNew && <button className="linkbtn danger" style={{marginTop:20}} onClick={() => ask('이 스토리와 대화를 모두 삭제할까요?', '삭제', () => {
        S.stories = S.stories.filter(s => s.id !== d.id); S.chats = S.chats.filter(c => c.storyId !== d.id); commit(); goHome();
      })}>스토리 삭제</button>}
    </div></div>
    <div className="page-foot"><button className="btn dark" style={{width:'100%'}} onClick={saveStory}>저장</button></div>
  </>;
}
