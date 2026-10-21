import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { buildInfo, writeReleaseFiles } from './scripts/release-files.mjs';

const info = buildInfo();
const { version } = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// After a production build: version.json + the update archive, so every device can update itself (src/update.js)
const releaseFiles = () => ({
  name: 'rxpos-release-files',
  apply: 'build',
  closeBundle() { const m = writeReleaseFiles(path.resolve('dist'), info, version); console.log(`RxPOS ${m.label} · build ${m.build} · ${m.files.length} files`); },
});

// Relative base so the same build works on the web (rxposug.com/<pharmacy>) and inside Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react(), releaseFiles()],
  define: { __RXPOS_BUILD__: JSON.stringify(info.build), __RXPOS_LABEL__: JSON.stringify(info.label) },
  // pdf.js ships its worker as .mjs; some app servers (Android WebView) don't serve .mjs as JavaScript, so emit it as .js
  build: { chunkSizeWarningLimit: 900, rollupOptions: { output: {
    // React in its own file: it rarely changes, so devices keep it cached across RxPOS updates
    manualChunks: (id) => (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//.test(id) ? 'react' : undefined),
    assetFileNames: (a) => (/\.mjs$/.test(a.names?.[0] || a.name || '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') } } },
});
