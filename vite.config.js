import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// RXPOS_SEED=path/to/data.json builds a preloaded edition: the data ships as seed.js and fills an empty device on first run.
// The data file never goes into the repository, and normal builds are unaffected.
function seed() {
  const file = process.env.RXPOS_SEED;
  if (!file) return null;
  return {
    name: 'rxpos-seed',
    apply: 'build',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'seed.js', source: 'window.__RXPOS_SEED__=' + fs.readFileSync(file, 'utf8') + ';' }); },
    transformIndexHtml: (html) => html.replace('<head>', '<head>\n    <script src="./seed.js"></script>'),
  };
}

// Relative base so the same build works on GitHub Pages (/pharmapos/) and inside Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react(), seed()],
});
