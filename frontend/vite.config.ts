import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: [
      'optionspro-client-production.up.railway.app',
      'optionspro-admin-production.up.railway.app',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts: [
      'optionspro-client-production.up.railway.app',
      'optionspro-admin-production.up.railway.app',
    ],
  },
})
