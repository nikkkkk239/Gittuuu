import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  base:"./",
  plugins: [react(), tailwindcss(), nodePolyfills()],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: ['electron'],
    },
  },
});