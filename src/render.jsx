// ================= 대화 렌더링 =================
// 서술 : 회색 문단 / 대사 : 이름 | "대사" / ```info``` : INFO 창 / ``` : 박스 / [[이미지:이름]] : 장면 이미지
import { Fragment } from 'react';

// **굵게** : 굵은 글씨 / *행동* : 상황 설명(회색) / "대사"
export function Inline({s}){
  const t = String(s ?? '');
  return t.split(/(\*\*[^*]+\*\*|\*[^*]+\*|"[^"]*"|“[^”]*”)/g).filter(Boolean).map((x, i) => {
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

function Info({body, turn}){
  const lines = body.trim().split('\n');
  return <div className="info"><div className="ih">INFO</div><div className="ib">{lines.map((ln, i) => {
    const parts = ln.split(/\s*\|\s*/);
    let c;
    if (i === 0) c = <>{turn ? <><b>T{turn}</b> | </> : null}{parts.map((p, j) => <Fragment key={j}>{j > 0 && ' | '}<span className={j <= 1 ? 'a' : j === 2 ? 'b' : ''}>{p}</span></Fragment>)}</>;
    else if (parts.length > 1) c = <><span className="a">{parts[0]}</span> | {parts.slice(1).join(' | ')}</>;
    else c = ln;
    return <Fragment key={i}>{i > 0 && '\n'}{c}</Fragment>;
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
    for (const raw of p.split('\n')){
      const line = raw.trim(); if (!line || /^\[\[\s*19\s*\]\]$/.test(line)) continue;
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
export const Badge19 = ({className = ''}) => <span className={'b19 ' + className} aria-label="19세 이상">19</span>;

// 내 메시지 : /단축어는 파란 굵은 글씨, OOC 는 작은 회색 글씨로 구분한다
function UserLine({s}){
  return s.split(/((?:^|\s)\/[^\s/]+|[(\[]\s*O[OC]C[^)\]]*[)\]])/gi).filter(Boolean).map((x, i) => {
    if (/^\s*\/[^\s/]+$/.test(x)) return <Fragment key={i}>{x.match(/^\s*/)[0]}<b className="sc">{x.trim()}</b></Fragment>;
    if (/^[(\[]\s*O[OC]C/i.test(x)) return <span key={i} className="ooc">{x}</span>;
    return <Inline key={i} s={x}/>;
  });
}
export function renderUser(text){ return String(text).split('\n').filter(l => l.trim()).map((l, i) => /^\s*O[OC]C\s*[:：]/i.test(l) ? <p key={i} className="ooc">{l}</p> : <p key={i}><UserLine s={l}/></p>); }
