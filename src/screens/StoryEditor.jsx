import { useReducer, useState } from 'react';
import { S, back, replace, commit, goHome, toast } from '../lib/store';
import { newStory, uid, DEFAULT_INFO, MAX_IMAGES } from '../lib/constants';
import { storyOf, pickFiles, readImage, deleteStory } from '../lib/helpers';
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
  // 사진이 많아지면 기본 정보가 묻혀서, 기본 정보와 사진함을 탭으로 나눈다
  const [tab, setTab] = useState('info');

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
        else if (target.startsWith('char:')) { const ch = d.characters[+target.slice(5)]; ch.image = data; delete ch.face; }
        else if (d.images.length < MAX_IMAGES){ const im = {id:uid(), tag:'', data}; d.images.push(im); added.push(im); }
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
    <div className="set-tabs">{[['info', '기본 정보'], ['images', `사진함 ${d.images.length}`]].map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
    <div className="scroll"><div className="edit form" style={{padding:'0 16px 24px'}}>
      {tab === 'info' && <>
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
      {f('commonRules', '등장인물 공통 대화 규칙', '- 모든 인물은 서로 존댓말을 쓴다\n- 대사는 한 번에 두 문장을 넘기지 않는다\n- 군인은 대답할 때 "~습니다"로 끝낸다', 4, '모든 인물에게 한꺼번에 적용돼요')}
      <label>기본 대화 프로필<small>새 대화를 시작할 때 내가 연기할 인물</small></label>
      <select value={d.personaId || ''} onChange={e => { d.personaId = e.target.value || undefined; bump(); }}>
        <option value="">첫 번째 프로필({S.personas[0]?.name || '나'})</option>
        {S.personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="fl" style={{marginTop:18}}><span>유저 사칭 방지 기본값<small style={{display:'block', fontWeight:400, marginTop:2}}>끄면 모델이 내 대사를 받아 적고 내 표정, 속마음도 묘사해요</small></span><button className={'toggle ' + (d.noImpersonate !== false ? 'on' : '')} aria-label="유저 사칭 방지 기본값" onClick={() => { d.noImpersonate = d.noImpersonate === false; bump(); }}/></div>
      <div className="fl" style={{marginTop:18}}><span>19금 스토리<small style={{display:'block', fontWeight:400, marginTop:2}}>목록과 대화방에 19 뱃지가 붙어요</small></span><button className={'toggle ' + (d.adult ? 'on' : '')} aria-label="19금 스토리" onClick={() => { d.adult = !d.adult; bump(); }}/></div>
      {f('greeting', '첫 메시지', '대화를 시작하는 장면. {{user}} 쓰면 내 이름이 들어가요.', 5)}
      <input style={{marginTop:8}} placeholder="첫 메시지 시나리오 이름 (예: 신입생 입학)" {...bind('greetingTitle')}/>
      <textarea rows={3} style={{marginTop:6}} placeholder="시나리오 설정 (선택) : 이 시작에서만 적용할 내 처지와 관계. AI만 읽어요" {...bind('greetingSetup')}/>
      <label>다른 시작 시나리오<small>여러 개면 새 대화 때 고를 수 있어요</small></label>
      {(d.altGreetings || []).map((g, k) => <div key={g.id || k} className="alt-open">
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <input placeholder="시나리오 이름 (예: 만취한 다음 날)" value={g.title || ''} onChange={e => { g.title = e.target.value; bump(); }}/>
          <button className="linkbtn danger" style={{flexShrink:0}} onClick={() => { d.altGreetings.splice(k, 1); bump(); }}>삭제</button>
        </div>
        <textarea rows={3} placeholder="시나리오 설정 (선택) : 이 시작에서만 적용할 내 처지와 관계. AI만 읽어요" value={g.setup || ''} onChange={e => { g.setup = e.target.value; bump(); }}/>
        <textarea rows={5} placeholder="이 시나리오의 첫 메시지" value={g.text || ''} onChange={e => { g.text = e.target.value; bump(); }}/>
      </div>)}
      <button className="linkbtn" onClick={() => { (d.altGreetings ||= []).push({id:uid(), title:'', text:''}); bump(); }}>+ 시작 시나리오 추가</button>
      {f('guide', '플레이 가이드', '플레이 방법이나 추천 진행 방향', 3)}
      <div className="fl" style={{marginTop:18}}>매 답변 INFO 창<button className={'toggle ' + (d.infoOn ? 'on' : '')} aria-label="INFO 창 사용" onClick={() => { d.infoOn = !d.infoOn; if (d.infoOn && !d.info) d.info = DEFAULT_INFO; bump(); }}/></div>
      {d.infoOn && f('info', 'INFO 창 형식', '', 4, '모델이 이 형식을 채워 매 답변 위에 보여줘요')}
      {d.infoOn && <div className="fl" style={{marginTop:10}}>INFO 창 모양<select style={{width:'auto'}} value={d.infoStyle || 'box'} onChange={e => { d.infoStyle = e.target.value; bump(); }}><option value="box">어두운 상자</option><option value="plain">선 사이 글자</option></select></div>}
      {d.infoOn && <div className="fl" style={{marginTop:10}}>INFO 창 위치<select style={{width:'auto'}} value={d.infoAt || 'start'} onChange={e => { d.infoAt = e.target.value; bump(); }}><option value="start">답변 맨 위</option><option value="end">답변 맨 끝</option></select></div>}
      <div className="fl" style={{marginTop:10}}>서술 글자색<select style={{width:'auto'}} value={d.narrColor || 'gray'} onChange={e => { d.narrColor = e.target.value; bump(); }}><option value="gray">회색 (영건즈, 순애남)</option><option value="black">검정 (소꿉친구)</option></select></div>
      {f('memory', '장기 기억', '한 줄에 하나씩. 이 스토리의 모든 대화에 항상 적용돼요.', 4)}
      {!isNew && <button className="linkbtn danger" style={{marginTop:20}} onClick={() => deleteStory(d.id, goHome)}>스토리 삭제</button>}
      </>}
      {tab === 'images' && <>
      <label>이미지 보관함<small>{d.images.length}/{MAX_IMAGES}</small></label>
      {/* 이름(키워드)순으로 정렬한다. 숫자는 크기대로(2가 10보다 앞), 이름 없는 사진은 맨 뒤로 */}
      {/* 다른 스토리의 사진을 이름째 복사한다. 이미 같은 사진이 있으면 건너뛴다 */}
      {S.stories.some(s => s.id !== d.id && s.images?.length) && <select value="" style={{marginTop:8}} onChange={e => {
        const src = S.stories.find(s => s.id === e.target.value); if (!src) return;
        const have = new Set(d.images.map(i => i.data));
        const add = (src.images || []).filter(i => i.data && !have.has(i.data)).slice(0, MAX_IMAGES - d.images.length);
        d.images.push(...add.map(i => ({...i, id:uid()}))); bump();
        toast(add.length ? `${add.length}장을 가져왔어요. 저장을 눌러야 남아요.` : '새로 가져올 사진이 없어요.');
      }}>
        <option value="">다른 스토리에서 사진 가져오기</option>
        {S.stories.filter(s => s.id !== d.id && s.images?.length).map(s => <option key={s.id} value={s.id}>{s.title} ({s.images.length}장)</option>)}
      </select>}
      <button className="linkbtn" onClick={() => { d.images.sort((a, b) => !a.tag - !b.tag || (a.tag || '').localeCompare(b.tag || '', 'ko', {numeric:true})); bump(); toast('이름순으로 정렬했어요. 저장을 눌러야 남아요.'); }}>이름순 정렬</button>
      <div className="edit-hint" style={{fontSize:12.5, color:'var(--muted)', lineHeight:1.6}}>키워드(쉼표로 여러 개)를 붙여두면 답변 내용과 맞는 이미지가 대화 중에 자동으로 나와요. 키가 있으면 넣는 순간 키워드를 자동으로 달아줘요.</div>
      <div className="fl" style={{marginTop:8}}>상황에 맞는 이미지 자동 표시<button className={'toggle ' + (d.autoImages !== false ? 'on' : '')} aria-label="이미지 자동 표시" onClick={() => { d.autoImages = d.autoImages === false; bump(); }}/></div>
      <div className="vgrid">{d.images.map((im, i) => <div key={im.id || i} className="vitem"><img src={im.data} alt=""/>
        <input placeholder={tagging.has(im.id) ? '키워드 만드는 중…' : '예: 비, 헌책방, 밤'} {...bind(`images.${i}.tag`)}/>
        <button onClick={() => { d.images.splice(i, 1); bump(); }}>삭제</button></div>)}</div>
      {d.images.length < MAX_IMAGES && <button className="linkbtn" onClick={() => addImages('vault')}>+ 이미지 추가</button>}
      </>}
    </div></div>
    <div className="page-foot"><button className="btn dark" style={{width:'100%'}} onClick={saveStory}>저장</button></div>
  </>;
}
