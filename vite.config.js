import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages (/pharmapos/) and inside Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react()],
});
