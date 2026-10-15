// story-api : API Gateway(HTTP API) 뒤에서 저장, 불러오기, 지갑을 처리한다
// CORS 는 API Gateway 설정이 붙인다
import { QueryCommand, BatchWriteCommand, BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE, uidFrom, getWallet, PACKAGES, KRW } from './common.mjs';

const KEY_RE = /^(meta|story#[\w-]{1,40}|chat#[\w-]{1,40}(#\d{1,4})?|img#[\w-]{1,40})$/;
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
      case 'GET /state': return res(200, await getState(uid));
      case 'POST /sync': return await sync(uid, body);
      case 'POST /images': return await images(uid, body);
      case 'GET /wallet': return res(200, await getWallet(uid));
      case 'GET /usage': return res(200, await getUsage(uid));
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
async function getState(uid){
  const items = [];
  const ranges = [
    {KeyConditionExpression:'uid = :u AND k < :a', ExpressionAttributeValues:{':u':uid, ':a':'img#'}},
    {KeyConditionExpression:'uid = :u AND k BETWEEN :a AND :b', ExpressionAttributeValues:{':u':uid, ':a':'meta', ':b':'story$'}}
  ];
  for (const q of ranges){
    let start;
    do {
      const r = await ddb.send(new QueryCommand({TableName:TABLE, ...q, ExclusiveStartKey:start}));
      for (const it of r.Items || []) items.push({k:it.k, d:it.d});
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
