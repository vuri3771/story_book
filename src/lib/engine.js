// ================= 대화 진행 =================
// 스트리밍 중인 글은 run.text 에만 두고, 끝나면 메시지에 옮겨 저장한다
import { S, notify, commit, save, toast, go } from './store';
import { LENGTHS } from './constants';
import { storyOf, personaOf, fill, plain, modelOf } from './helpers';
import { callClaude, track, usingProxy } from './api';
import { buildSystem, buildMessages, FREE_START, prepareUser } from './prompt';

export const run = { busy:false, abort:null, chatId:null, text:'', startedAt:0 };
export const ADULT_RE = /\n?[ \t]*\[\[\s*19\s*\]\][ \t]*\s*$/;
export const isAdultChat = (c, st) => !!st?.adult || !!c?.messages?.some(m => m.adult);

export async function generate(c){
  if (!c || run.busy) return;
  run.busy = true; run.chatId = c.id; run.text = ''; run.startedAt = Date.now();
  const m = {role:'assistant', text:''}; c.messages.push(m); c.updated = Date.now();
  run.abort = new AbortController();
  notify();
  try {
    // NovelAI 는 한국어가 어색해서, 번역 모드면 영어로 주고받고 보조 모델이 양쪽을 옮긴다
    // 내 입력은 번역하지 않고 한국어 그대로 보낸다(모델이 한국어는 잘 알아듣는다). 답변은 영어로 흘려 받으면서
    // 끝난 문단부터 바로 한국어로 옮겨 화면에 띄운다. 예전엔 입력 번역 → 답변 전부 → 전체 번역을 차례로 기다려 느렸다
    const tr = modelOf(c.model).provider === 'nai' && S.settings.naiTranslate !== false;
    const hist = c.messages.slice(0, -1);
    const tq = tr ? paraTranslator(c) : null;
    let system = buildSystem(c);
    if (tr) system = [...system, {type:'text', text:EN_RULE}];
    const r = await callClaude({model:c.model, system, messages:buildMessages(c, hist, tr),
      max_tokens:Math.max(LENGTHS[c.length || 'normal'].max, (c.minChars || 0) * 3 + 3000), effort:c.effort || 'low', signal:run.abort.signal,
      onText: tr ? t => tq.feed(t) : t => { run.text = t; notify(); }});
    m.text = r.text;
    if (tr && r.text.trim()){ m.en = r.text; m.text = await tq.finish(r.text); }
    // 모델이 붙인 수위 표시 [[19]] 는 본문에서 떼고 메시지 표시로 옮긴다
    if (ADULT_RE.test(m.text)){ m.adult = true; m.text = m.text.replace(ADULT_RE, '').trimEnd(); }
    if (r.stop === 'refusal' && !r.text) m.text = '(모델이 이 장면을 이어 쓰지 않았어요. 다시 생성하거나 방향을 바꿔보세요.)';
    if (!m.text){ c.messages.pop(); if (r.stop !== 'aborted') toast('답변이 비어서 왔어요. 다시 불러오기를 눌러주세요.'); }
    track(r.usage, c.model, c, m);
    run.busy = false; save();
    maybeSummarize(c).catch(e => toast('요약 실패 : ' + e.message));
  } catch(e){
    // 중간에 끊기면 받은 데까지는 남긴다, 아무것도 못 받았으면 내 메시지만 남아 다시 불러오기로 이어 간다
    if (c.messages[c.messages.length-1] === m){ if (run.text.trim()) m.text = run.text; else c.messages.pop(); }
    toast(e.message);
  } finally { run.busy = false; run.abort = null; run.text = ''; commit(); }
}

// ================= NovelAI 번역 모드 =================
const EN_RULE = `[Language · NovelAI]
Write your whole response in natural, vivid, literary English. A translator will turn it into Korean afterwards.
- Keep every character name and place name exactly as written in Hangul (e.g. 무진 leaned closer.). Do not romanize names.
- Keep the output format exactly: the \`\`\`info block (its labels may stay as they are), name lines, the name | "dialogue" / name ㅣ "dialogue" style, ⌜ ⌟ and ⸺ name lines, [[이미지:...]] tags.
- The user writes in Korean. Understand it as it is and continue the story in English.`;

// 영어 답변이 흘러 들어오는 동안, 끝난 문단(빈 줄로 나뉜 곳, 코드블록 안은 제외)부터 차례로 번역해 화면에 이어 붙인다
// 번역이 한 번 도는 사이 끝난 문단이 여러 개면 한꺼번에 보낸다. 흐름이 끊기지 않게 바로 앞 번역문을 참고로 같이 준다
function cutPoint(t){
  let fence = false, cut = 0, mm; const re = /```|\n\n/g;
  while ((mm = re.exec(t))){ if (mm[0] === '```') fence = !fence; else if (!fence) cut = mm.index + 2; }
  return cut;
}
function paraTranslator(c){
  let en = '', sent = 0, partial = '', running = null;
  const ko = [];
  const show = () => { run.text = [...ko, partial].filter(Boolean).join('\n\n'); notify(); };
  const step = async final => {
    for (;;){
      const end = final ? en.length : cutPoint(en);
      if (end <= sent) return;
      const src = en.slice(sent, end).trim(); sent = end;
      if (!src) continue;
      const out = await translate(c, src, ko[ko.length - 1] || '', t => { partial = t; show(); });
      partial = ''; ko.push(out); show();
    }
  };
  return {
    feed(t){ en = t; if (!running) running = step(false).finally(() => { running = null; }); },
    async finish(t){ en = t; if (running) await running; await step(true); return ko.join('\n\n'); }
  };
}

// 보조 모델로 영어를 한국어로 옮긴다. 옮기는 동안 onPart 로 흘려 보여 준다. 실패하면 원문을 그대로 쓴다
async function translate(c, text, prev, onPart){
  const sys = '너는 영어 롤플레이 소설을 자연스러운 한국어 웹소설 문장으로 옮기는 번역가다. 직역하지 말고 한국 독자가 읽기 좋은 문학적인 문장으로 옮긴다. 인물 이름과 지명은 한글 그대로 둔다. ```info 코드블록, 줄바꿈, 이름 | "대사" / 이름 ㅣ "대사" / ⌜ ⌟ / ⸺ 이름 줄, [[이미지:...]] 표시, 일본어 원문과 괄호 번역은 형식 그대로 유지한다. 대사는 인물 말투에 맞는 자연스러운 한국어 구어체로 옮긴다. 번역문만 출력한다.'
    + (prev ? ' [앞 번역문]은 말투와 호칭을 맞추기 위한 참고일 뿐이니 다시 출력하지 말고, [이번 원문]만 옮긴다.' : '');
  const content = prev ? `[앞 번역문]\n${prev.slice(-800)}\n\n[이번 원문]\n${text}` : text;
  try {
    const r = await callClaude({model:S.settings.helperModel, system:sys, messages:[{role:'user', content}], max_tokens:8000, effort:'low', onText:onPart});
    track(r.usage, S.settings.helperModel, c);
    return r.text.trim() || text;
  } catch(e){ toast('번역 실패, 원문으로 보여드려요 : ' + e.message); return text; }
}

// 성공하면 true, 보낼 게 없거나 단축어가 틀리면 false
export function send(c, text){
  const t = String(text).trim(); if (!t || run.busy) return false;
  // 자유 시작의 INFO 창을 못 받았으면 시작 지시는 버리고 내 입력으로 바로 연다
  if (c.messages[c.messages.length-1]?.start) c.messages.pop();
  // 단축어와 *행동* 표시는 보낼 때 prepareUser 가 풀어 준다(문장 중간, 끝의 /단축어도 인식)
  c.messages.push({role:'user', text:t});
  generate(c);
  return true;
}

// 내 말 없이 이야기를 이어 쓴다, 화면에는 작은 표시만 남는다
const CONT_PROMPT = '(사용자는 이번에 아무 말도 하지 않았다. 직전 장면에서 자연스럽게 이어서 이야기를 다음으로 진행해라. 사용자 캐릭터의 대사나 행동은 새로 정하지 않는다.)';
export function cont(c){
  if (run.busy || !c?.messages.length) return false;
  if (c.messages[c.messages.length-1].role === 'user'){ regen(c); return true; }
  c.messages.push({role:'user', text:'', send:CONT_PROMPT, cont:true});
  generate(c);
  return true;
}

// 자유 시작 : 화면에 안 보이는 시작 지시로 INFO 창만 받아 온다. INFO 창이 없는 스토리는 빈 대화로 둔다
export function freeStart(c){
  if (!storyOf(c)?.infoOn) return;
  c.messages.push({role:'user', text:'', send:FREE_START, cont:true, start:true});
  generate(c);
}

// 마지막이 답변이면 지우고 새로, 내 메시지에서 끊겼으면(답변 실패) 그 자리에서 다시 불러온다
export function regen(c){
  const last = c.messages[c.messages.length-1];
  if (run.busy || !last) return;
  if (last.role === 'assistant'){
    if (c.messages.length < 2) return;
    c.messages.pop(); c.summarizedUpTo = Math.min(c.summarizedUpTo || 0, c.messages.length);
  }
  generate(c);
}

// ================= 요약 메모리 =================
export async function maybeSummarize(c, force = false){
  const s = S.settings, start = c.summarizedUpTo || 0;
  const pending = c.messages.length - start - s.keepRecent;
  if (!force && pending < s.summarizeEvery) return;
  const end = force ? Math.max(start, c.messages.length - 4) : start + pending;
  if (end <= start) return;
  const chunk = c.messages.slice(start, end).map(m => (m.role === 'user' ? '{{user}}' : '이야기') + ': ' + m.text).join('\n\n');
  const prompt = fill('다음은 롤플레이 이야기의 기존 요약과 그 이후 대화다. 둘을 합쳐 새 요약을 써라.\n- 사건 순서, 인물 관계와 감정 변화, 약속, 비밀, 복선, 장소, 소지품, 호칭처럼 이후 이야기에 필요한 사실을 빠짐없이 남긴다.\n- 군더더기 묘사는 빼고 항목형으로 간결하게, 1500자 이내.\n\n[기존 요약]\n' + (c.memory || '(없음)') + '\n\n[이후 대화]\n' + chunk, c);
  const r = await callClaude({model:s.helperModel, system:'너는 이야기 기록 담당이다. 요약만 출력한다.', messages:[{role:'user', content:prompt}], max_tokens:3000, effort:'low'});
  track(r.usage, s.helperModel, c);
  if (r.text.trim()){ c.memory = r.text.trim(); c.summarizedUpTo = end; commit(); }
}

// ================= 이미지 키워드 자동 생성 =================
// 보관함에 이미지를 넣으면 Haiku 가 그림을 보고 장면 키워드를 붙인다, 키가 없으면 건너뛴다
const TAG_MODEL = 'claude-haiku-5-5';
export async function autoTag(dataUrl){
  if (!usingProxy && !S.settings.apiKey) return '';
  const [head, b64] = String(dataUrl).split(',');
  const media = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const r = await callClaude({model:TAG_MODEL, system:'너는 이미지에 장면 키워드를 붙이는 도우미다.', max_tokens:120, messages:[{role:'user', content:[
    {type:'image', source:{type:'base64', media_type:media, data:b64}},
    {type:'text', text:'이 이미지가 이야기 속 어떤 장면에 어울리는지 한국어 키워드 3~6개를 쉼표로만 나열해라. 장소, 시간대, 날씨, 분위기, 인물의 행동 위주로 짧은 명사로 쓴다. 키워드만 출력한다.'}
  ]}]});
  track(r.usage, TAG_MODEL);
  return r.text.replace(/\s*\n\s*/g, ', ').replace(/[."]/g, '').trim().slice(0, 60);
}

// ================= 추천 답변 3개 =================
export async function suggest(c){
  const st = storyOf(c), u = personaOf(c);
  const recent = c.messages.slice(-6).map(m => (m.role === 'user' ? u.name : '이야기') + ': ' + plain(fill(m.text, c)).slice(0, 700)).join('\n\n');
  const prompt = `[스토리] ${st.title}\n${st.world.slice(0, 600)}\n\n[${u.name}의 설정] ${u.desc || '없음'}\n\n[최근 대화]\n${recent}\n\n위 이야기에서 ${u.name}(사용자)가 다음에 할 수 있는 답변 3개를 써라.\n- 각각 방향이 다르게 (예: 다정하게, 장난스럽게, 대담하게).\n- 행동은 *별표* 안에 쓰고 대사는 따옴표 없이 쓴다. 각 1~3문장.\n- 다른 인물의 대사나 반응은 쓰지 않는다.\n- 답변 사이에는 ### 한 줄만 넣고, 번호나 설명 없이 답변만 출력한다.`;
  const r = await callClaude({model:S.settings.helperModel, system:'너는 롤플레이 사용자의 답변을 제안하는 도우미다.', messages:[{role:'user', content:prompt}], max_tokens:2000, effort:'low'});
  track(r.usage, S.settings.helperModel, c);
  commit();
  return r.text.split(/\n?\s*###\s*\n?/).map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).slice(0, 3);
}
