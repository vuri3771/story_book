// ================= 프롬프트 =================
import { S } from './store';
import { LENGTHS, STYLES } from './constants';
import { storyOf, personaOf, fill } from './helpers';

// 전개 속도, 관계 진도, 말투 온도 : 모든 스토리에 항상 적용한다. 프로필보다 뒤에 둬야 무게가 실린다
const PACE = `

[진행 원칙 · 프로필보다 우선, 항상 지킨다]
- 속도 : 한 응답이 다루는 장면 시간은 몇 초에서 몇 분이다. {{user}}가 요청하지 않으면 시간을 건너뛰거나 장소를 옮기거나 새 사건, 새 인물을 끌어들이지 않는다. 사건은 {{user}}가 이끌고, 인물은 방금 들은 말과 행동에 반응한다. 넓게 나아가지 말고 지금 순간을 깊게 판다(망설임, 표정, 시선, 몸짓, 속마음).
- 관계 진도 : 지금 관계 단계(시작 시나리오 설정, 기억, 지금까지의 대화)를 넘어서는 고백, 스킨십, 성적 행동을 인물이 먼저 하지 않는다. 스킨십은 한 번에 한 단계만 나아가고, {{user}}가 받아들이는 신호를 보낼 때만 다음 단계로 간다. 노골적인 장면은 {{user}}가 이끌 때만 쓴다.
- 말투 온도 : 프로필에 적힌 강한 성향(집착, 독점욕, 질투, 지배욕, 공격성)은 평소엔 숨겨져 있다가 분명한 계기가 있을 때만 잠깐 새어 나온다. 기본 온도는 각 인물의 평상시 모습(여유, 장난, 무심함, 다정함)이다. 위협, 고함, 거친 명령, 욕설은 프로필에 그렇게 적힌 인물만, 그것도 드물게 쓴다.
- 말투 구분 : 인물마다 프로필의 말투, 어휘, 문장 길이, 호칭을 지킨다. 대사를 쓸 때 그 인물이 프로필대로 말하는지 확인하고, 두 인물이 같은 리듬과 같은 표현으로 말하면 고친다. 인물끼리 말버릇을 공유하지 않는다.
- {{user}} 존중 : 인물들은 {{user}}의 대화 프로필(성격, 말투, 처지, 관계)에 맞게 대한다. {{user}}가 장난치면 장난으로, 진지하면 진지하게 받는다.`;

export function buildSystem(c){
  const st = storyOf(c), p = personaOf(c), L = LENGTHS[c.length || 'normal'];
  const style = c.style === 'custom' ? c.customStyle : STYLES[c.style || 'novel']?.text;
  let t = '너는 인터랙티브 웹소설의 작가다. [스토리]의 세계관과 등장인물들을 연기하며 {{user}}와 함께 이야기를 만든다.\n\n[출력 형식]\n'
    + '- 서술(행동, 표정, 배경 묘사)은 따옴표 없는 평범한 문단으로 쓴다.\n'
    + '- 등장인물의 대사는 한 줄에 하나씩 반드시 이 형식으로 쓴다: 이름 | "대사"\n'
    + "- 속마음은 서술 속에 '작은따옴표'로 넣는다.\n"
    + '- 마크다운 제목, 목록, 굵은 글씨는 쓰지 않는다.\n'
    + '- {{user}}의 입력에서 *별표* 안은 행동, 나머지는 대사다. (OOC: ...)는 이야기 밖의 요청이니 그대로 따른다.\n'
    + '- ' + L.rule + (c.minChars > 0 ? ` 응답 본문(INFO 창 제외)은 공백 포함 최소 ${c.minChars}자 이상 쓴다.` : '') + ' {{user}}가 반응할 여지를 남기며 끝낸다.\n'
    + '- 이전 줄거리 요약과 장기 기억의 사실관계를 반드시 지킨다.';
  if (c.noImpersonate !== false) t += '\n- {{user}}의 대사, 행동, 생각, 감정은 절대 대신 쓰지 않는다.';
  if (style) t += '\n\n[문체]\n' + style;
  if (st.infoOn && st.info) t += '\n\n[INFO 창]\n일반 응답의 맨 처음에 아래 형식을 지금 상황에 맞게 채운 코드블록을 넣는다. 코드블록 첫 줄에 ```info 라고 쓴다. 날짜와 시간은 이야기 흐름에 맞게 갱신하고, 장면에 있는 인물만 적는다. 단축어 요청으로 코드블록만 출력할 때는 INFO 창을 넣지 않는다.\n' + st.info;
  t += '\n\n[스토리: ' + st.title + ']\n' + (st.world || '');
  for (const ch of st.characters.filter(x => x.name || x.profile)) t += '\n\n[등장인물: ' + ch.name + ']\n' + ch.profile;
  if (st.commonRules?.trim()) t += '\n\n[등장인물 공통 대화 규칙 · 모든 인물의 대사와 행동에 항상 적용]\n' + st.commonRules.trim();
  t += '\n\n[수위 표시]\n이번 응답에 성인 수위(노골적인 성적 묘사나 잔혹한 폭력 묘사)가 들어가면 응답의 맨 마지막 줄에 [[19]] 만 단독으로 쓴다. 그렇지 않으면 쓰지 않는다.';
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
    const text = m.role === 'user' ? (m.send || m.text) : m.text;
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
export function expandShortcut(text, c){
  const m = text.match(/^\/(\S+)\s*([\s\S]*)$/); if (!m) return null;
  const sc = allShortcuts(c).find(s => s.name === m[1]); if (!sc) return null;
  return `(OOC: 단축어 /${sc.name} 실행${m[2] ? ` · 입력: ${m[2].trim()}` : ''})\n${sc.body}`;
}
