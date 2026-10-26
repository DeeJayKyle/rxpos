// One RxPOS tab at a time on a trusted browser (1.6). That browser keeps the pharmacy on the device, and two tabs
// writing it (and sending its outbox) at once could show each other out-of-date stock. The first tab holds a Web Lock;
// another tab shows "open in another tab" with a button to move RxPOS there: the first tab then lets go (its changes
// are already on the device: every change is saved before it is shown) and steps aside, and the new tab loads fresh
// from the device. The apps have one window, and a session-only browser keeps nothing, so neither needs this.
import { useEffect, useRef, useState } from 'react';
import { trustedDevice } from './webpolicy.js';

const LOCK = 'rxpos-main', CHANNEL = 'rxpos-tabs';

export function TabGate({ children }) {
  const guarded = trustedDevice() && typeof navigator !== 'undefined' && !!navigator.locks && typeof BroadcastChannel !== 'undefined';
  const [state, setState] = useState(guarded ? 'checking' : 'mine'); // checking | mine | other | moved
  const release = useRef(null);
  // holding the lock = this tab runs RxPOS; the lock goes when the tab closes or hands over
  const hold = () => new Promise((res) => { release.current = res; setState('mine'); });
  useEffect(() => {
    if (!guarded) return;
    const bc = new BroadcastChannel(CHANNEL);
    navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => (lock ? hold() : setState('other')));
    bc.onmessage = (e) => {
      if (e.data === 'take-over' && release.current) { release.current(); release.current = null; setState('moved'); }
    };
    return () => { bc.close(); release.current?.(); };
  }, [guarded]);

  const takeOver = () => {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage('take-over');
    bc.close();
    setState('checking');
    // granted once the other tab has let go; RxPOS then starts here from what is on the device
    navigator.locks.request(LOCK, hold);
  };

  if (state === 'mine') return children;
  if (state === 'checking') return <div className="loading"><div className="spinner" /></div>;
  return (
    <div className="tab-gate" role="alertdialog" aria-labelledby="tab-gate-title">
      <div className="auth-card">
        <h2 id="tab-gate-title">{state === 'moved' ? 'RxPOS moved to another tab' : 'RxPOS is open in another tab'}</h2>
        <p className="muted">This browser keeps the pharmacy for offline work, so RxPOS runs in one tab at a time. Your work is saved on this device.</p>
        <button className="btn primary block" onClick={takeOver}>Use RxPOS in this tab</button>
      </div>
    </div>
  );
}
