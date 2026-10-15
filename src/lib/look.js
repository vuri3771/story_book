// 글꼴과 대화 글자 크기 : 휴대폰과 PC 가 다르게 쓰고 싶을 수 있어 서버 동기화 없이 이 기기에만 저장한다
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
const FALLBACK = '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';

export const look = {font:'noto', size:1};
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
}

export function setLook(patch){
  Object.assign(look, patch);
  look.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(look.size * 20) / 20));
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch(e){}
  applyLook();
}
