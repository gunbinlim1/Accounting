import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 배포 시 워크플로가 BASE_PATH=/Accounting/ 를 지정합니다.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
