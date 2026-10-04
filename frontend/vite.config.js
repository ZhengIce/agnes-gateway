import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/admin/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://127.0.0.1:8787',
      '/v1': 'http://127.0.0.1:8787',
      '/agnesapi': 'http://127.0.0.1:8787',
    },
  },
})
