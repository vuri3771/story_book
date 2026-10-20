#!/bin/bash
# AWS CloudShell 에서 실행 : DynamoDB 테이블, IAM 역할, Lambda 2개, 함수 URL, HTTP API 를 만들거나 갱신한다
# 여러 번 돌려도 된다(있으면 코드와 설정만 갱신)
#   cd story_book/aws && bash deploy.sh
set -euo pipefail

REGION=${AWS_REGION:-ap-southeast-2}
export AWS_DEFAULT_REGION=$REGION
TABLE=story_app
ROLE=story-app-lambda-role
API_FN=story-api
CLAUDE_FN=story-claude
API_NAME=story-api
ORIGINS='["https://v-stroy-book1.netlify.app","https://v-story-book.vercel.app","http://localhost:5173","http://localhost:4173"]'
ACCT=$(aws sts get-caller-identity --query Account --output text)
cd "$(dirname "$0")"

echo "1/6 DynamoDB 테이블"
if ! aws dynamodb describe-table --table-name $TABLE >/dev/null 2>&1; then
  aws dynamodb create-table --table-name $TABLE \
    --attribute-definitions AttributeName=uid,AttributeType=S AttributeName=k,AttributeType=S \
    --key-schema AttributeName=uid,KeyType=HASH AttributeName=k,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null
fi
aws dynamodb wait table-exists --table-name $TABLE
TABLE_ARN=$(aws dynamodb describe-table --table-name $TABLE --query Table.TableArn --output text)

echo "2/6 IAM 역할"
if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "   역할 전파 대기 15초"; sleep 15
fi
aws iam put-role-policy --role-name $ROLE --policy-name story-app-ddb --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\",\"dynamodb:Query\",\"dynamodb:BatchGetItem\",\"dynamodb:BatchWriteItem\"],\"Resource\":\"$TABLE_ARN\"}]}"
ROLE_ARN=$(aws iam get-role --role-name $ROLE --query Role.Arn --output text)

echo "3/6 코드 묶기"
rm -f function.zip && (cd src && zip -q ../function.zip *.mjs)

# 이름, 핸들러, 제한시간, 환경변수 json 파일
deploy_fn(){
  if aws lambda get-function --function-name "$1" >/dev/null 2>&1; then
    aws lambda update-function-code --function-name "$1" --zip-file fileb://function.zip >/dev/null
    aws lambda wait function-updated-v2 --function-name "$1"
    aws lambda update-function-configuration --function-name "$1" --timeout "$3" --environment "file://$4" >/dev/null
  else
    aws lambda create-function --function-name "$1" --runtime nodejs22.x --role "$ROLE_ARN" --handler "$2" \
      --zip-file fileb://function.zip --timeout "$3" --memory-size 256 --environment "file://$4" >/dev/null
  fi
  aws lambda wait function-active-v2 --function-name "$1"
  aws lambda wait function-updated-v2 --function-name "$1"
}

echo "4/6 Lambda $API_FN"
jq -n --arg t $TABLE '{Variables:{TABLE_NAME:$t, ALLOW_TEST_CHARGE:"1", KRW:"1400"}}' > env_api.json
deploy_fn $API_FN api.handler 15 env_api.json
rm -f env_api.json

echo "5/6 Lambda $CLAUDE_FN"
# 키는 화면에 안 보이게 받는다. 이미 있으면 엔터만 눌러 기존 키 유지
KEY=$(aws lambda get-function-configuration --function-name $CLAUDE_FN --query 'Environment.Variables.ANTHROPIC_API_KEY' --output text 2>/dev/null || true)
[ "$KEY" = "None" ] && KEY=""
read -rsp "   Anthropic API 키를 붙여넣고 엔터 (입력은 안 보여요${KEY:+, 엔터만 누르면 기존 키 유지}): " NEWKEY; echo
[ -n "$NEWKEY" ] && KEY=$NEWKEY
[ -z "$KEY" ] && { echo "   키가 없어서 중단해요"; exit 1; }
umask 077
jq -n --arg t $TABLE --arg k "$KEY" '{Variables:{TABLE_NAME:$t, ANTHROPIC_API_KEY:$k, KRW:"1400"}}' > env_claude.json
deploy_fn $CLAUDE_FN claude.handler 300 env_claude.json
rm -f env_claude.json; unset KEY NEWKEY

CORS_URL="{\"AllowOrigins\":$ORIGINS,\"AllowMethods\":[\"POST\"],\"AllowHeaders\":[\"content-type\",\"authorization\",\"anthropic-beta\"],\"MaxAge\":3600}"
if aws lambda get-function-url-config --function-name $CLAUDE_FN >/dev/null 2>&1; then
  aws lambda update-function-url-config --function-name $CLAUDE_FN --auth-type NONE --invoke-mode RESPONSE_STREAM --cors "$CORS_URL" >/dev/null
else
  aws lambda create-function-url-config --function-name $CLAUDE_FN --auth-type NONE --invoke-mode RESPONSE_STREAM --cors "$CORS_URL" >/dev/null
fi
aws lambda add-permission --function-name $CLAUDE_FN --statement-id url-public --action lambda:InvokeFunctionUrl \
  --principal '*' --function-url-auth-type NONE >/dev/null 2>&1 || true
aws lambda add-permission --function-name $CLAUDE_FN --statement-id url-public-invoke --action lambda:InvokeFunction \
  --principal '*' --invoked-via-function-url >/dev/null 2>&1 || true
CLAUDE_URL=$(aws lambda get-function-url-config --function-name $CLAUDE_FN --query FunctionUrl --output text)

echo "6/6 API Gateway(HTTP API) $API_NAME"
API_FN_ARN=$(aws lambda get-function --function-name $API_FN --query Configuration.FunctionArn --output text)
CORS_API="{\"AllowOrigins\":$ORIGINS,\"AllowMethods\":[\"GET\",\"POST\",\"OPTIONS\"],\"AllowHeaders\":[\"content-type\",\"authorization\"],\"MaxAge\":3600}"
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID=$(aws apigatewayv2 create-api --name $API_NAME --protocol-type HTTP --target "$API_FN_ARN" --cors-configuration "$CORS_API" --query ApiId --output text)
else
  aws apigatewayv2 update-api --api-id "$API_ID" --cors-configuration "$CORS_API" >/dev/null
fi
aws lambda add-permission --function-name $API_FN --statement-id apigw-invoke --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:$REGION:$ACCT:$API_ID/*/*" >/dev/null 2>&1 || true
API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com"

echo
echo "완료. 서버 배포가 끝났어요. 앱(Vercel)에서는 따로 할 일이 없어요."
echo "참고 : 아래 두 주소는 이미 앱의 vite.config.js 에 들어 있어요. 주소가 바뀌었을 때만 그 파일을 고치면 돼요."
echo "VITE_API_URL=$API_URL"
echo "VITE_CLAUDE_PROXY_URL=${CLAUDE_URL%/}"
