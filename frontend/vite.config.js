import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on 0.0.0.0 (all network addresses)
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Ensure _redirects file is copied to dist
    copyPublicDir: true,
  },
})
