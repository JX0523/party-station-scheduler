import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // 开发环境用根路径，生产构建用 GitHub Pages 子路径
  base: mode === 'production' ? '/party-station-scheduler/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
}))
