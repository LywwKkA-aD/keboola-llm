import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Same-origin API in development; the server's Host/Origin guard allows the dev port.
    proxy: { '/api': { target: 'http://127.0.0.1:4800', changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
