import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App.jsx';
import { StoreProvider } from './store.jsx';
import { FeedbackHost } from './feedback.jsx';
import { idbGet, idbKeys } from './idb.js';
import './styles.css';

// Apply the saved theme before first paint (no flash)
try { const t = localStorage.getItem('pharmapos-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info); }
  async exportData() {
    // Last-resort rescue: download whatever is stored on this device
    const data = {};
    for (const k of await idbKeys().catch(() => [])) if (String(k).startsWith('t:')) data[k.slice(2)] = await idbGet(k).catch(() => null);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'pharmapos-rescue.json';
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

// Ask the browser not to evict our offline database when the device is low on space
navigator.storage?.persist?.().catch(() => {});

// Offline support for the browser version (the desktop and Android apps load from disk and don't need it)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !import.meta.env.DEV && !window.Capacitor) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
