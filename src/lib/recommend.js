// AI 스토리 추천 : 보조 모델로 아이디어를 싸게 여러 개 받고, 고른 것만 기본 모델로 스토리 전체를 짓는다
import { S, commit } from './store';
import { newStory, uid, DEFAULT_INFO } from './constants';
import { callClaude, track } from './api';

// 모델이 앞뒤에 말을 붙이거나 코드 블록으로 감싸도 JSON 부분만 꺼낸다
function parseJson(t, open, close){
  const a = t.indexOf(open), b = t.lastIndexOf(close);
  if (a < 0 || b < a) throw new Error('추천 결과를 읽지 못했어요. 다시 시도해 주세요.');
  return JSON.parse(t.slice(a, b + 1));
}

function taste(){
  const mine = S.stories.slice(-10).map(st => `- ${st.title}: ${(st.intro || st.world || '').replace(/\s+/g, ' ').slice(0, 120)}`).join('\n');
  return mine ? `[사용자가 이미 만든 스토리]\n${mine}\n\n취향은 참고하되 같은 이야기를 반복하지 말고, 하나쯤은 결이 다른 장르도 섞어라.` : '[사용자가 만든 스토리 없음] 장르를 고르게 섞어라.';
}

export async function recommendIdeas(keyword){
  const model = S.settings.helperModel;
  const prompt = `${taste()}\n\n${keyword ? `[원하는 키워드] ${keyword}\n` : ''}
캐릭터와 대화하며 진행하는 롤플레이 스토리 아이디어 4개를 추천해라.
JSON 배열만 출력한다. 각 항목 형식:
{"title":"제목(15자 이내)","genre":"장르 두세 단어","hook":"한 줄 소개(40자 이내)","intro":"소개 2~3문장","cast":["주요 인물 이름과 한 줄 설명", "..."]}
cast 는 2~4명. 실존 작품의 인물이나 고유 설정은 쓰지 않는다.`;
  const r = await callClaude({model, system:'너는 롤플레이 스토리 기획자다. 요청한 JSON 만 출력한다.', messages:[{role:'user', content:prompt}], max_tokens:3000, effort:'low'});
  track(r.usage, model); commit();
  return parseJson(r.text, '[', ']').filter(x => x?.title).slice(0, 4);
}

export async function buildStory(idea){
  const model = S.settings.model;
  const prompt = `아래 아이디어로 롤플레이 스토리를 완성해라.
[아이디어] ${JSON.stringify(idea)}

JSON 객체 하나만 출력한다. 형식:
{"title":"","intro":"목록에 보일 소개 2~3문장","greetingTitle":"첫 장면 시나리오 이름 12자 이내","setup":"첫 장면 시나리오에서 사용자의 처지와 관계 150~300자","world":"세계관, 시대, 장소, 사용자의 처지, 지켜야 할 분위기를 문단으로 600~1200자",
"characters":[{"name":"","profile":"나이, 외모, 성격, 말투(예시 대사 포함), 사용자와의 관계, 숨긴 사정을 400~700자"}],
"greeting":"첫 장면. 3인칭 웹소설 문체로 서술하고 대사는 한 줄에 하나씩 이름 | \"대사\" 형식으로 쓴다. 사용자의 행동과 대사는 쓰지 않는다. 600~1000자",
"guide":"사용자에게 보여줄 플레이 팁 2~3줄"}
characters 는 아이디어의 인물을 모두 포함한다. 사용자는 이름 대신 {{user}} 로 가리킨다.`;
  const r = await callClaude({model, system:'너는 롤플레이 스토리 작가다. 요청한 JSON 만 출력한다.', messages:[{role:'user', content:prompt}], max_tokens:8000, effort:'low'});
  track(r.usage, model);
  const d = parseJson(r.text, '{', '}');
  const st = Object.assign(newStory(), {
    title:String(d.title || idea.title), intro:String(d.intro || idea.intro || ''), world:String(d.world || ''),
    greeting:String(d.greeting || ''), guide:String(d.guide || ''), info:DEFAULT_INFO,
    characters:(Array.isArray(d.characters) ? d.characters : []).filter(c => c?.name).map(c => ({id:uid(), name:String(c.name), profile:String(c.profile || ''), image:''})),
  });
  if (!st.characters.length) st.characters = newStory().characters;
  st.greetingTitle = String(d.greetingTitle || '기본 시작'); st.greetingSetup = String(d.setup || '');
  S.stories.push(st);
  commit();
  // 시작 시나리오를 3개로 맞춘다, 실패해도 스토리는 이미 만들어졌으니 넘어간다
  try { await genOpenings(st, 2); } catch(e){ console.warn('시작 시나리오 만들기 실패', e); }
  return st;
}

// 시작 시나리오 : 같은 세계관에서 {{user}}의 처지나 관계가 다른 출발점(설정 + 첫 장면)
export async function genOpenings(st, n = 3){
  const model = S.settings.model;
  const have = [st.greetingTitle || '기본 시작', ...(st.altGreetings || []).map(g => g.title)].filter(Boolean);
  const cast = st.characters.filter(c => c.name).map(c => `- ${c.name}: ${String(c.profile || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
  const prompt = `[스토리] ${st.title}
[세계관]
${String(st.world || '').slice(0, 2500)}

[등장인물]
${cast}

[이미 있는 시작 시나리오] ${have.join(' / ')}

이 스토리의 새 시작 시나리오 ${n}개를 만들어라. 시작 시나리오는 같은 세계관에서 {{user}}의 처지, 인물들과의 관계, 상황이 서로 다른 출발점이다.
(예: 처음 만나는 신입생으로 시작 / 사고나 술자리로 얽힌 다음 날 / 이미 아는 사이 / 특정 역할을 맡아 합류)
- 이미 있는 시나리오와 겹치지 않게, ${n}개끼리도 분위기와 등장 인물이 겹치지 않게 한다.
- setup : 이 시나리오에서만 적용할 설정. {{user}}의 처지, 누구와 어떤 관계로 시작하는지, 날짜와 장소, 앞으로의 긴장 요소. 150~350자.
- greeting : 첫 장면. 3인칭 웹소설 문체, 대사는 한 줄에 하나씩 이름 | "대사" 형식. {{user}}의 대사, 행동, 속마음은 쓰지 않는다. 500~900자.${st.infoOn && st.info ? `
- greeting 맨 앞에는 아래 형식을 채운 코드블록을 넣고 첫 줄은 \`\`\`info 로 쓴다.
${st.info}` : ''}
JSON 배열만 출력한다. 각 항목 형식 : {"title":"시나리오 이름 12자 이내","setup":"","greeting":""}`;
  const r = await callClaude({model, system:'너는 롤플레이 스토리 작가다. 요청한 JSON 만 출력한다.', messages:[{role:'user', content:prompt}], max_tokens:9000, effort:'low'});
  track(r.usage, model);
  const list = parseJson(r.text, '[', ']').filter(x => x?.greeting).slice(0, n)
    .map(x => ({id:uid(), title:String(x.title || '새 시작'), setup:String(x.setup || ''), text:String(x.greeting)}));
  if (!list.length) throw new Error('시작 시나리오를 읽지 못했어요. 다시 시도해 주세요.');
  (st.altGreetings ||= []).push(...list);
  commit();
  return list;
}
