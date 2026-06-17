import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.join(__dirname, 'renderer', 'src') },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: path.join(__dirname, 'dist', 'renderer'),
    emptyOutDir: true,
  },
});
