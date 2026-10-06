import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()], cacheDir: 'node_modules/.qa-navigation-cache',
  define: { 'import.meta.env.VITE_PROCUREMENT_DATA_MODE': JSON.stringify('mock') },
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
});
