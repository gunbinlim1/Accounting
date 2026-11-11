import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 배포 시 워크플로가 BASE_PATH=/Accounting/ 를 지정합니다.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // 화면 하단에 배포된 커밋 표시 (Vercel이 빌드 때 VERCEL_GIT_COMMIT_SHA·VERCEL_ENV를 넣어 줌)
  define: {
    __BUILD_SHA__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
    __BUILD_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'local'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
})
