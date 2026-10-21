import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on the web (rxposug.com/<pharmacy>) and inside Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react()],
  // pdf.js ships its worker as .mjs; some app servers (Android WebView) don't serve .mjs as JavaScript, so emit it as .js
  build: { chunkSizeWarningLimit: 900, rollupOptions: { output: {
    // React in its own file: it rarely changes, so devices keep it cached across RxPOS updates
    manualChunks: (id) => (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//.test(id) ? 'react' : undefined),
    assetFileNames: (a) => (/\.mjs$/.test(a.names?.[0] || a.name || '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') } } },
});
