import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated browser fixture: no production API proxy or shared dependency cache.
export default defineConfig({
  plugins: [react()],
  cacheDir: '.qa-vite-cache',
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
});
