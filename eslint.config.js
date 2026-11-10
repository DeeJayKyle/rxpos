// ESLint for the React app, the cloud, the hub, the Windows shell, tests and scripts (workplan step 17).
//   npm run lint        (CI runs it on every push and pull request: .github/workflows/build.yml)
// The Flutter app has its own analyzer (rxpos_flutter/analysis_options.yaml).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const unused = ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }];
// an empty catch is a deliberate "best effort, carry on" here (with a comment saying why); other empty blocks are not
const base = { 'no-unused-vars': unused, 'no-empty': ['error', { allowEmptyCatch: true }] };

export default [
  { ignores: ['dist/**', 'release/**', 'android/**', 'rxpos_flutter/**', 'node_modules/**', 'tests/.state/**', 'tests/.output/**', '.output/**', 'server/hub-core.mjs', 'hub-data/**', '.harness*/**', 'site/**', 'out/**'] },
  js.configs.recommended,
  {
    // the app (browser, Electron renderer, Android WebView)
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...base,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // the cloud (Cloudflare Worker, also run by the hub in Node) and Cloudflare Pages functions
    files: ['worker/**/*.js', 'functions/**/*.js'],
    // WebSocketPair and the auto-response pair are Cloudflare's own (worker/live.js)
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.worker, ...globals.serviceworker, WebSocketPair: 'readonly', WebSocketRequestResponsePair: 'readonly' } },
    rules: base,
  },
  {
    // Node: the hub, tests, scripts, tools, build config
    files: ['server/**/*.{js,mjs}', 'tests/**/*.mjs', 'scripts/**/*.mjs', 'tools/**/*.{js,mjs}', 'relay/**/*.mjs', 'worker/test-harness.mjs', '*.js', '*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: base,
  },
  {
    // the Windows shell and other CommonJS files
    files: ['**/*.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } },
    rules: base,
  },
  {
    // the service worker and the browser-side snippets
    files: ['public/sw.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    // tests drive pages through puppeteer: code inside page.evaluate() runs in the browser
    files: ['tests/**/*.mjs', 'tools/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    // tests unpack [status, body] pairs and keep the shape even when one check only reads one of them
    rules: { 'no-useless-assignment': 'off' },
  },
  {
    // pasted into the old system's browser console: its page provides $ and Livewire, the snippets' own helpers the rest
    files: ['tools/rxtera/browser-snippets.js'],
    languageOptions: { sourceType: 'script', globals: { RX: 'writable', rxSend: 'readonly', rxSleep: 'readonly', $: 'readonly', Livewire: 'readonly' } },
  },
];
