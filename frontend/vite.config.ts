import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 前端由 Family Worker 的 static assets 提供，路徑維持 /Family/（PWA scope、通知連結不用改）。
  // 輸出到 worker/public/Family，讓 Worker 一起部署；不再放 GitHub Pages 的共用 origin。
  base: '/Family/',
  build: {
    outDir: '../worker/public/Family',
    emptyOutDir: true,
  },
})
