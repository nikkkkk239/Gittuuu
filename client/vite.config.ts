import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
    base:"./",
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: ['electron'],
    },
  },
});