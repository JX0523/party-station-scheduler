import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // VITE_BASE 不设置时默认根路径（Netlify/Vercel），GitHub Pages 构建时设为 /party-station-scheduler/
  base: process.env.VITE_BASE || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
}))
