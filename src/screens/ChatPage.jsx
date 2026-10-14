import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useStore, ui, go, back, goHome, commit, openSheet, openDrawer, toast } from '../lib/store';
import { EXPECTED_CHARS } from '../lib/constants';
import { chatById, storyOf, modelOf, fill, won } from '../lib/helpers';
import { allShortcuts } from '../lib/prompt';
import { run, send, regen, suggest } from '../lib/engine';
import { renderAI, renderUser, Inline, pickScene } from '../render';
import { ask, ModelSheet, EditMsgSheet } from '../sheets';
import ChatMenu from './MenuPage';
import { Icon } from '../icons';

// 생성 진행률 : 첫 글자 전에는 시간에 따라 14%까지, 그 뒤로는 예상 길이 대비 쓴 글자 수
function progressOf(c){
  if (!run.text) return 14 * (1 - Math.exp(-(Date.now() - run.startedAt) / 2500));
  const expect = Math.max(EXPECTED_CHARS[c.length || 'normal'], (c.minChars || 0) * 1.1) + 150;
  return Math.min(97, 14 + 83 * Math.min(1, run.text.length / expect));
}

export default function ChatPage({id}){
  useStore();
  const c = chatById(id);
  const [text, setText] = useState('');
  const [pop, setPop] = useState(() => { const p = ui.pendingPop; ui.pendingPop = null; return p; });
  const [scQuery, setScQuery] = useState('');
  const [sug, setSug] = useState(null);
  const [openActs, setOpenActs] = useState(() => new Set());
  const popRef = useRef(pop); popRef.current = pop;
  const inpRef = useRef(null), scRef = useRef(null), lenRef = useRef(-1);

  // 입력창 높이 자동 조절
  useLayoutEffect(() => { const t = inpRef.current; if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }, [text]);

  // 새 메시지가 붙으면 맨 아래로, 스트리밍 중엔 바닥 근처에 있을 때만 따라간다
  useLayoutEffect(() => {
    const sc = scRef.current; if (!sc || !c) return;
    if (lenRef.current !== c.messages.length){ lenRef.current = c.messages.length; sc.scrollTop = sc.scrollHeight; }
    else if (run.busy && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 200) sc.scrollTop = sc.scrollHeight;
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
    const streaming = busy && m.role === 'assistant' && i === c.messages.length - 1;
    const t = streaming ? run.text : m.text;
    let body;
    if (m.role !== 'assistant') body = renderUser(m.text);
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
    } else if (!streaming){
      acts = <div className="acts" hidden={!openActs.has(i)}><button onClick={edit}>수정</button>{m.role === 'user' && <button onClick={delFrom}>삭제</button>}</div>;
    }
    const toggle = e => { if (e.target.closest('button')) return; const n = new Set(openActs); n.has(i) ? n.delete(i) : n.add(i); setOpenActs(n); };
    return <div key={i} className={'m ' + m.role} onClick={toggle}>{body}{acts}</div>;
  });

  const scList = pop === 'sc' ? allShortcuts(c).filter(s => (ui.scTab === 'all' || s.owner === ui.scTab) && (!scQuery || s.name.includes(scQuery))) : [];

  return <>
    <div className="hdr">
      <button className="icon-btn" aria-label="뒤로" onClick={() => { if (busy) run.abort?.abort(); back(); }}><Icon n="back"/></button>
      <div className="t">{st.title}</div>
      <button className="icon-btn" aria-label="메뉴" onClick={() => openDrawer(<ChatMenu id={c.id}/>)}><Icon n="menu"/></button>
      {busy && <div className="gauge" role="progressbar" aria-label="답변 생성 중" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{width: pct + '%'}}/></div>}
    </div>
    <div className="scroll" ref={scRef}><div id="log">{log}</div></div>
    <div className="dock">
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
          <button className={'send ' + (!busy && text.trim() ? 'ready' : '')} aria-label={busy ? '중지' : '전송'} onClick={() => busy ? run.abort?.abort() : doSend(text)}>
            <Icon n={busy ? 'stop' : text.trim() ? 'arrow' : 'play'}/>
          </button>
        </div>
      </div>
    </div>
  </>;
}
