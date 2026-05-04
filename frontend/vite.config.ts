import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 后端默认监听 3003，开发模式通过 proxy 把 /api 和 /uploads 转发到后端
// 生产模式由后端直接 serve 前端 dist，无需 proxy
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3003';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 9003,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/uploads': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
});
