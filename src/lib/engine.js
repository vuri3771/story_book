// ================= 대화 진행 =================
// 스트리밍 중인 글은 run.text 에만 두고, 끝나면 메시지에 옮겨 저장한다
import { S, notify, commit, save, toast, go } from './store';
import { LENGTHS } from './constants';
import { storyOf, personaOf, fill, plain } from './helpers';
import { callClaude, track, usingProxy } from './api';
import { buildSystem, buildMessages, expandShortcut } from './prompt';

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
    const r = await callClaude({model:c.model, system:buildSystem(c), messages:buildMessages(c, c.messages.slice(0, -1)),
      max_tokens:Math.max(LENGTHS[c.length || 'normal'].max, (c.minChars || 0) * 3 + 3000), effort:c.effort || 'low', signal:run.abort.signal,
      onText: t => { run.text = t; notify(); }});
    m.text = r.text;
    // 모델이 붙인 수위 표시 [[19]] 는 본문에서 떼고 메시지 표시로 옮긴다
    if (ADULT_RE.test(m.text)){ m.adult = true; m.text = m.text.replace(ADULT_RE, '').trimEnd(); }
    if (r.stop === 'refusal' && !r.text) m.text = '(모델이 이 장면을 이어 쓰지 않았어요. 다시 생성하거나 방향을 바꿔보세요.)';
    if (!m.text) c.messages.pop();
    track(r.usage, c.model, c, m);
    run.busy = false; save();
    maybeSummarize(c).catch(e => toast('요약 실패 : ' + e.message));
  } catch(e){
    if (c.messages[c.messages.length-1] === m) c.messages.pop();
    toast(e.message);
  } finally { run.busy = false; run.abort = null; run.text = ''; commit(); }
}

// 성공하면 true, 보낼 게 없거나 단축어가 틀리면 false
export function send(c, text){
  const t = String(text).trim(); if (!t || run.busy) return false;
  if (usingProxy && (S.wallet?.balance || 0) <= 0){ toast('크레딧이 부족해요. 충전 후 이어서 해주세요.'); go('charge'); return false; }
  const exp = t.startsWith('/') ? expandShortcut(t, c) : null;
  if (t.startsWith('/') && !exp){ toast('없는 단축어예요. / 를 눌러 목록을 확인하세요.'); return false; }
  c.messages.push(exp ? {role:'user', text:t, send:exp} : {role:'user', text:t});
  generate(c);
  return true;
}

export function regen(c){
  if (run.busy || c.messages[c.messages.length-1]?.role !== 'assistant' || c.messages.length < 2) return;
  c.messages.pop(); c.summarizedUpTo = Math.min(c.summarizedUpTo, c.messages.length);
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
