import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from '/home/claude/buildtools/node_modules/vite-plugin-singlefile/dist/esm/index.js';
export default defineConfig({ base: './', plugins: [react(), viteSingleFile()], build: { outDir: '/home/claude/single-dist', emptyOutDir: true, chunkSizeWarningLimit: 20000 } });
