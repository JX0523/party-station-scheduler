import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/party-station-scheduler/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})
