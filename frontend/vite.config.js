import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true
      },
      '/media': {
        target: process.env.FRONTEND_URL || 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
