import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base:"./",
  plugins: [react(),tailwindcss()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: ['electron'],
    },
  },
});