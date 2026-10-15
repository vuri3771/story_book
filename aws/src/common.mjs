// 두 Lambda(story-api, story-claude)가 같이 쓰는 것 : 인증, 요금표, 지갑
// 테이블 하나(story_app)에 사용자별로 uid + k 로 저장한다
//   meta, story#<id>, chat#<id>, chat#<id>#<n>(메시지 조각), img#<hash>, wallet
import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const TABLE = process.env.TABLE_NAME || 'story_app';
export let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export function setDdb(fake){ ddb = fake; }

// 기기마다 만든 무작위 토큰을 Bearer 로 받는다. 토큰 원문은 저장하지 않고 해시만 사용자 id 로 쓴다
export function uidFrom(headers = {}){
  const h = headers.authorization || headers.Authorization || '';
  const m = h.match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/);
  return m ? createHash('sha256').update(m[1]).digest('hex').slice(0, 40) : null;
}

// 달러 기준 백만 토큰당 가격, 프론트 MODELS 와 같은 값
export const PRICES = {
  'claude-fable-5-1': {in:10, out:50, cr:0.25},
  'claude-opus-5-5': {in:4, out:20, cr:0.2},
  'claude-opus-5': {in:5, out:25, cr:0.5},
  'claude-opus-4-6': {in:5, out:25, cr:0.5},
  'claude-sonnet-5-5': {in:2, out:10, cr:0.2},
  'claude-haiku-5-5': {in:0.1, out:0.5, cr:0.01}
};
const KRW = () => +process.env.KRW || 1400;
export function costKrw(model, u){
  const m = PRICES[model]; if (!m) return 0;
  return (u.in * m.in + u.cw * m.in * 1.25 + u.cr * m.cr + u.out * m.out) / 1e6 * KRW();
}

// 충전 상품, 프론트 PACKAGES 와 같은 값. 금액은 반드시 서버 표를 따른다
export const PACKAGES = {
  c3000: {price:3000, bonus:0},
  c5000: {price:5000, bonus:250},
  c10000: {price:10000, bonus:1000},
  c30000: {price:30000, bonus:4500},
  c50000: {price:50000, bonus:10000}
};

export async function getWallet(uid){
  const r = await ddb.send(new GetCommand({TableName:TABLE, Key:{uid, k:'wallet'}}));
  const it = r.Item || {};
  return {balance: it.balance || 0, spent: it.spent || 0, history: it.history || []};
}

export async function deduct(uid, cost){
  if (!(cost > 0)) return;
  await ddb.send(new UpdateCommand({TableName:TABLE, Key:{uid, k:'wallet'},
    UpdateExpression:'ADD balance :n, spent :c', ExpressionAttributeValues:{':n':-cost, ':c':cost}}));
}
