import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on the web (rxpos.pages.dev/<pharmacy>) and inside Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react()],
  // pdf.js ships its worker as .mjs; some app servers (Android WebView) don't serve .mjs as JavaScript, so emit it as .js
  build: { rollupOptions: { output: { assetFileNames: (a) => (/\.mjs$/.test(a.names?.[0] || a.name || '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') } } },
});
