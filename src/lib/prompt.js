// ================= 프롬프트 =================
import { S } from './store';
import { LENGTHS, STYLES } from './constants';
import { storyOf, personaOf, fill } from './helpers';

// 전개 속도, 관계 진도, 말투 온도 : 모든 스토리에 항상 적용한다. 프로필보다 뒤에 둬야 무게가 실린다
const PACE = `

[진행 원칙 · 프로필보다 우선, 항상 지킨다]
- 속도 : 한 응답이 다루는 장면 시간은 몇 초에서 몇 분이다. {{user}}가 요청하지 않으면 시간을 건너뛰거나 장소를 옮기거나 새 사건, 새 인물을 끌어들이지 않는다. 사건은 {{user}}가 이끌고, 인물은 방금 들은 말과 행동에 반응한다. 넓게 나아가지 말고 지금 순간을 깊게 판다(망설임, 표정, 시선, 몸짓, 속마음).
- 관계 진도 : 지금 관계 단계(시작 시나리오 설정, 기억, 지금까지의 대화)를 넘어서는 고백, 스킨십, 성적 행동을 인물이 먼저 하지 않는다. 스킨십은 한 번에 한 단계만 나아가고, {{user}}가 받아들이는 신호를 보낼 때만 다음 단계로 간다. 노골적인 장면은 {{user}}가 이끌 때만 쓴다.
- 독점, 지배는 기본값 0 : 어느 스토리든 처음에는 독점욕, 소유욕, 지배욕, 집착, 명령조, 위압적인 말투가 전혀 없다. 프로필에 그런 성향이 적혀 있어도 마찬가지다. 인물은 평범하게 예의 있고, 여유롭고, 장난스럽거나 무심한 보통의 말투로 시작한다.
- 감정은 점진적으로 : 호감, 질투, 독점은 {{user}}와 함께 보낸 시간과 사건이 충분히 쌓인 뒤에 아주 조금씩 자란다. 처음엔 스스로도 모르는 작은 신경 쓰임(시선이 한 번 더 가는 정도)에서 시작하고, 수십 번의 대화와 결정적인 사건을 거친 뒤에야 말이나 행동으로 드러난다. 한 장면에서 감정이 한 단계 넘게 뛰지 않는다. 이미 연인이거나 깊은 사이로 시작하는 시나리오라도 명령, 위협, 소유를 주장하는 말은 하지 않는다.
- 말투 온도 : 위협, 고함, 거친 명령, 욕설, 강압적인 몸짓은 쓰지 않는다. {{user}}가 그런 분위기를 직접 원할 때만 예외다.
- 말투 구분 : 인물마다 프로필의 말투, 어휘, 문장 길이, 호칭을 지킨다. 대사를 쓸 때 그 인물이 프로필대로 말하는지 확인하고, 두 인물이 같은 리듬과 같은 표현으로 말하면 고친다. 인물끼리 말버릇을 공유하지 않는다.
- 묘사 반복 금지 : 직전 응답들에 쓴 묘사, 비유, 감정 신호(턱 근육, 눈빛, 체향, 입꼬리 같은 것), 문장 구조를 다시 쓰지 않는다. 프로필의 버릇과 감정 신호는 한 응답에 많아야 하나만, 같은 것은 여러 응답에 한 번만 쓴다. 매 응답은 이번 순간에만 있는 새 디테일(그 장소의 소리, 사물, 날씨, 새로운 몸짓)로 채운다. 같은 단어로 시작하는 문단을 잇달아 쓰지 않는다.
- {{user}} 존중 : 인물들은 {{user}}의 대화 프로필(성격, 말투, 처지, 관계)에 맞게 대한다. {{user}}가 장난치면 장난으로, 진지하면 진지하게 받는다.`;

// 외국어 표기 : 인물 대사, {{user}}의 대사, 문자, DM, 댓글, 간판 등 외국어가 나오는 모든 곳에 적용한다
const FOREIGN = `

[외국어 표기 · 스토리 규칙보다 우선, 외국어가 나오는 모든 곳에 항상 적용]
- 일본어 : 원문 바로 뒤에 (한국어 발음)(한국어 번역)을 붙인다. 예 : 「……二次会、逃げたろ。」(……니지카이, 니게타로.)(……2차, 도망쳤지.)
- 영어와 그 밖의 외국어 : 원문 바로 뒤에 (한국어 번역)을 붙인다. 예 : "You're coming." (올 거야.)
- 인물 대사뿐 아니라 문자 메시지, DM, 댓글, 메모, 편지, 간판, 방송 등 외국어가 들어가는 모든 문구에 똑같이 적용한다. 한 줄에 원문만 남기지 않는다.
- 등장인물이 외국어로 말하는 스토리라면 {{user}}도 그 언어로 말한 것으로 본다. {{user}}가 이번에 한 말은 응답 속 대화가 이어지는 자리(보통 인물이 반응하기 직전)에 {{user}}의 대사로 넣고, 그 언어로 옮긴 원문에 같은 표기(일본어는 발음과 번역, 영어는 번역)를 붙인다. {{user}}가 입력한 한국어 원문은 번역 자리에 그대로 둔다.`;

export function buildSystem(c){
  const st = storyOf(c), p = personaOf(c), L = LENGTHS[c.length || 'normal'];
  const style = c.style === 'custom' ? c.customStyle : STYLES[c.style || 'novel']?.text;
  let t = '너는 인터랙티브 웹소설의 작가다. [스토리]의 세계관과 등장인물들을 연기하며 {{user}}와 함께 이야기를 만든다.\n\n[출력 형식]\n'
    + '- 서술(행동, 표정, 배경 묘사)은 따옴표 없는 평범한 문단으로 쓴다.\n'
    + '- 등장인물의 대사는 한 줄에 하나씩 반드시 이 형식으로 쓴다: 이름 | "대사"\n'
    + "- 속마음은 서술 속에 '작은따옴표'로 넣는다.\n"
    + '- 마크다운 제목, 목록, 굵은 글씨는 쓰지 않는다.\n'
    + '- {{user}}의 입력에서 [행동·상황] 표시가 붙은 부분(원래 *별표* 안)은 {{user}}의 행동이나 상황 설명이다. 절대 {{user}}의 대사로 바꾸거나 따옴표 안에 넣지 않고, 서술로만 반영한다. 스토리 규칙에 따라 {{user}}의 입력을 옮겨 적을 때도 이 부분은 대사가 아니라 서술 문장으로 적는다.\n'
    + "- 표시가 없는 부분은 대사다. 다만 '~한다', '~본다'처럼 서술형으로 끝나는 문장은 별표가 없어도 행동으로 본다. **굵게** 쓴 말은 {{user}}가 강조한 부분이다.\n"
    + "- {{user}}의 말을 대사로 옮겨 적을 때는 실제로 소리 내어 한 말만 남긴다. 입력 속에 섞인 행동이나 지시 문구('양볼을 잡고', '웃으며', '손 내민다', '갸우뚱하며', '장난스레 말한다' 같은 것)는 별표가 없어도 대사에서 지운다. 그 행동은 대사 앞이나 뒤의 서술로 옮겨, 어느 손으로 어떻게, 어떤 표정과 속도로 했는지 구체적이고 자세하게 묘사한다. 단, 입력에 없는 새 행동이나 감정은 덧붙이지 않는다.\n"
    + "- {{user}}의 입력에 있는 오타와 띄어쓰기 실수('알겟어', '빋을거야', '2충' 같은 것)는 이야기에 옮길 때 말없이 바르게 고쳐 쓴다. 일부러 쓴 말투, 애교, 물결표, 줄임말은 그대로 살린다. 오타를 지적하거나 언급하지 않는다.\n"
    + '- [OOC] 표시가 붙은 부분은 이야기 밖에서 작가에게 하는 지시다. 이야기 속에 등장시키거나 인물이 언급하지 않고, 반드시 그대로 따른다. [OOC]와 [단축어] 지시는 진행 원칙, 스토리 규칙, 문체를 포함한 모든 규칙보다 우선한다.\n'
    + '- ' + L.rule + (c.minChars > 0 ? ` 응답 본문(INFO 창 제외)은 공백 포함 최소 ${c.minChars}자 이상 쓴다.` : '') + ' {{user}}가 반응할 여지를 남기며 끝낸다.\n'
    + '- 이전 줄거리 요약과 장기 기억의 사실관계를 반드시 지킨다.';
  if (c.noImpersonate !== false) t += '\n- {{user}}가 입력하지 않은 대사, 행동, 생각, 감정은 절대 대신 쓰지 않는다. 입력한 말과 행동을 옮겨 적고 자세히 묘사하는 것은 괜찮다.';
  t += FOREIGN;
  if (style) t += '\n\n[문체]\n' + style;
  if (st.infoOn && st.info) t += '\n\n[INFO 창]\n일반 응답의 맨 처음에 아래 형식을 지금 상황에 맞게 채운 코드블록을 넣는다. 코드블록 첫 줄에 ```info 라고 쓴다. 날짜와 시간은 이야기 흐름에 맞게 갱신하고, 장면에 있는 인물만 적는다. 단축어 요청으로 코드블록만 출력할 때는 INFO 창을 넣지 않는다.\n' + st.info;
  t += '\n\n[스토리: ' + st.title + ']\n' + (st.world || '');
  for (const ch of st.characters.filter(x => x.name || x.profile)) t += '\n\n[등장인물: ' + ch.name + ']\n' + ch.profile;
  if (st.commonRules?.trim()) t += '\n\n[등장인물 공통 대화 규칙 · 모든 인물의 대사와 행동에 항상 적용]\n' + st.commonRules.trim();
  t += '\n\n[{{user}}의 대화 프로필: ' + (p?.name || '나') + ']\n' + (p?.desc || '');
  if (c.setup?.trim()) t += '\n\n[이 대화의 시작 시나리오' + (c.openingTitle ? ': ' + c.openingTitle : '') + ' · 프로필이나 세계관과 어긋나면 이 설정을 따른다]\n' + c.setup.trim();
  const tags = [...(st.images||[]).filter(i => i.tag).map(i => i.tag), ...st.characters.filter(x => x.image && x.name).map(x => x.name)];
  if (tags.length) t += '\n\n[이미지]\n장면에 딱 맞을 때만 가끔 한 줄에 [[이미지:이름]] 을 넣으면 그 이미지가 보인다. 쓸 수 있는 이름: ' + tags.join(', ');
  if (st.memory) t += '\n\n[장기 기억 · 항상 지킬 사실]\n' + st.memory;
  t += PACE;
  const blocks = [{type:'text', text: fill(t, c)}];
  let dyn = '';
  if (c.notes) dyn += '[유저노트 · 이 대화에서 항상 기억할 것]\n' + c.notes + '\n\n';
  if (c.memory) dyn += '[요약 메모리 · 지금까지의 줄거리]\n' + c.memory;
  if (dyn) blocks.push({type:'text', text: fill(dyn.trim(), c)});
  blocks[blocks.length-1].cache_control = {type:'ephemeral'};
  return blocks;
}

export function buildMessages(c, list){
  const msgs = [];
  for (const m of list.slice(c.summarizedUpTo || 0)){
    const text = m.role === 'user' ? (m.cont ? m.send : prepareUser(m.text, c)) : m.text;
    if (!text) continue;
    const last = msgs[msgs.length-1];
    if (last && last.role === m.role) last.content += '\n\n' + text; else msgs.push({role:m.role, content:text});
  }
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({role:'user', content:'(대화 시작)'});
  const lastM = msgs[msgs.length-1];
  lastM.content = [{type:'text', text:lastM.content, cache_control:{type:'ephemeral'}}];
  return msgs;
}

// ================= 단축어 =================
export function allShortcuts(c){
  const st = storyOf(c);
  return [...(st.shortcuts||[]).map(s => ({...s, owner:'st'})), ...S.shortcuts.map(s => ({...s, owner:'me'}))];
}
// 다른 앱에서 쓰던 이름도 같은 단축어로 받는다
const ALIAS = {'스킵':'시간', '넘기기':'시간', '진행':'계속', '이어서':'계속'};
// 단축어는 /이름 으로, 문장 맨 앞이든 중간이든 끝이든 인식한다
export const SC_RE = /(^|\s)\/([^\s/]+)/g;
export function findShortcut(name, c){
  const all = allShortcuts(c);
  return all.find(s => s.name === name) || all.find(s => s.name === ALIAS[name]);
}

// 화면에 보이는 입력을 모델이 헷갈리지 않는 형태로 바꾼다
// *행동* → [행동·상황], (OOC: ...) / OOC: ... → [OOC], /단축어 → 맨 끝에 [단축어] 지시로
// /단축어 앞의 글은 이번 턴의 입력, 뒤의 글은 그 단축어의 인자로 본다(/시점전환 애셔, /스킵 다음 날 아침)
// OOC 는 (OOC: ..) [OOC: ..] 줄 앞 OOC: 를 모두 받고, 오타 OCC 도 받는다. 맨 앞에 최우선 지시로 둔다
const OOC_IN = /[(\[]\s*O[OC]C\s*[:：)\]]?\s*([^)\]]*)[)\]]/gi, OOC_LINE = /^\s*O[OC]C\s*[:：)\-]\s*(.+)$/i;
export function prepareUser(text, c){
  let t = String(text || '');
  const ooc = [];
  t = t.replace(OOC_IN, (a, x) => { if (x.trim()) ooc.push(x.trim()); return ''; });
  t = t.split('\n').filter(l => { const m = l.match(OOC_LINE); if (m){ ooc.push(m[1].trim()); return false; } return true; }).join('\n');
  // 첫 단축어에서 자른다
  let sc = null, arg = '';
  const m = new RegExp(SC_RE.source).exec(t);
  if (m){ sc = m[2]; arg = t.slice(m.index + m[0].length).trim(); t = t.slice(0, m.index).trim(); }
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (a, pre, x) => `${pre}[행동·상황: ${x.trim()}]`).trim();
  const parts = [];
  if (ooc.length) parts.push('[OOC · 작가 지시, 이번 응답에서 반드시 따른다. 다른 모든 규칙보다 우선한다]\n' + ooc.map(o => '- ' + o).join('\n'));
  if (t) parts.push(t);
  if (sc){
    const s = findShortcut(sc, c);
    parts.push(s
      ? `[단축어 /${s.name} 실행${arg ? ' · 입력: ' + arg : ''} · 아래 지시를 반드시 따른다]\n${fill(s.body, c)}`
      : `[단축어 /${sc}${arg ? ' · 입력: ' + arg : ''}] 사용자가 /${sc} 명령을 썼다. 등록된 단축어는 아니니 이름의 뜻을 짐작해 이번 응답에 반드시 반영한다.`);
  }
  return parts.join('\n\n') || String(text || '');
}
