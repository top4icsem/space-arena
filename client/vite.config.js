import { defineConfig } from 'vite';

const target = `http://127.0.0.1:${process.env.PORT || 3000}`;
export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': { target, changeOrigin: true },
      '/health': { target, changeOrigin: true },
      '/ws': { target: target.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
});
