import { startWebPolicy } from './webpolicy.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App.jsx';
import { StoreProvider } from './store.jsx';
import { FeedbackHost } from './feedback.jsx';
import { idbGet, idbKeys } from './idb.js';
import './styles.css';
import { applyTheme, startupTheme, savedAccent } from './themes.js';
import { applyStyle, savedStyle } from './surface.js';
import { applyLevel, savedLevel } from './vivid.js';
import { isAndroid, isNative } from './platform.js';
import { startUpdates } from './update.js';
import { startDevice } from './device.js';
import { startCrashReports, reportError } from './crash.js';

// The web version is online only and keeps nothing on the computer (src/webpolicy.js); runs before anything reads storage
startWebPolicy();

// Pharmacy web addresses are /<pharmacy> with no trailing slash; drop a stray one for a clean URL.
// (Kept here rather than as an inline <script> in index.html so the web Content-Security-Policy can forbid inline scripts.)
// (not /classic/: the classic app's own folder on rxposug.com, where the slash belongs)
if (!isAndroid && typeof location !== 'undefined' && /^\/[a-z0-9-]+\/+$/.test(location.pathname) && location.pathname !== '/classic/') {
  location.replace(location.pathname.replace(/\/+$/, '') + location.search + location.hash);
}

// The Android app draws its own pull-to-refresh (src/refresh.jsx)
if (isAndroid) document.documentElement.classList.add('is-android');

// Apply the saved theme and surface style before first paint (no flash)
applyTheme(startupTheme(), savedAccent());
applyStyle(savedStyle());
applyLevel(savedLevel());

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info); reportError(error, { kind: 'crash', componentStack: info?.componentStack }); document.getElementById('splash')?.remove(); /* never hide the recovery screen */ }
  async exportData() {
    // Last-resort rescue: download whatever is stored on this device
    const data = {};
    for (const k of await idbKeys().catch(() => [])) if (String(k).startsWith('t:')) data[k.slice(2)] = await idbGet(k).catch(() => null);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'rxpos-rescue.json';
    a.click();
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>Your data is safe on this device. Reload to continue. If this keeps happening, download a copy of your data and contact support.</p>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <div className="row gap">
          <button className="btn primary" onClick={() => location.reload()}>Reload RxPOS</button>
          <button className="btn ghost" onClick={() => this.exportData()}>Download my data</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
      <FeedbackHost />
    </ErrorBoundary>
  </React.StrictMode>
);

// Self-updates start with the app (also on the sign-in screen): the new build reports that it started, so the
// Windows and Android updaters keep it instead of rolling back
startUpdates();
startDevice(); // this device's layout, text size, rotation and tray (src/device.js)
startCrashReports(); // private error reports to the pharmacy's own cloud (src/crash.js)

// The Windows and Android apps keep the pharmacy for offline work: ask the system not to evict it when space is low.
// (The web version is online only: no offline service worker, nothing stored; see src/webpolicy.js.)
if (isNative) navigator.storage?.persist?.().catch(() => {});
