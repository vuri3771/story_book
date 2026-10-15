// 글꼴, 글자 크기, 자간, 줄 간격, 문단 간격 : 첫 화면이 바로 그려지게 이 기기에도 두고, settings.look 으로 서버 동기화한다
const KEY = 'storychat_look';
const G = 'https://fonts.googleapis.com/css2?display=swap&family=';

export const FONTS = [
  {id:'noto', name:'노토 산스', family:'"Noto Sans KR"'},
  {id:'pretendard', name:'프리텐다드', family:'"Pretendard Variable"', css:'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'},
  {id:'nanumgothic', name:'나눔고딕', family:'"Nanum Gothic"', css:G + 'Nanum+Gothic:wght@400;700'},
  {id:'gowundodum', name:'고운돋움', family:'"Gowun Dodum"', css:G + 'Gowun+Dodum'},
  {id:'nanummyeongjo', name:'나눔명조', family:'"Nanum Myeongjo"', css:G + 'Nanum+Myeongjo:wght@400;700'},
  {id:'gowunbatang', name:'고운바탕', family:'"Gowun Batang"', css:G + 'Gowun+Batang:wght@400;700'},
  {id:'system', name:'기기 기본', family:'system-ui'},
];
export const SIZE_MIN = 0.8, SIZE_MAX = 1.5;
// 조절 항목 : 범위와 기본값. ls 는 em, lh 와 pg 는 기본값 대비 배수
export const KNOBS = {
  ls:{min:-0.05, max:0.1, step:0.01, def:0},
  lh:{min:0.8, max:1.3, step:0.05, def:1},
  pg:{min:0, max:2.5, step:0.25, def:1},
};
const FALLBACK = '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';

export const DEFAULT_LOOK = {font:'noto', size:1, ls:0, lh:1, pg:1};
export const look = {...DEFAULT_LOOK};
try { Object.assign(look, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){}

const loaded = new Set();
export function loadFont(f){
  if (!f?.css || loaded.has(f.id)) return;
  loaded.add(f.id);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = f.css;
  document.head.appendChild(l);
}

export function applyLook(){
  const f = FONTS.find(x => x.id === look.font) || FONTS[0];
  loadFont(f);
  const r = document.documentElement.style;
  r.setProperty('--font', `${f.family},${FALLBACK}`);
  r.setProperty('--fz', String(look.size));
  r.setProperty('--ls', look.ls + 'em');
  r.setProperty('--lh', String(look.lh));
  r.setProperty('--pg', String(look.pg));
}

const clamp = (v, min, max, step, def) => { v = +v; if (!isFinite(v)) return def; return Math.min(max, Math.max(min, Math.round(v / step) * step)); };
export function setLook(patch){
  Object.assign(look, patch);
  look.size = clamp(look.size, SIZE_MIN, SIZE_MAX, .05, 1);
  for (const [k, o] of Object.entries(KNOBS)) look[k] = +clamp(look[k], o.min, o.max, o.step, o.def).toFixed(3);
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch(e){}
  applyLook();
}
// 다른 기기에서 받은 값(settings.look)을 이 기기에 적용한다
export function adoptLook(v){
  if (!v || typeof v !== 'object') return;
  if (Object.keys(DEFAULT_LOOK).every(k => (v[k] ?? DEFAULT_LOOK[k]) === look[k])) return;
  setLook({...DEFAULT_LOOK, ...v});
}
