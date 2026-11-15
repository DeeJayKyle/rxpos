// Web sign-in: continue in the browser, or download the Windows / Android app (src/appDownloads.js).
// The browser version needs the internet the whole time and keeps nothing on the computer; the apps keep the
// pharmacy on the device and keep selling offline. Same account and data either way.
import { useEffect, useState } from 'react';
import { Download, Globe, Monitor, Smartphone, WifiOff, Info } from 'lucide-react';
import { cloudUrl } from '../cloud.js';
import { deviceOf, downloadLinks, RELEASES_PAGE } from '../appDownloads.js';

const getJson = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export default function AppDownloads() {
  const base = cloudUrl().replace(/\/+$/, '');
  const [links, setLinks] = useState(() => downloadLinks(base, null, null));
  const device = deviceOf(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  useEffect(() => {
    let live = true;
    Promise.all([getJson(`${base}/api/app/flutter-windows.json`), getJson(`${base}/api/app/flutter-android.json`)])
      .then(([w, a]) => live && setLinks(downloadLinks(base, w, a)));
    return () => { live = false; };
  }, [base]);
  const order = device === 'android' ? ['android', 'windows'] : ['windows', 'android'];
  const btn = (k) => {
    const l = links[k], mine = device === k;
    return (
      <a key={k} className={'btn block app-dl ' + (mine ? 'primary' : 'ghost')} href={l.url} target={l.direct ? undefined : '_blank'} rel="noreferrer" data-platform={k}
        download={l.direct ? '' : undefined} aria-label={`Download RxPOS for ${l.name}${l.version ? `, version ${l.version}` : ''}${l.size ? `, ${l.size}` : ''}`}>
        {k === 'windows' ? <Monitor size={16} /> : <Smartphone size={16} />}
        <span className="grow app-dl-label"><span>Download for {l.name}</span>
          <small>{[mine && 'this device', l.version && `v${l.version}`, l.size].filter(Boolean).join(' · ') || 'release page'}</small></span>
      </a>
    );
  };
  return (
    <section className="auth-card app-downloads" aria-labelledby="app-dl-title">
      <h2 id="app-dl-title" className="app-dl-title"><Download size={18} /> Browser or app?</h2>
      <div className="app-dl-choices">
        <div className="app-dl-choice">
          <strong><Globe size={15} /> Continue in the browser</strong>
          <span className="muted small">Nothing to install. Needs the internet the whole time and keeps nothing on this computer. Good for checking reports or a shared computer.</span>
        </div>
        <div className="app-dl-choice">
          <strong><WifiOff size={15} /> Download the app</strong>
          <span className="muted small">For the counter: keeps selling when the internet drops and syncs later, keeps your pharmacy on the device, works with scanners and receipt printers, quick PIN or fingerprint sign-in, and updates itself.</span>
        </div>
      </div>
      {device === 'apple'
        ? <p className="small app-dl-note"><Info size={14} aria-hidden="true" /> There is no RxPOS app for iPhone, iPad or Mac yet: use the browser here, or the Windows or Android app on another device.</p>
        : null}
      <div className="stack app-dl-buttons">{order.map(btn)}</div>
      <p className="muted small app-dl-foot">
        Same account and data in the app: sign in with this email and password. Android may ask you to allow installing apps from your browser (the app is not from the Play Store).{' '}
        <a href={RELEASES_PAGE} target="_blank" rel="noreferrer">All downloads and release notes</a>
      </p>
    </section>
  );
}
