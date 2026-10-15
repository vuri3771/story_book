// ================= 기본 데이터 =================
export const MODELS = [
  {id:'claude-fable-5-1', name:'Fable 5.1', desc:'가장 뛰어난 모델. 복잡한 관계와 긴 서사도 깊이 있게', in:10, out:50, cr:0.25, color:'#f0892b', icon:'spark', fb:true},
  {id:'claude-opus-5-5', name:'Opus 5.5', desc:'살아 숨쉬는 캐릭터와 압도적 몰입감, 가격 대비 최고', in:4, out:20, cr:0.2, color:'#4f7cff', icon:'zap', fb:true, rec:true},
  {id:'claude-opus-5', name:'Opus 5', desc:'문학적인 서사로 매 순간이 명장면인 스토리', in:5, out:25, cr:0.5, color:'#34b46a', icon:'zap', fb:true},
  {id:'claude-sonnet-5-5', name:'Sonnet 5.5', desc:'빠르고 능동적인 전개를 절반 가격에', in:2, out:10, cr:0.2, color:'#16a3a3', icon:'zap', fb:true},
  {id:'claude-haiku-5-5', name:'Haiku 5.5', desc:'아주 저렴하게 가볍게 즐기는 스토리', in:0.1, out:0.5, cr:0.01, color:'#e2553f', icon:'zap'},
  {id:'novelai', name:'NovelAI', desc:'성인 장면을 허용하는 모델. NovelAI 구독(정액)으로 써요', in:0, out:0, cr:0, color:'#9b6bff', icon:'spark', provider:'nai'}
];
export const NAI_BASE = 'https://text.novelai.net/oa/v1';
export const STYLES = {
  novel:{name:'웹소설 (기본)', text:'3인칭 웹소설 문체. 감각적인 묘사와 인물의 미세한 표정과 행동을 살린다.'},
  lit:{name:'문학적인 서사', text:'문학적이고 밀도 높은 문장. 비유와 여운을 살리고 장면을 영화처럼 그린다.'},
  light:{name:'가볍고 빠른 전개', text:'짧은 문장과 대사 위주로 빠르고 경쾌하게 전개한다.'},
  first:{name:'캐릭터 1인칭 시점', text:'주요 캐릭터의 1인칭 시점으로 서술하고 그 인물의 속마음을 드러낸다.'},
  custom:{name:'직접 입력', text:''}
};
export const LENGTHS = {short:{name:'짧게', rule:'응답 본문은 2~3문단으로 짧게 쓴다.', max:3000}, normal:{name:'보통', rule:'응답 본문은 4~6문단으로 쓴다.', max:5000}, long:{name:'길게', rule:'응답 본문은 7~10문단으로 길고 풍부하게 쓴다.', max:9000}};
export const EFFORTS = {low:'빠르게', medium:'보통', high:'깊게'};
export const DEFAULT_INFO = '2025년 | 📅 3월 14일(금) PM 07:52 | 📍 장소\n[👥]\n이름 | 표정 이모지 | 지금 상태 한 단어';
export const DEFAULT_SHORTCUTS = [
  {id:'sc_diary', name:'일기', desc:'캐릭터의 일기를 몰래 살펴보세요.', body:'# 일기\n- 롤플레이를 잠시 멈추고 코드블록 하나만 출력한 뒤 끝낸다.\n- "/일기 캐릭터명"이면 그 캐릭터의 일기, 이름이 없으면 {char}의 일기를 쓴다.\n- 그 캐릭터 시점에서 오늘 있었던 일을 세계관에 맞는 형식(일기, 편지 등)으로 쓴다.\n- 평소 드러내지 않는 속마음, 특히 {user}에게 차마 꺼내지 못한 감정을 캐릭터 말투 그대로 솔직하게 쓴다.\n- 캐릭터는 일기가 읽혔다는 사실을 모른다. 다음 턴부터 롤플레이로 정상 복귀한다.\n\n## 출력 형식\n(캐릭터)의 일기\n📅 (날짜·시점)\n\n(본문)\n\nPS. (짧은 추신)'},
  {id:'sc_inner', name:'속마음', desc:'등장인물의 현재 속마음을 몰래 살펴보세요.', body:'- 롤플레이를 잠시 멈추고 코드블록 하나만 출력한 뒤 끝낸다.\n- 지금 장면에 있는 등장인물 각각의 현재 속마음을 한두 문장씩 각자의 말투로 쓴다.\n- 형식: 이름 | 속마음\n- 다음 턴부터 롤플레이로 정상 복귀한다.'},
  {id:'sc_sum', name:'요약', desc:'현재 상황을 요약 정리합니다.', body:'- 롤플레이를 잠시 멈추고 코드블록 하나만 출력한 뒤 끝낸다.\n- 지금까지의 줄거리, 인물 관계, 현재 위치와 목표, 풀리지 않은 떡밥을 항목별로 짧게 정리한다.'},
  {id:'sc_skip', name:'시간', desc:'시간을 건너뛰어 다음 장면으로 넘어갑니다.', body:'- "/시간 내용"이면 그 내용만큼, 없으면 자연스러운 만큼 시간을 건너뛰어 다음 장면을 시작한다.'},
  {id:'sc_go', name:'계속', desc:'내 행동 없이 이야기를 이어서 진행합니다.', body:'- {user}의 새 행동 없이 이야기를 자연스럽게 이어서 진행한다.'}
];
export const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
export function defaultState(){
  return {v:2, settings:{apiKey:'', model:'claude-opus-5-5', helperModel:'claude-haiku-5-5', effort:'low', length:'normal', keepRecent:30, summarizeEvery:20, krw:1400, noFallback:false, naiKey:'', naiModel:'glm-4-6', naiBase:NAI_BASE},
    personas:[{id:uid(), name:'나', desc:''}], stories:[], chats:[], shortcuts: DEFAULT_SHORTCUTS.map(x => ({...x})), usage:{krw:0}, wallet:{balance:0, history:[]}};
}

// 충전 상품, 1크레딧 = 1원
export const PACKAGES = [
  {id:'c3000', price:3000, bonus:0},
  {id:'c5000', price:5000, bonus:250},
  {id:'c10000', price:10000, bonus:1000, best:true},
  {id:'c30000', price:30000, bonus:4500},
  {id:'c50000', price:50000, bonus:10000}
];
export const PAY_METHODS = [{id:'card', name:'신용, 체크카드'}, {id:'kakao', name:'카카오페이'}, {id:'toss', name:'토스페이'}];

// 답변 길이별 예상 글자 수, 게이지 계산용
export const EXPECTED_CHARS = {short:700, normal:1300, long:2600};
export function newStory(){
  return {id:uid(), title:'', intro:'', cover:'', world:'', adult:false, commonRules:'', characters:[{id:uid(), name:'', profile:'', image:''}],
    greeting:'', guide:'', infoOn:true, info:DEFAULT_INFO, memory:'', images:[], shortcuts:[], created:Date.now()};
}
