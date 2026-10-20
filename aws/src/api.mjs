// story-api : API Gateway(HTTP API) 뒤에서 저장, 불러오기, 지갑을 처리한다
// CORS 는 API Gateway 설정이 붙인다
import { QueryCommand, BatchWriteCommand, BatchGetCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE, uidFrom, getWallet, PACKAGES, KRW } from './common.mjs';

// sc# : 단축어 하나씩. meta 와 story# 사이에 정렬돼서 getState 의 두 번째 범위에 들어간다
const KEY_RE = /^(meta|story#[\w-]{1,40}|chat#[\w-]{1,40}(#\d{1,4})?|img#[\w-]{1,40}|sc#[\w-]{1,40})$/;
const MAX_ITEM = 390 * 1024;
const res = (statusCode, body) => ({statusCode, headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const handler = async event => {
  const method = event.requestContext?.http?.method || 'GET';
  const path = (event.rawPath || '/').replace(/^\/(default|prod)(?=\/)/, '');
  if (method === 'OPTIONS') return {statusCode:204};
  const uid = uidFrom(event.headers);
  if (!uid) return res(401, {error:'로그인 정보가 없어요.'});
  let body = {};
  if (event.body){
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
    catch(e){ return res(400, {error:'잘못된 요청이에요.'}); }
  }
  try {
    switch (method + ' ' + path){
      case 'GET /state': return res(200, await getState(uid, event.queryStringParameters?.cursor));
      case 'POST /sync': return await sync(uid, body);
      case 'POST /images': return await images(uid, body);
      case 'GET /wallet': return res(200, await getWallet(uid));
      case 'GET /usage': return res(200, await getUsage(uid));
      case 'GET /last': return await getLast(uid, event.queryStringParameters?.chat);
      case 'POST /wallet/test-charge': return await testCharge(uid, body);
      default: return res(404, {error:'없는 주소예요.'});
    }
  } catch(e){
    console.error(e);
    return res(500, {error:'서버 오류가 났어요.'});
  }
};

// 이미지와 지갑을 뺀 전부, 이미지는 /images 로 따로 받는다
// 정렬 키 k 는 필터 조건에 못 쓰므로 키 범위로 나눠 읽는다
//   chat#… < img#… < meta < story#… < wallet  →  [k < img#] 와 [meta ≤ k ≤ story$]
// Lambda 응답은 6MB 가 한도라, 대화가 길어지면 한 번에 다 돌려주다 500 이 났다
// 4MB 쯤 차면 거기서 끊고 next(다음에 이어 읽을 자리)를 함께 돌려준다. 앱은 next 가 없을 때까지 이어 받는다
const PAGE_BYTES = 4 * 1024 * 1024;
async function getState(uid, cursor){
  const items = [];
  const ranges = [
    {KeyConditionExpression:'uid = :u AND k < :a', ExpressionAttributeValues:{':u':uid, ':a':'img#'}},
    {KeyConditionExpression:'uid = :u AND k BETWEEN :a AND :b', ExpressionAttributeValues:{':u':uid, ':a':'meta', ':b':'story$'}}
  ];
  let from = {r:0, k:null};
  try { if (cursor) from = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch(e){}
  let size = 0, lastR = 0;
  for (let ri = from.r || 0; ri < ranges.length; ri++){
    let start = ri === from.r && from.k ? {uid, k:from.k} : undefined;
    do {
      const r = await ddb.send(new QueryCommand({TableName:TABLE, ...ranges[ri], ExclusiveStartKey:start}));
      for (const it of r.Items || []){
        const n = Buffer.byteLength(it.d || '') + it.k.length + 32;
        // 이어 읽을 자리는 마지막으로 담은 항목의 범위와 키(다음 범위의 첫 항목에서 끊겨도 앞 범위 끝부터 다시 읽는다)
        if (items.length && size + n > PAGE_BYTES){
          return {items, next:Buffer.from(JSON.stringify({r:lastR, k:items[items.length - 1].k})).toString('base64url')};
        }
        items.push({k:it.k, d:it.d}); size += n; lastR = ri;
      }
      start = r.LastEvaluatedKey;
    } while (start);
  }
  return {items};
}

async function sync(uid, {put = [], del = []}){
  if (!Array.isArray(put) || !Array.isArray(del) || put.length + del.length > 400) return res(400, {error:'한 번에 너무 많아요.'});
  const reqs = [];
  for (const p of put){
    if (!KEY_RE.test(p?.k) || typeof p.d !== 'string') return res(400, {error:'잘못된 항목이에요 : ' + String(p?.k).slice(0, 40)});
    if (Buffer.byteLength(p.d) > MAX_ITEM) return res(413, {error:'항목이 너무 커요 : ' + p.k});
    reqs.push({PutRequest:{Item:{uid, k:p.k, d:p.d, at:Date.now()}}});
  }
  for (const k of del){
    if (!KEY_RE.test(k)) return res(400, {error:'잘못된 항목이에요 : ' + String(k).slice(0, 40)});
    reqs.push({DeleteRequest:{Key:{uid, k}}});
  }
  for (let i = 0; i < reqs.length; i += 25){
    let batch = reqs.slice(i, i + 25), tries = 0;
    while (batch.length){
      const r = await ddb.send(new BatchWriteCommand({RequestItems:{[TABLE]:batch}}));
      batch = r.UnprocessedItems?.[TABLE] || [];
      if (batch.length){ if (++tries > 6) throw new Error('batch write throttled'); await sleep(100 * 2 ** tries); }
    }
  }
  return res(200, {ok:true, put:put.length, del:del.length});
}

async function images(uid, {keys = []}){
  if (!Array.isArray(keys) || keys.length > 100 || !keys.every(k => /^img#[\w-]{1,40}$/.test(k))) return res(400, {error:'잘못된 요청이에요.'});
  const out = {};
  let pending = [...new Set(keys)].map(k => ({uid, k})), tries = 0;
  while (pending.length){
    const r = await ddb.send(new BatchGetCommand({RequestItems:{[TABLE]:{Keys:pending}}}));
    for (const it of r.Responses?.[TABLE] || []) out[it.k] = it.d;
    pending = r.UnprocessedKeys?.[TABLE]?.Keys || [];
    if (pending.length){ if (++tries > 6) break; await sleep(100 * 2 ** tries); }
  }
  return res(200, {images:out});
}

// 끊긴 답변 되찾기 : story-claude 가 대화마다 마지막으로 끝까지 받은 답변을 last#<대화id> 에 남겨 둔다
// last# 는 getState 가 읽는 키 범위 밖이라 동기화 데이터와 섞이지 않는다
async function getLast(uid, chat){
  if (!/^[\w-]{1,40}$/.test(chat || '')) return res(400, {error:'잘못된 요청이에요.'});
  const r = await ddb.send(new GetCommand({TableName:TABLE, Key:{uid, k:'last#' + chat}}));
  const it = r.Item;
  return res(200, it ? {rid:it.rid, text:it.text, stop:it.stop, at:it.at} : {});
}

// 쓴 금액 : 날짜별 기록과 전체 누적(날짜별 기록을 만들기 전 사용분까지 포함)
async function getUsage(uid){
  const days = [];
  let start;
  do {
    const r = await ddb.send(new QueryCommand({TableName:TABLE, KeyConditionExpression:'uid = :u AND k BETWEEN :a AND :b',
      ExpressionAttributeValues:{':u':uid, ':a':'usage#', ':b':'usage$'}, ExclusiveStartKey:start}));
    for (const it of r.Items || []){
      const models = {};
      for (const [f, v] of Object.entries(it)) if (f.startsWith('m_')) models[f.slice(2)] = v;
      days.push({day:it.k.slice(6), usd:it.usd || 0, calls:it.calls || 0, models});
    }
    start = r.LastEvaluatedKey;
  } while (start);
  const w = await getWallet(uid);
  return {days, totalUsd:(w.spent || 0) / KRW()};
}

// 결제대행사 연동 전 테스트 충전, ALLOW_TEST_CHARGE=1 일 때만 열린다
async function testCharge(uid, {pkg, method}){
  if (process.env.ALLOW_TEST_CHARGE !== '1') return res(403, {error:'테스트 충전이 꺼져 있어요.'});
  const p = PACKAGES[pkg]; if (!p) return res(400, {error:'없는 상품이에요.'});
  const credit = p.price + p.bonus;
  const h = {id:Date.now().toString(36), price:p.price, credit, method:String(method || 'card').slice(0, 10), at:Date.now(), test:true};
  await ddb.send(new UpdateCommand({TableName:TABLE, Key:{uid, k:'wallet'},
    UpdateExpression:'ADD balance :c SET history = list_append(:h, if_not_exists(history, :e))',
    ExpressionAttributeValues:{':c':credit, ':h':[h], ':e':[]}}));
  return res(200, await getWallet(uid));
}
