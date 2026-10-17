import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 서버 주소 두 개는 비밀값이 아니다(빌드된 JS 에 그대로 들어간다). Claude 키는 AWS Lambda 환경변수에만 있다
// Vercel, Netlify 에서 빌드할 때만 넣는다. 내 컴퓨터에서 빌드한 테스트판은 서버에 붙지 않는다
const SERVER = {
  VITE_API_URL: 'https://2bd5jctfl2.execute-api.ap-southeast-2.amazonaws.com',
  VITE_CLAUDE_PROXY_URL: 'https://4yaojo3vodbawtxietqef3hs7u0wunhm.lambda-url.ap-southeast-2.on.aws',
};
const hosted = !!(process.env.VERCEL || process.env.NETLIFY);
for (const [k, v] of Object.entries(SERVER)) if (hosted && !process.env[k]) process.env[k] = v;

export default defineConfig({
  plugins: [react()],
  base: './',
});
