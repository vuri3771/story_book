// ================= 대화 렌더링 =================
// 서술 : 회색 문단 / 대사 : 이름 | "대사" / ```info``` : INFO 창 / ``` : 박스 / [[이미지:이름]] : 장면 이미지
import { Fragment } from 'react';

// **굵게** : 굵은 글씨 / *행동* : 상황 설명(회색) / "대사"
export function Inline({s}){
  const t = String(s ?? '');
  return t.split(/(\*\*[^*]+\*\*|\*[^*]+\*|"[^"]*"|“[^”]*”|「[^」]*」|『[^』]*』)/g).filter(Boolean).map((x, i) => {
    if (/^[「『]/.test(x)) return <span key={i} className="q">{x}</span>;
    if (x.length > 4 && x.startsWith('**') && x.endsWith('**')) return <b key={i}>{x.slice(2, -2)}</b>;
    if (x.length > 2 && x[0] === '*' && x.endsWith('*')) return <i key={i}>{x.slice(1, -1)}</i>;
    if (x.length > 1 && /^["“]/.test(x) && /["”]$/.test(x)) return <span key={i} className="q">{x}</span>;
    return <Fragment key={i}>{x}</Fragment>;
  });
}

function findImage(st, tag){
  if (!st) return null; tag = tag.trim();
  const all = [...(st.images||[]), ...st.characters.filter(c => c.image).map(c => ({tag:c.name, data:c.image}))];
  return all.find(i => i.tag === tag) || all.find(i => i.tag && (i.tag.includes(tag) || tag.includes(i.tag)));
}

// INFO 첫 줄 색 : 크랙처럼 숫자는 주황, 시각(AM12:23)은 청록, 나머지 글자는 밝은 회색
// 크랙처럼 T 는 흰 굵은 글씨에 숫자만 주황, 연도와 날짜 낱말(2025년, 9월25일(목))은 통째로 주황, 시각은 청록
function InfoHead({s}){
  return s.split(/((?:AM|PM|오전|오후)\s?\d{1,2}:\d{2}|\s+)/).filter(Boolean).map((x, i) => {
    if (/^(AM|PM|오전|오후)/.test(x)) return <span key={i} className="b">{x}</span>;
    const t = x.match(/^([T𝗧])(\d+)$/);
    if (t) return <Fragment key={i}><b>{t[1]}</b><span className="a">{t[2]}</span></Fragment>;
    if (/\d/.test(x)){ const m = x.match(/^(\p{Extended_Pictographic}️?)?(.*)$/u); return <Fragment key={i}>{m[1]}<span className="a">{m[2]}</span></Fragment>; }
    return <Fragment key={i}>{x}</Fragment>;
  });
}
function Info({body, turn}){
  const lines = body.trim().split('\n');
  return <div className="info"><div className="ih">INFO</div><div className="ib">{lines.map((ln, i) => {
    const parts = ln.split(/\s*[|｜]\s*/);
    let c;
    if (i === 0) c = <>{turn && !/^\s*[T𝗧]\d/.test(ln) ? <><b>T</b><span className="a">{turn}</span> | </> : null}{parts.map((p, j) => <Fragment key={j}>{j > 0 && ' | '}<InfoHead s={p}/></Fragment>)}</>;
    else if (parts.length > 1) c = <><span className="n">{parts[0]}</span> | {parts.slice(1).join(' | ')}</>;
    else c = ln;
    // 크랙처럼 첫 줄과 인물 목록 사이를 한 줄 띄운다
    const gap = i === 1 && ln.trim() && lines[0].trim() ? '\n\n' : '\n';
    return <Fragment key={i}>{i > 0 && gap}{c}</Fragment>;
  })}</div></div>;
}

// 모델이 [[이미지:이름]] 을 안 썼을 때, 답변 내용과 이미지 키워드를 맞춰 장면 이미지를 고른다
// INFO 창의 장소, 시간도 같이 본다. 바로 앞 답변과 같은 이미지는 다시 띄우지 않는다
export function pickScene(text, st, avoid){
  if (!st || st.autoImages === false) return null;
  const imgs = (st.images || []).filter(i => i.tag?.trim());
  if (!imgs.length || /\[\[\s*이미지/.test(text)) return null;
  const body = String(text).replace(/```\w*/g, ' ');
  let best = null, bs = 0;
  for (const im of imgs){
    const words = im.tag.split(/[,，/·\s]+/).map(w => w.trim()).filter(w => w.length >= 2);
    let s = 0;
    for (const w of words) if (body.includes(w)) s += w.length >= 3 ? 2 : 1;
    if (s > bs){ bs = s; best = im; }
  }
  return best && best !== avoid ? best : null;
}

const avatarOf = (st, who) => {
  const n = who.trim();
  return st?.characters.find(c => c.image && c.name && (n === c.name || n.includes(c.name)));
};

// 인물 사진 동그라미 : face 가 있으면 그림의 얼굴 부분만 확대해서 보여준다
// face = {x, y : 얼굴 가운데 위치(그림 너비, 높이 대비 %), w : 동그라미에 담을 너비(그림 너비 대비 %)}
export function Ava({ch, className, style}){
  const f = ch.face;
  if (!f) return <img className={className} style={style} src={ch.image} alt=""/>;
  return <span className={'ava-crop ' + (className || '')} style={style}>
    <img src={ch.image} alt="" style={{width:(10000 / f.w) + '%', transform:`translate(-${f.x}%, -${f.y}%)`}}/>
  </span>;
}

export function renderAI(text, st, turn, scene){
  const out = []; let k = 0, infoAt = -1;
  for (const p of String(text).split(/(```[\s\S]*?(?:```|$))/g)){
    if (!p) continue;
    if (p.startsWith('```')){
      const lang = (p.match(/^```(\w*)/) || [])[1];
      const body = p.replace(/^```\w*\n?/, '').replace(/```$/, '');
      if (lang === 'info' || (/^\s*\d{4}년|📍/.test(body) && out.length === 0)){ if (infoAt < 0) infoAt = out.length; out.push(<Info key={k++} body={body} turn={turn}/>); }
      else out.push(<div key={k++} className="cblock">{body.trim()}</div>);
      continue;
    }
    // 대사는 검은색, 서술만 회색 : 이름 | "대사" 말고도 ⸺ 이름 / ⌜ 이름 ⌟ 다음 줄의 「대사」, "대사", (번역)도 대사로 본다
    let afterDlg = false;
    for (const raw of p.split('\n')){
      const line = raw.trim(); if (!line){ afterDlg = false; continue; } if (/^\[\[\s*19\s*\]\]$/.test(line)) continue;
      const who = line.match(/^⸺\s*\**\s*([^*「"“]{1,24}?)\s*\**$/) || line.match(/^⌜\s*([^⌟]{1,24})\s*⌟$/);
      if (who){ const av = avatarOf(st, who[1].replace(/\s+/g, '')) || avatarOf(st, who[1]); out.push(<p key={k++} className="dlg who-line">{av && <Ava ch={av} className="ava"/>}<span className="who">{who[1]}</span></p>); afterDlg = true; continue; }
      if (/^\**\s*[「『"“]/.test(line) || (afterDlg && /^\**\s*\(/.test(line))){ out.push(<p key={k++} className="dlg"><Inline s={line}/></p>); afterDlg = true; continue; }
      afterDlg = false;
      const im =line.match(/^\[\[\s*이미지\s*[:：]\s*(.+?)\s*\]\]$/);
      if (im){ const f = findImage(st, im[1]); if (f) out.push(<figure key={k++} className="scene"><img src={f.data} alt={f.tag}/></figure>); continue; }
      const d = line.match(/^([^|"“*\[]{1,24}?)\s*[|｜]\s*(.+)$/);
      if (d){ const av = avatarOf(st, d[1]); out.push(<p key={k++} className="dlg">{av && <Ava ch={av} className="ava"/>}<span className="who">{d[1]}</span><span className="bar">|</span><Inline s={d[2]}/></p>); continue; }
      out.push(<p key={k++} className="narr"><Inline s={line}/></p>);
    }
  }
  if (scene) out.splice(infoAt + 1, 0, <figure key="scene" className="scene"><img src={scene.data} alt={scene.tag}/></figure>);
  return out;
}

// 19금 뱃지
// 혼자 쓰는 앱이라 19 표시는 그리지 않는다. 부르는 곳은 그대로 둬도 아무것도 안 나온다
export const Badge19 = () => null;

// 내 메시지 : /단축어는 파란 굵은 글씨, OOC 는 작은 회색 글씨로 구분한다
function UserLine({s}){
  return s.split(/((?:^|\s)\/[^\s/]+|[(\[]\s*O[OC]C[^)\]]*[)\]])/gi).filter(Boolean).map((x, i) => {
    if (/^\s*\/[^\s/]+$/.test(x)) return <Fragment key={i}>{x.match(/^\s*/)[0]}<b className="sc">{x.trim()}</b></Fragment>;
    if (/^[(\[]\s*O[OC]C/i.test(x)) return <span key={i} className="ooc">{x}</span>;
    return <Inline key={i} s={x}/>;
  });
}
export function renderUser(text){ return String(text).split('\n').filter(l => l.trim()).map((l, i) => /^\s*O[OC]C\s*[:：]/i.test(l) ? <p key={i} className="ooc">{l}</p> : <p key={i}><UserLine s={l}/></p>); }
