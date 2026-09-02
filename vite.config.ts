import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { getClientBuildDirectory } from './shared/deployment.ts';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: getClientBuildDirectory(process.env),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
