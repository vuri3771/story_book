import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useStore, ui, go, back, goHome, commit, openSheet, closeSheet, openDrawer, toast } from '../lib/store';
import { EXPECTED_CHARS, uid } from '../lib/constants';
import { chatById, storyOf, modelOf, fill, won } from '../lib/helpers';
import { allShortcuts } from '../lib/prompt';
import { run, send, regen, cont, suggest, isAdultChat } from '../lib/engine';
import { renderAI, renderUser, Inline, pickScene, Badge19 } from '../render';
import { ask, Sheet, ModelSheet, EditMsgSheet } from '../sheets';
import ChatMenu from './MenuPage';
import { Icon } from '../icons';

// 생성 진행률 : 첫 글자 전에는 시간에 따라 14%까지, 그 뒤로는 예상 길이 대비 쓴 글자 수
function progressOf(c){
  if (!run.text) return 14 * (1 - Math.exp(-(Date.now() - run.startedAt) / 2500));
  const expect = Math.max(EXPECTED_CHARS[c.length || 'normal'], (c.minChars || 0) * 1.1) + 150;
  return Math.min(97, 14 + 83 * Math.min(1, run.text.length / expect));
}

// 복사할 땐 화면에 안 보이는 수위 표시만 떼고 줄바꿈은 살린다
const copyText = (m, c) => fill(m.text, c).replace(/\[\[[^\]]*\]\]/g, '').trim();

// 길게 누르면 뜨는 메뉴
function MsgMenu({at, items, onClose}){
  const x = Math.min(at.x, innerWidth - 236), y = Math.min(at.y, innerHeight - items.length * 52 - 24);
  return <div className="mmenu-bg" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
    <div className="mmenu" role="menu" style={{left:Math.max(12, x), top:Math.max(12, y)}} onClick={e => e.stopPropagation()}>
      {items.map(([label, fn]) => <button key={label} role="menuitem" onClick={() => { onClose(); fn(); }}>{label}</button>)}
    </div>
  </div>;
}

function SelectCopySheet({text}){
  return <Sheet><h3>선택 복사</h3><div className="note">복사할 부분을 길게 눌러 고르세요.</div>
    <div className="form"><textarea readOnly rows="14" value={text}/></div>
    <div className="sb"><button className="btn dark" onClick={closeSheet}>닫기</button></div></Sheet>;
}

export default function ChatPage({id}){
  const S = useStore();
  const c = chatById(id);
  const [text, setText] = useState('');
  const [pop, setPop] = useState(() => { const p = ui.pendingPop; ui.pendingPop = null; return p; });
  const [scQuery, setScQuery] = useState('');
  const [sug, setSug] = useState(null);
  const [openActs, setOpenActs] = useState(() => new Set());
  const popRef = useRef(pop); popRef.current = pop;
  const inpRef = useRef(null), scRef = useRef(null), lenRef = useRef(-1);
  const spRef = useRef(null), pinRef = useRef(-1), busyRef = useRef(false);
  const [far, setFar] = useState(false);
  const [menu, setMenu] = useState(null);
  const press = useRef({t:0, x:0, y:0, fired:0});
  // 맨 아래에서 더 끌어올리면(휠은 더 굴리면) 내 말 없이 이야기를 이어 간다
  const [pull, setPull] = useState(0);
  const pullRef = useRef({y:-1, wheel:0, wt:0});

  // 입력창 높이 자동 조절
  useLayoutEffect(() => { const t = inpRef.current; if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }, [text]);

  // 답변이 시작되면 내 메시지를 화면 위쪽에 한 번 맞추고, 글자가 늘어나는 동안에는 스크롤을 움직이지 않는다
  // 아래 빈칸(spacer)은 답변이 짧아도 내 메시지를 위로 올릴 수 있게 남은 높이만큼만 채운다
  useLayoutEffect(() => {
    const sc = scRef.current; if (!sc || !c) return;
    const nowBusy = run.busy && run.chatId === c.id;
    let align = false;
    if (nowBusy && !busyRef.current){ pinRef.current = c.messages.map(m => m.role).lastIndexOf('user'); align = true; }
    busyRef.current = nowBusy;
    const sp = spRef.current, u = pinRef.current >= 0 ? sc.querySelector(`[data-i="${pinRef.current}"]`) : null;
    if (sp) sp.style.height = u ? Math.max(0, sc.clientHeight - (sp.getBoundingClientRect().top - u.getBoundingClientRect().top) - 24) + 'px' : '0px';
    if (lenRef.current !== c.messages.length){
      if (lenRef.current !== -1 && u) align = true;
      else sc.scrollTop = sc.scrollHeight;
      lenRef.current = c.messages.length;
    }
    if (align && u) sc.scrollTop += u.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12;
  });

  useEffect(() => { if (!c) goHome(); }, [c]);
  // 사이드 메뉴에서 단축어 관리를 누르면 단축어 창을 연다
  useEffect(() => { if (ui.pendingPop){ setScQuery(''); setPop(ui.pendingPop); ui.pendingPop = null; } });
  // 첫 글자가 오기 전에도 게이지가 움직이도록 생성 중에는 주기적으로 다시 그린다
  const [, tick] = useReducer(x => x + 1, 0);
  const busy = !!c && run.busy && run.chatId === c.id;
  useEffect(() => { if (!busy) return; const t = setInterval(tick, 250); return () => clearInterval(t); }, [busy]);
  if (!c) return null;
  const st = storyOf(c);
  const md = modelOf(c.model);
  const pct = busy ? progressOf(c) : 0;

  const closePop = () => { setPop(null); setSug(null); };
  const atBottom = () => { const sc = scRef.current; return !!sc && c.messages.length > 0 && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 6; };
  const goOn = () => { if (cont(c)) closePop(); };
  const doSend = t => { if (send(c, t)){ setText(''); closePop(); } };
  const onInput = v => {
    setText(v);
    if (v.startsWith('/') && !v.includes(' ')){ setScQuery(v.slice(1)); setPop('sc'); }
    else if (pop === 'sc') closePop();
  };
  const star = () => {
    const inp = inpRef.current, s = inp.selectionStart, e = inp.selectionEnd, v = text;
    setText(v.slice(0, s) + '*' + v.slice(s, e) + '*' + v.slice(e));
    requestAnimationFrame(() => { inp.focus(); inp.setSelectionRange(s + 1, e + 1); });
  };
  const openSuggest = async () => {
    if (run.busy) return;
    setPop('sug'); setSug(null);
    try { const opts = await suggest(c); if (popRef.current === 'sug') setSug(opts); }
    catch(e){ closePop(); toast(e.message); }
  };

  let turn = 0, prevScene = null;
  const lastAI = c.messages.map(m => m.role).lastIndexOf('assistant');
  const log = c.messages.map((m, i) => {
    if (m.role === 'assistant') turn++;
    // 자유 시작 지시는 화면에 그리지 않는다
    if (m.start) return null;
    const streaming = busy && m.role === 'assistant' && i === c.messages.length - 1;
    const t = streaming ? run.text : m.text;
    let body;
    if (m.cont) body = <div className="cont-mark">▶ 이야기 이어서</div>;
    else if (m.role !== 'assistant') body = renderUser(m.text);
    else if (!t) body = <div className="gen-card"><div className="gl"><span>장면을 구상하는 중…</span><span>{Math.round(pct)}%</span></div><div className="gauge"><i style={{width: pct + '%'}}/></div></div>;
    else {
      // 스트리밍 중엔 이미지가 바뀌며 깜빡이지 않게 다 쓴 뒤에 고른다
      const scene = streaming ? null : pickScene(t, st, prevScene);
      if (scene) prevScene = scene;
      body = renderAI(fill(t, c), st, st.infoOn ? turn : 0, scene);
    }
    const delFrom = () => ask('이 메시지부터 아래를 모두 지울까요?', '삭제', () => { c.messages.splice(i); c.summarizedUpTo = Math.min(c.summarizedUpTo || 0, c.messages.length); commit(); });
    const edit = () => openSheet(<EditMsgSheet chat={c} i={i}/>);
    let acts;
    if (m.role === 'assistant' && i === lastAI && !busy){
      acts = <div className="acts">
        {i > 0 && <button onClick={() => regen(c)}>↻ 다시 생성</button>}
        <button onClick={edit}>수정</button>
        {i > 0 && <button onClick={delFrom}>삭제</button>}
        {m.cost > 0 && <span>≈ {won(m.cost)}원{m.cache ? ` · 캐시 ${m.cache}%` : ''}</span>}
      </div>;
    } else if (m.role === 'user' && i === c.messages.length - 1 && !busy){
      acts = <div className="acts">
        <button onClick={() => regen(c)}>↻ 답변 다시 불러오기</button>
        {!m.cont && <button onClick={edit}>수정</button>}
        <button onClick={delFrom}>삭제</button>
      </div>;
    } else if (!streaming){
      acts = <div className="acts" hidden={!openActs.has(i)}><button onClick={edit}>수정</button>{m.role === 'user' && <button onClick={delFrom}>삭제</button>}</div>;
    }
    const branch = () => {
      const nc = JSON.parse(JSON.stringify(c));
      Object.assign(nc, {id:uid(), messages:nc.messages.slice(0, i + 1), cost:0, updated:Date.now(), branchOf:c.id});
      delete nc.lastUsage;
      if ((nc.summarizedUpTo || 0) > nc.messages.length){ nc.memory = ''; nc.summarizedUpTo = 0; }
      S.chats.push(nc); commit(); go('chat', {id:nc.id}); toast('여기서 갈라진 새 대화를 만들었어요.');
    };
    const copy = async () => { try { await navigator.clipboard.writeText(copyText(m, c)); toast('복사했어요.'); } catch(e){ openSheet(<SelectCopySheet text={copyText(m, c)}/>); } };
    const openMenu = (x, y) => {
      if (streaming) return;
      press.current.fired = Date.now();
      navigator.vibrate?.(10);
      setMenu({x, y, items:[['수정', edit], ...(i > 0 ? [['삭제', delFrom]] : []), ['분기', branch], ['복사', copy], ['선택 복사', () => openSheet(<SelectCopySheet text={copyText(m, c)}/>)]]});
    };
    // 손가락으로 꾹 누르면 메뉴, 마우스는 오른쪽 클릭
    const down = e => {
      if (e.pointerType === 'mouse' || busy) return;
      const p = press.current; clearTimeout(p.t);
      p.x = e.clientX; p.y = e.clientY;
      p.t = setTimeout(() => openMenu(p.x, p.y), 480);
    };
    const move = e => { const p = press.current; if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) clearTimeout(p.t); };
    const up = () => clearTimeout(press.current.t);
    const ctx = e => { e.preventDefault(); if (Date.now() - press.current.fired > 800) openMenu(e.clientX, e.clientY); };
    const toggle = e => { if (Date.now() - press.current.fired < 800) return; if (e.target.closest('button')) return; const n = new Set(openActs); n.has(i) ? n.delete(i) : n.add(i); setOpenActs(n); };
    // 19금으로 넘어가는 첫 답변에는 경계 표시, 이어지는 19금 답변에는 작은 뱃지
    const mark = null;
    return <div key={i} data-i={i} className={'m ' + m.role + (m.cont ? ' cont' : '')} onClick={toggle} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={ctx}>{mark}{body}{acts}</div>;
  });

  const scList = pop === 'sc' ? allShortcuts(c).filter(s => (ui.scTab === 'all' || s.owner === ui.scTab) && (!scQuery || s.name.includes(scQuery))) : [];

  return <>
    <div className="hdr">
      <button className="icon-btn" aria-label="뒤로" onClick={() => { if (busy) run.abort?.abort(); back(); }}><Icon n="back"/></button>
      {/* 제목을 누르면 스토리 화면으로, 스토리에서 들어왔으면 그 화면으로 되돌아간다 */}
      <button className="t t-link" title="스토리 보기" onClick={() => { const prev = ui.nav[ui.nav.length-2]; if (prev?.name === 'story' && prev.props?.id === st.id) back(); else go('story', {id:st.id}); }}>{st.title}{isAdultChat(c, st) && <Badge19 className="inline"/>}</button>
      <button className="icon-btn" aria-label="메뉴" onClick={() => openDrawer(<ChatMenu id={c.id}/>)}><Icon n="menu"/></button>
      {busy && <div className="gauge" role="progressbar" aria-label="답변 생성 중" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{width: pct + '%'}}/></div>}
    </div>
    <div className="scroll" ref={scRef} onScroll={e => { const sc = e.currentTarget; setFar(sc.scrollHeight - sc.scrollTop - sc.clientHeight - (spRef.current?.offsetHeight || 0) > 300); }}
      onWheel={e => {
        const p = pullRef.current; clearTimeout(p.wt);
        if (e.deltaY <= 0 || busy || !atBottom()){ p.wheel = 0; setPull(0); return; }
        p.wheel += e.deltaY; setPull(p.wheel > 350 ? 2 : 1);
        if (p.wheel > 350){ p.wheel = 0; setPull(0); goOn(); } else p.wt = setTimeout(() => { p.wheel = 0; setPull(0); }, 500);
      }}
      onTouchStart={e => { pullRef.current.y = !busy && atBottom() ? e.touches[0].clientY : -1; }}
      onTouchMove={e => { const p = pullRef.current; if (p.y < 0) return; const d = p.y - e.touches[0].clientY; setPull(d > 90 ? 2 : d > 20 ? 1 : 0); }}
      onTouchEnd={() => { if (pull === 2) goOn(); pullRef.current.y = -1; setPull(0); }}>
      <div id="log" className={st.narrColor === 'black' ? 'narr-black' : ''}>{log}{pull > 0 && <div className="pull-hint">{pull === 2 ? '놓으면 이야기가 이어져요' : '더 올리면 이야기가 이어져요'}</div>}<div ref={spRef} aria-hidden="true"/></div></div>
    {menu && <MsgMenu at={menu} items={menu.items} onClose={() => setMenu(null)}/>}
    <div className="dock">
      {far && <button className="jump" aria-label="맨 아래로" onClick={() => { const sc = scRef.current; sc.scrollTo({top:sc.scrollHeight - (spRef.current?.offsetHeight || 0) - sc.clientHeight + 40, behavior:'smooth'}); }}><Icon n="chev"/></button>}
      {pop === 'sug' && <div className="pop">
        {!sug ? <div className="sug-load">추천 답변을 만드는 중…</div> : <div className="sug-wrap">{sug.map((o, i) => <div key={i} className="sug">
          <button className="pen" aria-label="고쳐서 보내기" onClick={() => { closePop(); setText(o); inpRef.current?.focus(); }}><Icon n="pen"/></button>
          <button className="body" onClick={() => doSend(o)}><Inline s={o}/></button>
        </div>)}</div>}
      </div>}
      {pop === 'sc' && <div className="pop">
        <div className="tabs">{[['all','전체'],['st','스토리 단축어'],['me','내 단축어']].map(([k, n]) => <button key={k} className={ui.scTab === k ? 'on' : ''} onClick={() => { ui.scTab = k; commit(); }}>{n}</button>)}</div>
        <div className="sclist">{scList.length ? scList.map(s => <div key={s.owner + s.id} className="sci">
          <button className="mid" style={{textAlign:'left'}} onClick={() => { setText('/' + s.name + ' '); closePop(); inpRef.current?.focus(); }}><b>/{s.name}</b><span className={'tag ' + s.owner}>{s.owner === 'me' ? '나' : '스토리'}</span><span className="ds">{s.desc}</span></button>
          <button className="more" aria-label="단축어 수정" onClick={() => go('shortcut', {chatId:c.id, owner:s.owner, id:s.id})}>···</button>
        </div>) : <div className="sug-load">맞는 단축어가 없어요</div>}</div>
        <button className="addsc" onClick={() => go('shortcut', {chatId:c.id, owner: ui.scTab === 'st' ? 'st' : 'me', id:null})}>+ 단축어 추가</button>
      </div>}
      <div className="composer">
        <textarea ref={inpRef} rows="1" placeholder="메시지 보내기" value={text} onChange={e => onInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(pointer:coarse)').matches){ e.preventDefault(); doSend(text); } }}/>
        <div className="tools">
          <button className="circ" aria-label="행동 별표 넣기" onClick={star}><Icon n="star"/></button>
          <button className={'circ ' + (pop === 'sug' ? 'on' : '')} aria-label="추천 답변" onClick={() => pop === 'sug' ? closePop() : openSuggest()}><Icon n="sug"/></button>
          <button className={'circ ' + (pop === 'sc' ? 'on' : '')} aria-label="단축어" onClick={() => { if (pop === 'sc') closePop(); else { setScQuery(''); setPop('sc'); } }}><Icon n="slash"/></button>
          <button className="circ zap" aria-label="모델 선택" style={{color:md.color}} onClick={() => openSheet(<ModelSheet chat={c}/>)}><Icon n={md.icon}/></button>
          <span className="grow"/>
          <button className={'send ' + (!busy && text.trim() ? 'ready' : '')} aria-label={busy ? '중지' : text.trim() ? '전송' : '이야기 이어서'} onClick={() => busy ? run.abort?.abort() : text.trim() ? doSend(text) : goOn()}>
            <Icon n={busy ? 'stop' : text.trim() ? 'arrow' : 'play'}/>
          </button>
        </div>
      </div>
    </div>
  </>;
}
