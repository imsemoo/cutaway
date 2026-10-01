import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from GitHub Pages under /cutaway/.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
  },
})
