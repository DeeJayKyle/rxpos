import { startWebPolicy } from './webpolicy.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App.jsx';
import CustomerDisplay from './components/CustomerDisplay.jsx';
import { StoreProvider } from './store.jsx';
import { FeedbackHost } from './feedback.jsx';
import { idbGet, idbKeys } from './idb.js';
import './styles.css';
import './styles/rxpos-nextgen.css';
import './styles/themes-ref.css';
import './styles/dashboard.css';
import './styles/settings.css';
import './styles/clean.css';
import './styles/compact.css';
import './styles/linecolors.css';
import './styles/pagecolors.css';
import './styles/kits.css';
import './styles/tables.css';
import './styles/forms.css';
import './styles/pages-f.css';
import './styles/duotone.css'; // every page in its theme's two colours
import './styles/glossy.css'; // last: the Pharmacy themes' glossy dashboard
import { applyTheme, startupTheme, savedAccent } from './themes.js';
import { applyStyle, savedStyle } from './surface.js';
import { applyLevel, savedLevel } from './vivid.js';
import { isAndroid, isNative, isTouch } from './platform.js';
// E4: a touch screen gets bigger targets (src/styles/forms.css :root[data-touch])
if (isTouch) document.documentElement.dataset.touch = '';
// E8: the opening screen shows this pharmacy's logo and name once this device has seen them (kept by the app below)
try {
  const sp = JSON.parse(localStorage.getItem('rxpos-splash') || 'null');
  const el = document.getElementById('splash');
  if (sp && el && !el.querySelector('.splash-pharmacy')) {
    const box = document.createElement('div'); box.className = 'splash-pharmacy';
    if (sp.logo && /^https?:/.test(sp.logo)) { const im = document.createElement('img'); im.src = sp.logo; im.alt = ''; box.appendChild(im); }
    if (sp.name) { const n = document.createElement('span'); n.textContent = sp.name; box.appendChild(n); }
    el.appendChild(box);
  }
} catch { /* storage blocked: the RxPOS mark alone */ }
import { startUpdates } from './update.js';
import { startDevice } from './device.js';
import { startCrashReports, reportError, flush } from './crash.js';

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
    // E10: said plainly, with the three ways on: try again, the dashboard, send the report (the crash report already
    // went when it happened; Send report sends it again with the page it happened on)
    const again = () => this.setState({ error: null, sent: false });
    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <h1>Something went wrong on this page</h1>
          <p>Nothing you saved is lost: your sales and stock are kept on this device. Try the page again, or go back to the dashboard.</p>
          <div className="row gap wrap">
            <button className="btn primary" onClick={again}>Try again</button>
            <button className="btn ghost" onClick={() => { location.hash = '#/'; again(); }}>Go to the dashboard</button>
            <button className="btn ghost" disabled={this.state.sent} onClick={() => { reportError(this.state.error, { kind: 'crash', page: location.hash, sentByUser: true }); flush().catch(() => {}); this.setState({ sent: true }); }}>{this.state.sent ? 'Report sent, thank you' : 'Send report'}</button>
          </div>
          <details className="crash-more"><summary>Details for support</summary>
            <pre>{String(this.state.error?.message || this.state.error)}</pre>
            <button className="btn ghost sm" onClick={() => this.exportData()}>Download my data</button>
            <button className="btn ghost sm" onClick={() => location.reload()}>Reload RxPOS</button>
          </details>
        </div>
      </div>
    );
  }
}

// the customer display (a second window facing the client, opened from the till): it only listens to the till
const customerDisplay = typeof location !== 'undefined' && location.hash.startsWith('#/display');
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {customerDisplay ? <CustomerDisplay /> : <>
        <StoreProvider>
          <App />
        </StoreProvider>
        <FeedbackHost />
      </>}
    </ErrorBoundary>
  </React.StrictMode>
);

// Self-updates start with the app (also on the sign-in screen): the new build reports that it started, so the
// Windows and Android updaters keep it instead of rolling back
if (!customerDisplay) {
  startUpdates();
  startDevice(); // this device's layout, text size, rotation and tray (src/device.js)
  startCrashReports(); // private error reports to the pharmacy's own cloud (src/crash.js)
}

// The Windows and Android apps keep the pharmacy for offline work: ask the system not to evict it when space is low.
// (The web version is online only: no offline service worker, nothing stored; see src/webpolicy.js.)
if (isNative) navigator.storage?.persist?.().catch(() => {});
