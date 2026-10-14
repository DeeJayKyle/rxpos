import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on the web (rxpos.pages.dev/<pharmacy>) and inside Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react()],
});
