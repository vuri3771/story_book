// 메모리 가짜 DynamoDB 와 가짜 Anthropic 으로 두 핸들러를 돌려보는 테스트
import assert from 'node:assert/strict';
import { setDdb } from '../src/common.mjs';
import { handler as api } from '../src/api.mjs';
import { handle as claude } from '../src/claude.mjs';

const db = new Map();
const key = (u, k) => u + '|' + k;
setDdb({ async send(cmd){
  const n = cmd.constructor.name, i = cmd.input;
  if (n === 'GetCommand') return {Item: db.get(key(i.Key.uid, i.Key.k))};
  if (n === 'UpdateCommand'){
    const it = db.get(key(i.Key.uid, i.Key.k)) || {uid:i.Key.uid, k:i.Key.k};
    const v = i.ExpressionAttributeValues;
    if (i.UpdateExpression.includes('balance :n')){ it.balance = (it.balance || 0) + v[':n']; it.spent = (it.spent || 0) + v[':c']; }
    if (i.UpdateExpression.includes('balance :c')){ it.balance = (it.balance || 0) + v[':c']; it.history = [...v[':h'], ...(it.history || [])]; }
    db.set(key(i.Key.uid, i.Key.k), it); return {};
  }
  if (n === 'QueryCommand'){
    const u = i.ExpressionAttributeValues[':u'];
    return {Items:[...db.values()].filter(x => x.uid === u && !x.k.startsWith('img#') && x.k !== 'wallet')};
  }
  if (n === 'BatchWriteCommand'){
    for (const r of Object.values(i.RequestItems)[0]){
      if (r.PutRequest) db.set(key(r.PutRequest.Item.uid, r.PutRequest.Item.k), r.PutRequest.Item);
      else db.delete(key(r.DeleteRequest.Key.uid, r.DeleteRequest.Key.k));
    }
    return {};
  }
  if (n === 'BatchGetCommand') return {Responses:{story_app: Object.values(i.RequestItems)[0].Keys.map(kk => db.get(key(kk.uid, kk.k))).filter(Boolean)}};
  throw new Error('unknown ' + n);
}});

const TOKEN = 'a'.repeat(40);
const ev = (method, path, body, token = TOKEN) => ({requestContext:{http:{method}}, rawPath:path, headers: token ? {authorization:'Bearer ' + token} : {}, body: body && JSON.stringify(body)});
const call = async (...a) => { const r = await api(ev(...a)); return {s:r.statusCode, b:r.body ? JSON.parse(r.body) : null}; };

// 인증
assert.equal((await call('GET', '/wallet', null, null)).s, 401);
assert.equal((await call('GET', '/wallet', null, 'short')).s, 401);

// 저장, 불러오기, 이미지, 삭제
let r = await call('POST', '/sync', {put:[{k:'meta', d:'{"a":1}'}, {k:'story#s1', d:'{"t":"x"}'}, {k:'img#abc', d:'data:img'}, {k:'chat#c1#0', d:'[]'}], del:[]});
assert.equal(r.s, 200);
r = await call('GET', '/state');
assert.deepEqual(r.b.items.map(x => x.k).sort(), ['chat#c1#0', 'meta', 'story#s1']);
r = await call('POST', '/images', {keys:['img#abc', 'img#none']});
assert.deepEqual(r.b.images, {'img#abc':'data:img'});
r = await call('POST', '/sync', {put:[], del:['story#s1']});
assert.equal((await call('GET', '/state')).b.items.length, 2);
// 다른 사람 데이터는 안 보인다
assert.equal((await call('GET', '/state', null, 'b'.repeat(40))).b.items.length, 0);
// 잘못된 키, 지갑 덮어쓰기 차단, 너무 큰 항목
assert.equal((await call('POST', '/sync', {put:[{k:'wallet', d:'{}'}]})).s, 400);
assert.equal((await call('POST', '/sync', {put:[{k:'meta', d:'x'.repeat(400 * 1024)}]})).s, 413);

// 지갑 : 테스트 충전은 환경변수가 있어야 열린다
assert.equal((await call('POST', '/wallet/test-charge', {pkg:'c10000'})).s, 403);
process.env.ALLOW_TEST_CHARGE = '1';
assert.equal((await call('POST', '/wallet/test-charge', {pkg:'nope'})).s, 400);
r = await call('POST', '/wallet/test-charge', {pkg:'c10000', method:'kakao'});
assert.equal(r.b.balance, 11000); assert.equal(r.b.history.length, 1);

// Claude 프록시 : 가짜 Anthropic 스트림
const sse = ['{"type":"message_start","message":{"usage":{"input_tokens":1000,"cache_read_input_tokens":9000,"output_tokens":1}}}',
  '{"type":"content_block_delta","delta":{"type":"text_delta","text":"안녕"}}',
  '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":500}}'].map(x => 'data: ' + x + '\n').join('');
let sentBody, sentHeaders;
globalThis.fetch = async (url, opts) => { sentBody = JSON.parse(opts.body); sentHeaders = opts.headers;
  return new Response(new ReadableStream({start(c){ c.enqueue(new TextEncoder().encode(sse)); c.close(); }}), {status:200}); };
process.env.ANTHROPIC_API_KEY = 'test-key';
const run = async (body, token = TOKEN, extra = {}) => {
  const out = {status:0, chunks:[]};
  await claude({requestContext:{http:{method:'POST'}}, headers:{authorization:'Bearer ' + token, ...extra}, body:JSON.stringify(body)},
    {start:(s) => out.status = s, write:c => out.chunks.push(typeof c === 'string' ? c : new TextDecoder().decode(c)), end:() => {}});
  return out;
};
let o = await run({model:'claude-opus-5-5', max_tokens:999999, stream:true, messages:[{role:'user', content:'hi'}], tools:[{type:'web_search'}]}, TOKEN, {'anthropic-beta':'server-side-fallback-2026-07-01'});
assert.equal(o.status, 200);
assert.ok(o.chunks.join('').includes('안녕'));
assert.equal(sentBody.tools, undefined, '허용 안 한 필드는 빠져야 한다');
assert.equal(sentBody.max_tokens, 20000);
assert.equal(sentHeaders['x-api-key'], 'test-key');
assert.equal(sentHeaders['anthropic-beta'], 'server-side-fallback-2026-07-01');
// 비용 : (1000*4 + 9000*0.2 + 500*20) / 1e6 * 1400 = 22.12원
const w = (await call('GET', '/wallet')).b;
assert.ok(Math.abs(w.balance - (11000 - 22.12)) < 0.001, 'balance ' + w.balance);
// 잔액 0 인 사용자, 모르는 모델
assert.equal((await run({model:'claude-opus-5-5', messages:[]}, 'c'.repeat(40))).status, 402);
assert.equal((await run({model:'gpt-4', messages:[]})).status, 400);
console.log('all server tests passed');
