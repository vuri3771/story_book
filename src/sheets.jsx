// ================= 시트 =================
import { useState } from 'react';
import { S, commit, openSheet, closeSheet, closeDrawer, toast, ui, useStore, go } from './lib/store';
import { MODELS, STYLES, LENGTHS, EFFORTS, NAI_BASE, uid } from './lib/constants';
import { modelOf, won, storyOf, exportAll, importFile } from './lib/helpers';
import { costOf, usingProxy } from './lib/api';
import { maybeSummarize } from './lib/engine';
import { remoteOn, token, switchAccount, syncStatus, pushNow } from './lib/remote';
import { Icon } from './icons';
import { Ava } from './render';
import { FONTS, look, setLook, loadFont, SIZE_MIN, SIZE_MAX, KNOBS, DEFAULT_LOOK } from './lib/look';

export function Sheet({children, ok, danger, onOk}){
  useStore();
  return (
    <div className={'sheet-bg' + (ui.sheetClosing ? ' closing' : '')} onClick={e => { if (e.target === e.currentTarget) closeSheet(); }}>
      <div className="sheet" role="dialog">
        <div className="grab"/>
        {children}
        {ok && <div className="sb">
          <button className="btn" onClick={closeSheet}>취소</button>
          <button className={'btn ' + (danger ? 'red' : 'dark')} onClick={() => { if (onOk?.() !== false) closeSheet(); }}>{ok}</button>
        </div>}
      </div>
    </div>
  );
}

// 오른쪽에서 밀려 나오는 사이드 메뉴
export function Drawer({children}){
  useStore();
  return (
    <div className={'drawer-bg' + (ui.drawerClosing ? ' closing' : '')} onClick={e => { if (e.target === e.currentTarget) closeDrawer(); }}>
      <div className="drawer" role="dialog">{children}</div>
    </div>
  );
}

export function ask(msg, okLabel, fn){ openSheet(<Sheet ok={okLabel} danger onOk={fn}><h3>{msg}</h3></Sheet>); }

// ----- 설정 : 시트와 설정 탭이 같은 폼을 쓴다 -----
// ----- 글꼴과 대화 글자 모양 : 누르는 즉시 바뀌고 PC 와 휴대폰에 똑같이 맞춰진다 -----
export function TextLook(){
  const [, redraw] = useState(0);
  // 고를 때 각 글꼴 모양을 바로 보여주려고 목록을 열면 전부 불러온다
  useState(() => FONTS.forEach(loadFont));
  const set = patch => { setLook(patch); S.settings.look = {...look}; commit(); redraw(n => n + 1); };
  const knob = (k, label, fmt) => { const o = KNOBS[k]; return <>
    <label>{label}</label>
    <div className="look-size">
      <button aria-label={label + ' 줄이기'} onClick={() => set({[k]:look[k] - o.step})}>−</button>
      <input type="range" min={o.min} max={o.max} step={o.step} value={look[k]} aria-label={label} onChange={e => set({[k]:+e.target.value})}/>
      <button aria-label={label + ' 늘리기'} onClick={() => set({[k]:look[k] + o.step})}>+</button>
      <b>{fmt(look[k])}</b>
    </div>
  </>; };
  const changed = Object.keys(DEFAULT_LOOK).some(k => k !== 'font' && look[k] !== DEFAULT_LOOK[k]);
  return <>
    <label>글꼴<small>PC와 휴대폰에 똑같이 적용돼요</small></label>
    <div className="look-fonts">
      {FONTS.map(f => <button key={f.id} className={look.font === f.id ? 'on' : ''} style={{fontFamily:f.family}} aria-pressed={look.font === f.id} onClick={() => set({font:f.id})}>{f.name}<small>가나다 Aa 123</small></button>)}
    </div>
    <label>대화 글자 크기</label>
    <div className="look-size">
      <button aria-label="글자 작게" style={{fontSize:13}} onClick={() => set({size:look.size - .05})}>가</button>
      <input type="range" min={SIZE_MIN} max={SIZE_MAX} step=".05" value={look.size} aria-label="대화 글자 크기" onChange={e => set({size:+e.target.value})}/>
      <button aria-label="글자 크게" style={{fontSize:19}} onClick={() => set({size:look.size + .05})}>가</button>
      <b>{Math.round(look.size * 100)}%</b>
    </div>
    {knob('ls', '자간', v => (v > 0 ? '+' : '') + Math.round(v * 100))}
    {knob('lh', '줄 간격', v => Math.round(v * 100) + '%')}
    {knob('pg', '문단 간격', v => Math.round(v * 100) + '%')}
    <div className="look-prev"><p><i>창밖으로 비가 그치고 있었다.</i> "이제 가 볼까?" 그가 우산을 접으며 웃었다.</p><p><i>대답 대신 고개를 끄덕였다.</i> 젖은 길 위로 가로등이 하나둘 켜졌다.</p></div>
    {changed && <button className="linkbtn" onClick={() => set({size:1, ls:0, lh:1, pg:1})}>기본값으로</button>}
  </>;
}
export function LookSheet(){ return <Sheet><h3>글꼴, 글자 모양</h3><div className="form"><TextLook/></div><div className="sb"><button className="btn dark" onClick={closeSheet}>닫기</button></div></Sheet>; }

export function openSettings(){ openSheet(<Sheet><h3>설정</h3><SettingsForm inSheet/></Sheet>); }
// sec : 설정 화면의 탭(화면, 모델, 대화, 프로필, 계정). 없으면(시트) 전부 보여 준다
export function SettingsForm({inSheet, sec}){
  const on = k => !sec || sec === k;
  const s = S.settings;
  const [f, setF] = useState({apiKey:s.apiKey, naiKey:s.naiKey || '', naiModel:s.naiModel || 'glm-4-6', naiBase:s.naiBase || NAI_BASE, naiTranslate:s.naiTranslate !== false,
    model:s.model, helperModel:s.helperModel, keepRecent:s.keepRecent, summarizeEvery:s.summarizeEvery, krw:s.krw, commonNote:s.commonNote || '', userMoan:s.userMoan !== false});
  const set = k => e => setF({...f, [k]: e.target.value});
  const saveIt = () => {
    Object.assign(s, {apiKey:f.apiKey.trim(), naiKey:f.naiKey.trim(), naiModel:f.naiModel.trim() || 'glm-4-6', naiBase:f.naiBase.trim() || NAI_BASE, naiTranslate:f.naiTranslate,
      model:f.model, helperModel:f.helperModel, keepRecent:Math.max(6, +f.keepRecent || 30), summarizeEvery:Math.max(4, +f.summarizeEvery || 20), krw:+f.krw || 1400, commonNote:f.commonNote, userMoan:f.userMoan});
    commit();
    if (inSheet) closeSheet(); else toast('저장했어요.');
  };
  return (
    <>
      <div className="form">
        {on('look') && <><div className="set-h">화면</div><TextLook/></>}
        {on('model') && <>
          <div className="set-h">모델</div>
          {usingProxy
            ? <div className="note" style={{padding:0}}>Claude 키는 서버에 있어서 여기서 넣지 않아도 돼요.</div>
            : <><label>Anthropic API 키<small>이 브라우저에만 저장돼요</small></label><input type="password" value={f.apiKey} onChange={set('apiKey')} placeholder="sk-ant-..." autoComplete="off"/></>}
          <label>새 대화 기본 모델</label><select value={f.model} onChange={set('model')}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <label>보조 모델<small>요약 메모리, 추천 답변, NovelAI 번역에 써요</small></label><select value={f.helperModel} onChange={set('helperModel')}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <div className="set-h">NovelAI</div>
          <label>NovelAI 키<small>NovelAI 계정 설정의 Persistent API Token</small></label><input type="password" value={f.naiKey} onChange={set('naiKey')} placeholder="pst-..." autoComplete="off"/>
          <label>NovelAI 모델 ID</label><input value={f.naiModel} onChange={set('naiModel')} placeholder="glm-4-6"/>
          <label>NovelAI 주소<small>보통은 그대로 두세요</small></label><input value={f.naiBase} onChange={set('naiBase')} placeholder={NAI_BASE}/>
          <label>NovelAI 번역<small>영어로 주고받고 보조 모델이 한국어로 옮겨요</small></label><div className="seg"><button className={f.naiTranslate ? 'on' : ''} onClick={() => setF({...f, naiTranslate:true})}>켜기</button><button className={f.naiTranslate ? '' : 'on'} onClick={() => setF({...f, naiTranslate:false})}>끄기</button></div>
        </>}
        {on('chat') && <>
          <div className="set-h">대화</div>
          <label>공통 유저노트<small>모든 대화에 자동으로 함께 들어가요. 대화별 유저노트에 양식으로 불러올 수도 있어요</small></label>
          <textarea rows="8" value={f.commonNote} onChange={set('commonNote')} placeholder={"예)\n- 대사는 짧게, 서술은 길고 자세하게\n- {{user}}의 호칭 : \n- 지금 관계 : \n- 꼭 지킬 설정 : "}/>
          <label>19금 장면에서 내 신음, 더티토크 자동<small>성적인 장면에서는 사칭 방지를 켜 둬도 AI가 내 신음과 짧은 야한 말을 내 프로필 말투로 써 줘요</small></label>
          <div className="seg"><button className={f.userMoan ? 'on' : ''} onClick={() => setF({...f, userMoan:true})}>켜기</button><button className={f.userMoan ? '' : 'on'} onClick={() => setF({...f, userMoan:false})}>끄기</button></div>
          <label>원문 그대로 보낼 최근 메시지 수</label><input type="number" min="6" value={f.keepRecent} onChange={set('keepRecent')}/>
          <label>이만큼 더 쌓이면 오래된 부분 요약</label><input type="number" min="4" value={f.summarizeEvery} onChange={set('summarizeEvery')}/>
        </>}
        {on('profile') && <><div className="set-h">대화 프로필</div><PersonaList/></>}
        {on('shortcut') && <><div className="set-h">내 단축어</div><ShortcutList/></>}
        {on('account') && <>
          <div className="set-h">계정과 백업</div>
          <label>환율 (원/달러)</label><input type="number" value={f.krw} onChange={set('krw')}/>
          <div className="note" style={{padding:'8px 0 0'}}>지금까지 쓴 금액 ≈ {won(S.usage.krw || 0)}원 (예상치)</div>
          <label>백업</label>
          <div className="seg"><button onClick={exportAll}>내보내기</button><button onClick={importFile}>불러오기</button></div>
          {remoteOn && <AccountCode/>}
        </>}
      </div>
      {inSheet
        ? <div className="sb"><button className="btn" onClick={closeSheet}>취소</button><button className="btn dark" onClick={saveIt}>저장</button></div>
        : sec !== 'profile' && sec !== 'shortcut' && <div style={{padding:'20px 20px 28px'}}><button className="btn dark" style={{width:'100%'}} onClick={saveIt}>저장</button></div>}
    </>
  );
}

// ----- 다른 기기에서 이어하기 : 기기 토큰이 곧 계정이라 코드를 옮기면 같은 내용과 사용 기록을 쓴다 -----
function AccountCode(){
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = token();
  const copy = async () => { try { await navigator.clipboard.writeText(mine); toast('연결 코드를 복사했어요.'); } catch(e){ setShow(true); } };
  const apply = () => ask('이 기기의 내용이 그 코드의 내용으로 바뀌어요. 계속할까요?', '바꾸기', () => {
    setBusy(true);
    switchAccount(code).then(() => { toast('불러왔어요.'); setCode(''); }).catch(e => toast(e.message)).finally(() => setBusy(false));
  });
  return <>
    <label>다른 기기에서 이어하기<small>코드는 비밀번호처럼 남에게 보여주지 마세요</small></label>
    <div className="seg"><button onClick={copy}>내 연결 코드 복사</button><button onClick={() => setShow(!show)}>{show ? '코드 숨기기' : '코드 보기'}</button></div>
    {show && <input readOnly value={mine} onFocus={e => e.target.select()}/>}
    <input value={code} onChange={e => setCode(e.target.value)} placeholder="다른 기기의 연결 코드 붙여넣기" autoComplete="off"/>
    <button className="linkbtn" disabled={!code.trim() || busy} onClick={apply}>{busy ? '불러오는 중…' : '이 코드로 불러오기'}</button>
    <div className="note" style={{padding:0}}>
      {syncStatus.error ? `서버 저장 실패 : ${syncStatus.error}` : syncStatus.at ? `서버에 저장됨 · ${new Date(syncStatus.at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}` : '서버 저장 대기 중'}
      {syncStatus.skipped > 0 && ` · 너무 큰 항목 ${syncStatus.skipped}개는 이 기기에만 있어요`}
    </div>
  </>;
}

// ----- 등장인물 프로필 -----
export function CharacterSheet({ch}){
  return (
    <Sheet>
      <div style={{padding:'0 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
        {ch.image ? <Ava ch={ch} style={{width:120, height:120, borderRadius:'50%', objectFit:'cover'}}/> : <CharPh name={ch.name} size={120}/>}
        <h3 style={{padding:0}}>{ch.name}</h3>
      </div>
      <div className="note" style={{whiteSpace:'pre-wrap', fontSize:15, lineHeight:1.7, paddingTop:8}}>{ch.profile || '아직 소개가 없어요.'}</div>
    </Sheet>
  );
}
// 사진이 없는 인물은 이름 첫 글자와 이름에서 뽑은 색으로 그린다
export function CharPh({name, size = 58}){
  let h = 0; for (const c of String(name || '?')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return <span className="ph" style={{width:size, height:size, fontSize:size * .36, background:`hsl(${h},42%,48%)`}}>{String(name || '?').slice(0, 1)}</span>;
}

// ----- 모델 선택 -----
export function ModelSheet({chat}){
  useStore();
  const u = chat?.lastUsage || {in:300, cw:400, cr:9000, out:1100};
  return (
    <Sheet>
      <h3>모델 선택</h3><div className="note">한 번 보낼 때 예상 비용이에요. 대화가 길어질수록 조금씩 올라요.</div>
      {MODELS.map(m => (
        <button key={m.id} className="opt" onClick={() => { chat.model = m.id; commit(); closeSheet(); toast(m.name + '로 바꿨어요.'); }}>
          <span className="ic" style={{color:m.color}}><Icon n={m.icon}/></span>
          <span className="mid"><b>{m.name}</b><span className="cost">{m.provider === 'nai' ? '구독 정액' : '약 ' + won(costOf(u, m.id)) + '원'}</span>{m.rec && <span className="rec">권장</span>}<span className="d">{m.desc}</span></span>
          {chat.model === m.id && <span className="chk">✓</span>}
        </button>
      ))}
    </Sheet>
  );
}

export function EditMsgSheet({chat, i}){
  const m = chat.messages[i];
  const [v, setV] = useState(m.text);
  return <Sheet ok="저장" onOk={() => { m.text = v; if (m.send) delete m.send; delete m.en; commit(); }}><h3>메시지 수정</h3><div className="form"><textarea rows="12" value={v} onChange={e => setV(e.target.value)}/></div></Sheet>;
}

// ----- 채팅방 메뉴 시트 -----
export function GuideSheet({chat}){
  const st = storyOf(chat);
  return <Sheet><h3>플레이 가이드</h3><div className="note" style={{whiteSpace:'pre-wrap', fontSize:15}}>{st.guide || '이 스토리에는 아직 플레이 가이드가 없어요.'}</div><div className="note">입력창 아래 버튼: * 행동 표시 · 추천 답변 3개 · / 단축어 · ⚡ 모델 선택</div></Sheet>;
}

export function NotesSheet({chat}){
  const [v, setV] = useState(chat.notes || '');
  return <Sheet ok="저장" onOk={() => { chat.notes = v; commit(); }}><h3>유저노트</h3><div className="note">이 대화에서 모델이 항상 기억해야 할 내용이에요. 관계, 호칭, 지금까지 있었던 일, 지켜야 할 설정 등을 적어두세요.</div><div className="form"><textarea rows="10" value={v} onChange={e => setV(e.target.value)} placeholder={"- 하윤은 {{user}}를 '단골 씨'라고 부른다\n- 둘은 지난주에 우산을 같이 썼다"}/>
    {S.settings.commonNote?.trim() ? <><div className="note" style={{padding:0}}>설정의 공통 유저노트도 모든 대화에 함께 들어가고 있어요.</div><button className="linkbtn" onClick={() => setV(v.trim() ? v.trimEnd() + '\n\n' + S.settings.commonNote : S.settings.commonNote)}>공통 유저노트를 양식으로 불러오기</button></> : null}</div></Sheet>;
}

export function MemorySheet({chat}){
  const [v, setV] = useState(chat.memory || '');
  const [label, setLabel] = useState('지금 요약하기');
  const now = async () => { setLabel('요약하는 중…'); try { await maybeSummarize(chat, true); setV(chat.memory); setLabel('요약했어요'); } catch(e){ toast(e.message); setLabel('지금 요약하기'); } };
  return <Sheet ok="저장" onOk={() => { chat.memory = v; commit(); }}><h3>요약 메모리</h3><div className="note">오래된 대화는 자동으로 요약되어 여기에 쌓여요. 직접 고쳐도 돼요. 전체 {chat.messages.length}개 중 {chat.summarizedUpTo || 0}개가 요약으로 들어갔어요.</div><div className="form"><textarea rows="12" value={v} onChange={e => setV(e.target.value)}/><button className="linkbtn" onClick={now}>{label}</button></div></Sheet>;
}

export function StyleSheet({chat}){
  const [style, setStyle] = useState(chat.style || 'novel');
  const [custom, setCustom] = useState(chat.customStyle || '');
  return (
    <Sheet ok="저장" onOk={() => { chat.style = style; chat.customStyle = custom; commit(); }}>
      <h3>문체 변경</h3>
      {Object.entries(STYLES).map(([key, s]) => <button key={key} className="opt" onClick={() => setStyle(key)}><span className="mid"><b>{s.name}</b><span className="d">{s.text || '원하는 문체를 직접 적어요'}</span></span>{style === key && <span className="chk">✓</span>}</button>)}
      <div className="form" hidden={style !== 'custom'}><textarea rows="4" value={custom} onChange={e => setCustom(e.target.value)} placeholder="예: 건조하고 냉소적인 하드보일드 문체"/></div>
    </Sheet>
  );
}

export function LengthSheet({chat}){
  const [len, setLen] = useState(chat.length || 'normal');
  const [eff, setEff] = useState(chat.effort || 'low');
  const [min, setMin] = useState(chat.minChars || 0);
  return (
    <Sheet ok="확인" onOk={() => { chat.length = len; chat.effort = eff; chat.minChars = Math.max(0, Math.min(5000, +min || 0)); commit(); }}>
      <h3>답변 길이 및 생각 조절</h3>
      <div className="form">
        <label>답변 길이</label><div className="seg">{Object.entries(LENGTHS).map(([k, l]) => <button key={k} className={len === k ? 'on' : ''} onClick={() => setLen(k)}>{l.name}</button>)}</div>
        <label>생각 깊이<small>깊을수록 느리고 비싸요</small></label><div className="seg">{Object.entries(EFFORTS).map(([k, n]) => <button key={k} className={eff === k ? 'on' : ''} onClick={() => setEff(k)}>{n}</button>)}</div>
        <label>최소 글자 수<small>0이면 제한 없음 · 공백 포함</small></label><input type="number" min="0" step="100" value={min} onChange={e => setMin(e.target.value)} placeholder="예: 600"/>
      </div>
    </Sheet>
  );
}

// 설정 화면의 내 단축어 목록 : 모든 스토리에서 쓰는 단축어. 상단 고정, 수정, 추가
// 내 단축어는 서버의 meta 항목에 같이 저장돼서 바꾸는 즉시 다른 기기와 맞춰진다
function ShortcutList(){
  useStore();
  const list = [...S.shortcuts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const pin = s => { s.pinned = !s.pinned; commit(); pushNow(); };
  return <>
    <div className="note" style={{padding:0}}>여기서 만든 단축어는 모든 스토리에서 쓸 수 있고 서버에 저장돼요. 스토리 전용 단축어는 대화창의 / 버튼에서 관리해요.</div>
    {list.map(s => <div key={s.id} className="opt">
      <button className={'pin' + (s.pinned ? ' on' : '')} aria-label={s.pinned ? '상단 고정 풀기' : '상단 고정'} onClick={() => pin(s)}>📌</button>
      <button className="mid" style={{textAlign:'left'}} onClick={() => go('shortcut', {chatId:null, owner:'me', id:s.id})}><b>/{s.name}</b><span className="d">{s.desc}</span></button>
      <button className="pen" aria-label="수정" style={{width:34, color:'var(--narr)'}} onClick={() => go('shortcut', {chatId:null, owner:'me', id:s.id})}><Icon n="pen"/></button>
    </div>)}
    <button className="linkbtn" onClick={() => go('shortcut', {chatId:null, owner:'me', id:null})}>+ 단축어 추가</button>
  </>;
}

// 설정 화면의 대화 프로필 목록 : 고르기 없이 만들고 고치기만 한다
function PersonaList(){
  useStore();
  return <>
    <div className="note" style={{padding:0}}>대화에서 내가 연기할 인물이에요. 대화방 메뉴의 "대화 프로필"에서 골라 써요.</div>
    {S.personas.map(p => <div key={p.id} className="opt">
      <button className="mid" style={{textAlign:'left'}} onClick={() => openSheet(<EditPersonaSheet id={p.id}/>)}><b>{p.name}</b><span className="d">{p.desc || '설정 없음'}</span></button>
      <button className="pen" aria-label="편집" style={{width:34, color:'var(--narr)'}} onClick={() => openSheet(<EditPersonaSheet id={p.id}/>)}><Icon n="pen"/></button>
    </div>)}
    <button className="linkbtn" onClick={() => openSheet(<EditPersonaSheet id={null}/>)}>+ 새 프로필</button>
  </>;
}

export function ProfileSheet({chat}){
  useStore();
  return (
    <Sheet>
      <h3>대화 프로필</h3><div className="note">이 대화에서 내가 연기할 인물이에요. {'{{user}}'} 자리에 이름이 들어가요.</div>
      {S.personas.map(p => (
        <div key={p.id} className="opt">
          <button className="mid" style={{textAlign:'left'}} onClick={() => { chat.personaId = p.id; commit(); closeSheet(); }}><b>{p.name}</b><span className="d">{p.desc || '설정 없음'}</span></button>
          <button className="pen" aria-label="편집" style={{width:34, color:'var(--narr)'}} onClick={() => openSheet(<EditPersonaSheet chat={chat} id={p.id}/>)}><Icon n="pen"/></button>
          {chat.personaId === p.id && <span className="chk">✓</span>}
        </div>
      ))}
      <div className="form"><button className="linkbtn" onClick={() => openSheet(<EditPersonaSheet chat={chat} id={null}/>)}>+ 새 프로필</button></div>
    </Sheet>
  );
}

function EditPersonaSheet({chat, id}){
  const orig = S.personas.find(x => x.id === id);
  const [name, setName] = useState(orig?.name || '');
  const [desc, setDesc] = useState(orig?.desc || '');
  return (
    <Sheet ok="저장" onOk={() => {
      const p = orig || {id:uid()};
      p.name = name.trim() || '나'; p.desc = desc;
      if (!orig){ S.personas.push(p); if (chat) chat.personaId = p.id; }
      commit(); if (chat){ openSheet(<ProfileSheet chat={chat}/>); return false; }
    }}>
      <h3>{orig ? '프로필 편집' : '새 프로필'}</h3>
      <div className="form">
        <label>이름</label><input value={name} onChange={e => setName(e.target.value)} placeholder="예: 지우"/>
        <label>설정</label><textarea rows="6" value={desc} onChange={e => setDesc(e.target.value)} placeholder="나이, 외모, 성격, 등장인물과의 관계"/>
        {orig && S.personas.length > 1 && <button className="linkbtn danger" onClick={() => {
          S.personas = S.personas.filter(x => x.id !== orig.id);
          S.chats.forEach(ch => { if (ch.personaId === orig.id) ch.personaId = S.personas[0].id; });
          commit(); if (chat) openSheet(<ProfileSheet chat={chat}/>); else closeSheet();
        }}>프로필 삭제</button>}
      </div>
    </Sheet>
  );
}

export function ImageSheet({src, alt}){
  return <Sheet><div style={{padding:'0 16px'}}><img src={src} alt="" style={{width:'100%', borderRadius:14}}/><div className="note" style={{padding:'10px 4px 0'}}>{alt}</div></div></Sheet>;
}

// 메뉴에서 단축어 관리를 누르면 대화 화면으로 돌아가 단축어 창을 연다
export function requestShortcutPop(){ ui.pendingPop = 'sc'; }
