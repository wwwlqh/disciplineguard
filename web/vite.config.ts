import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DG_API_PORT points a second dev server at its own API (server/dev.ts with PORT set).
const api = `http://localhost:${process.env.DG_API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/v1': api, '^/dev/': api },
  },
  build: { outDir: 'dist', sourcemap: false },
});
