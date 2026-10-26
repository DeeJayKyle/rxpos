// "This device": what each person can set for the phone, tablet or PC in front of them. Nothing here is shared.
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Download, MonitorSmartphone, Smartphone, Monitor, ZoomIn, RotateCw, Volume2, Upload, Play, BellRing, CheckCircle2, AlertTriangle, PanelBottom } from 'lucide-react';
import { LABEL, onUpdate, updateNow } from '../update.js';
import { platformName, isElectron, isAndroid } from '../platform.js';
import { deviceSettings, setDevice, onDevice, canSwitchView, canRotate, hasTray } from '../device.js';
import { SOUND_KINDS, TONE_CHOICES, playSound, setCustomSound, soundsOn, setSounds } from '../notify.jsx';
import { askNotifyPermission, notifyPermission } from '../badges.js';
import { toast, ask } from '../feedback.jsx';
import { useStore, restoreLegacyCopy } from '../store.jsx';
import { storage } from '../storage.js';
import { idbGet } from '../idb.js';
import { isWeb } from '../platform.js';
import { keepsData, trustedDevice, reloadForMode } from '../webpolicy.js';
import { hasOffline, OFFLINE_DAYS } from '../offline.js';
import { Database, WifiOff, ShieldCheck, Undo2 } from 'lucide-react';

const Choice = ({ value, onChange, options, label }) => (
  <div className="seg" role="radiogroup" aria-label={label}>
    {options.map(([v, text, Icon]) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{Icon && <Icon size={15} />}{text}</button>
    ))}
  </div>
);

export default function Device() {
  const [d, setD] = useState(deviceSettings);
  useEffect(() => onDevice(setD), []);
  return (
    <div className="page device-page">
      <div className="page-head"><div><h1>This device</h1><div className="sub">Only changes this {isAndroid ? 'phone or tablet' : isElectron ? 'computer' : 'browser'}. Everyone else keeps their own setup.</div></div></div>
      <div className="grid-2">
        <Updates />
        <SyncStorage />
        <section className="card">
          <h3><MonitorSmartphone size={18} />Screen</h3>
          {canSwitchView && <>
            <p className="muted small">Desktop view shows the full PC layout. Pinch or double-tap to read the small print.</p>
            <Choice label="Layout" value={d.view} onChange={(view) => setDevice({ view })} options={[['auto', 'Automatic', MonitorSmartphone], ['phone', 'Phone view', Smartphone], ['desktop', 'Desktop view', Monitor]]} />
          </>}
          <label className="field" style={{ marginTop: 14 }}><span><ZoomIn size={14} /> Text and button size · {Math.round(d.zoom * 100)}%</span>
            <input type="range" min="0.8" max="1.6" step="0.05" value={d.zoom} onChange={(e) => setDevice({ zoom: Number(e.target.value) })} /></label>
          {canSwitchView && <label className="field check"><input type="checkbox" checked={d.doubleTap} onChange={(e) => setDevice({ doubleTap: e.target.checked })} /><span>Double-tap an empty spot to zoom in, and again to zoom out</span></label>}
          {canRotate && <>
            <p className="small" style={{ margin: '14px 0 6px' }}><RotateCw size={14} /> Rotation</p>
            <Choice label="Rotation" value={d.rotation} onChange={(rotation) => setDevice({ rotation })} options={[['auto', 'Turns with the phone'], ['portrait', 'Stay upright'], ['landscape', 'Stay sideways']]} />
          </>}
          {d.zoom !== 1 && <button className="link-btn small" onClick={() => setDevice({ zoom: 1 })}>Back to 100%</button>}
        </section>
        <Sounds d={d} />
        <Notices d={d} />
      </div>
    </div>
  );
}

export function Updates() {
  const [u, setU] = useState({ status: 'current' });
  const [busy, setBusy] = useState(false);
  useEffect(() => onUpdate(setU), []);
  const go = async () => {
    setBusy(true);
    const r = await updateNow();
    setBusy(false);
    if (r.status === 'current') toast(`You already have the latest version (${LABEL})`, 'success');
    else if (r.status === 'shell') toast('This version needs the new installer. Ask your RxPOS provider for it.', 'warn');
    else if (r.status === 'error') toast(r.error || 'Could not reach the update server. Check the internet and try again.', 'error');
  };
  const working = busy || u.status === 'checking' || u.status === 'downloading';
  const line = { checking: 'Looking for a newer version…', downloading: 'Downloading the new version…', ready: `Version ${u.latest?.label || ''} is downloaded and ready`, shell: 'The newest version needs a fresh installer', error: u.error, current: u.latest ? 'You have the latest version' : 'Updates install by themselves when the app is quiet' }[u.status];
  return (
    <section className="card update-card">
      <h3><RefreshCw size={18} />App version</h3>
      <div className="update-hero">
        <span className={'update-orb' + (working ? ' spin' : '') + (u.status === 'ready' ? ' ready' : '')}>{u.status === 'error' || u.status === 'shell' ? <AlertTriangle size={26} /> : u.status === 'current' && u.latest ? <CheckCircle2 size={26} /> : <Download size={26} />}</span>
        <div>
          <strong>RxPOS {LABEL}</strong>
          <div className="muted small">{platformName}</div>
          <div className={'small ' + (u.status === 'error' || u.status === 'shell' ? 'text-warn' : 'muted')}>{line}</div>
        </div>
      </div>
      <button className="btn primary big" disabled={working} onClick={go}>
        {working ? <><span className="spinner sm" />{u.status === 'downloading' ? 'Downloading…' : 'Checking…'}</> : u.status === 'ready' ? <><RefreshCw size={17} />Restart into the new version</> : <><Download size={17} />Update to the latest version</>}
      </button>
      <p className="muted small">Your open sale, Add Stock drafts and held sales stay put through the update.</p>
    </section>
  );
}

function Sounds({ d }) {
  const [on, setOn] = useState(soundsOn);
  const file = useRef(null);
  const [forKind, setForKind] = useState('');
  const choose = (kind, tone) => {
    if (tone === 'custom') { setForKind(kind); file.current.click(); return; }
    setDevice({ sounds: { ...d.sounds, [kind]: tone } });
    if (tone !== 'off') playSound(kind, { tone });
  };
  const picked = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await setCustomSound(forKind, f); setDevice({ sounds: { ...d.sounds, [forKind]: 'custom' }, names: { ...(d.names || {}), [forKind]: f.name } }); playSound(forKind); toast(`"${f.name}" will play for ${SOUND_KINDS.find((k) => k[0] === forKind)[1].toLowerCase()}`, 'success'); }
    catch (err) { toast(err.message || 'That file could not be played. Try an MP3 or WAV.', 'error'); }
  };
  return (
    <section className="card">
      <h3><Volume2 size={18} />Notification sounds</h3>
      <label className="field check"><input type="checkbox" checked={on} onChange={(e) => { setSounds(e.target.checked); setOn(e.target.checked); }} /><span>Play sounds on this device</span></label>
      <label className="field"><span>Volume · {Math.round(d.volume * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={d.volume} disabled={!on} onChange={(e) => setDevice({ volume: Number(e.target.value) })} onPointerUp={() => playSound('message')} /></label>
      <div className="sound-list">
        {SOUND_KINDS.map(([kind, label, def]) => {
          const cur = d.sounds[kind] || def;
          return (
            <div key={kind} className="sound-row">
              <span className="grow">{label}{cur === 'custom' && <small className="muted"> · {d.names?.[kind] || 'your file'}</small>}</span>
              <select value={cur} disabled={!on} onChange={(e) => choose(kind, e.target.value)} aria-label={`Sound for ${label}`}>
                {TONE_CHOICES.filter(([id]) => id !== 'ringback').map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                <option value="custom">{cur === 'custom' ? 'My file (change…)' : 'My own file…'}</option>
                <option value="off">Silent</option>
              </select>
              <button className="icon-btn" disabled={!on || cur === 'off'} title="Play it" onClick={() => playSound(kind, { tone: cur === 'custom' ? undefined : cur })}><Play size={15} /></button>
            </div>
          );
        })}
      </div>
      <input ref={file} type="file" hidden accept="audio/*" onChange={picked} />
      <p className="muted small"><Upload size={12} /> Your own sound can be any short MP3, WAV, OGG or M4A file under 1.5 MB.</p>
    </section>
  );
}

function Notices({ d }) {
  const [perm, setPerm] = useState(notifyPermission());
  return (
    <section className="card">
      <h3><BellRing size={18} />When RxPOS is in the background</h3>
      <p className="muted small">New messages, calls and stock alerts pop up {isAndroid ? 'in the phone’s notification shade and as a dot on the app icon' : isElectron ? 'in the corner of the screen and as a number on the taskbar icon' : 'as system notifications, with a number on the app icon if RxPOS is installed'}.</p>
      {perm === 'granted'
        ? <div className="status-line ok"><CheckCircle2 size={16} />Notifications are allowed</div>
        : <button className="btn ghost" onClick={async () => setPerm(await askNotifyPermission())}><BellRing size={16} />{perm === 'denied' ? 'Notifications are blocked: allow them in the system settings' : 'Allow notifications'}</button>}
      <label className="field check" style={{ marginTop: 12 }}><input type="checkbox" checked={d.badges} onChange={(e) => setDevice({ badges: e.target.checked })} /><span>Show the unread count on the app icon</span></label>
      {hasTray && <label className="field check"><input type="checkbox" checked={d.tray} onChange={(e) => setDevice({ tray: e.target.checked })} /><span><PanelBottom size={14} /> Keep running in the system tray when the window is closed, so messages and calls still come through</span></label>}
    </section>
  );
}

/**
 * Where this device's work stands, and whether it can work offline: what is waiting for the cloud, changes the cloud
 * refused (kept here for review, never dropped), what is stored where, a readiness check that verifies the cached app
 * and the downloaded data instead of assuming them, the trusted-device switch for a browser, and recovery after the
 * 1.6 storage upgrade.
 */
function SyncStorage() {
  const { pending, storageIssue, syncStatus, syncCfg, user, makeTrusted, leaveTrusted, db } = useStore();
  const [rejected, setRejected] = useState([]);
  const [est, setEst] = useState(null);
  const [sw, setSw] = useState(null);
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { storage().rejected().then(setRejected).catch(() => {}); }, [syncStatus]);
  useEffect(() => {
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
    if (keepsData()) Promise.all([idbGet('t:sales'), idbGet('migrated-v1-removed')]).then(([old, removed]) => setLegacy(!!old && !removed)).catch(() => {});
    if (!trustedDevice() || !navigator.serviceWorker) return;
    const onMsg = (e) => e.data?.type === 'sw-status' && setSw(e.data);
    navigator.serviceWorker.addEventListener('message', onMsg);
    const ask = () => navigator.serviceWorker.controller?.postMessage('status');
    ask(); const t = setInterval(ask, 3000);
    return () => { clearInterval(t); navigator.serviceWorker.removeEventListener('message', onMsg); };
  }, []);
  const mode = !isWeb ? 'app' : trustedDevice() ? 'trusted' : 'session';
  const data = !!syncCfg?.lastSync && db.products.length > 0;
  const signIn = user && hasOffline(syncCfg?.tenant, user.id);
  const appFiles = mode === 'app' || (sw && sw.total > 0 && sw.cached === sw.total);
  const ready = mode !== 'session' && appFiles && data && signIn;
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const mb = (n) => (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + ' MB';
  const Row = ({ ok, children }) => <li className={'status ' + (ok ? 'ok' : 'warn')}><i aria-hidden="true" />{children}</li>;
  return (
    <section className="card sync-card">
      <h3><Database size={18} />Sync &amp; storage</h3>
      <p className="small">{mode === 'app' ? 'This app keeps the pharmacy on this device and works without internet; changes go to the cloud when it is reachable.'
        : mode === 'trusted' ? 'Trusted device: this browser keeps the pharmacy and works without internet. Use this only on a computer the pharmacy controls; browser storage is not protected by the operating system.'
          : 'Session-only: this browser keeps nothing on the computer. It needs the internet, and closing the tab or signing out forgets everything.'}</p>
      <ul className="sync-facts">
        <li><b>{pending}</b> change{pending === 1 ? '' : 's'} waiting for the cloud{syncStatus.lastSync ? ` · last synced ${new Date(syncStatus.lastSync).toLocaleString()}` : ''}</li>
        {est?.usage != null && <li>Using {mb(est.usage)}{est.quota ? ` of ${mb(est.quota)} this browser allows` : ''}</li>}
      </ul>
      {storageIssue && <div className="error">{storageIssue}</div>}
      {rejected.length > 0 && (
        <div className="notice warn-notice">
          <strong>{rejected.length} change{rejected.length === 1 ? ' was' : 's were'} refused by the cloud</strong>
          <p className="small">They are kept here so nothing disappears silently. Usually the person who made them didn't have permission (ask an administrator to make the change), or the record was too large.</p>
          <ul className="small">{rejected.slice(-8).map((r, i) => <li key={i}>{r.t} · {r.id} · {new Date(r.at || Date.now()).toLocaleString()} — {r.reason}</li>)}</ul>
          <button className="btn sm ghost" onClick={() => run(async () => { if (await ask({ title: 'Clear the refused changes?', message: 'Only clear them once someone has made them again with the right permission. They are not sent anywhere.', confirmText: 'Clear' })) { await storage().clearRejected(); setRejected([]); } })}>Reviewed: clear the list</button>
        </div>
      )}
      {mode !== 'session' && (
        <>
          <h4 className="small" style={{ margin: '12px 0 6px' }}>{ready ? <><CheckCircle2 size={14} className="text-ok" /> Ready to work offline</> : <><AlertTriangle size={14} className="text-warn" /> Not ready to work offline yet</>}</h4>
          <ul className="sync-check">
            {mode === 'trusted' && <Row ok={appFiles}>{sw ? `App saved in this browser: ${sw.cached} of ${sw.total} files` : 'Saving the app in this browser…'}</Row>}
            <Row ok={data}>{data ? `Pharmacy downloaded (${db.products.length.toLocaleString()} medicines)` : 'Downloading the pharmacy… keep the internet on'}</Row>
            <Row ok={signIn}>{signIn ? `You can sign in here offline for ${OFFLINE_DAYS} days after each online sign-in` : 'Sign out and sign in once with the internet so you can sign in here offline'}</Row>
          </ul>
        </>
      )}
      <p className="muted small"><WifiOff size={12} /> Without internet, sales, stock, prescriptions and reports keep working{mode === 'session' ? ' only in the apps or a trusted browser' : ''}. Mobile Money requests, SMS, AI prescription reading, drug information look-ups and Google sign-in need the internet; a Mobile Money payment can still be recorded with the customer&apos;s transaction ID.</p>
      <div className="row gap">
        {mode === 'session' && <button className="btn ghost" disabled={busy} onClick={() => run(async () => {
          if (await ask({ title: 'Work offline in this browser?', message: 'Only on a computer the pharmacy owns and controls. This browser will keep a copy of the pharmacy (about 60 MB) and the app, so it opens and sells without internet. Anyone using this computer account could read it. Afterwards you sign in once more, so you can also sign in here without internet. You can switch it off later.', confirmText: 'Make this a trusted device' })) await makeTrusted();
        })}><ShieldCheck size={16} />Work offline in this browser</button>}
        {mode === 'trusted' && <button className="btn ghost" disabled={busy} onClick={() => run(async () => {
          if (await ask({ title: 'Stop working offline in this browser?', message: 'Everything RxPOS keeps in this browser is removed (after any waiting changes have been sent). It then needs the internet again.', confirmText: 'Stop and remove', danger: true })) await leaveTrusted();
        })}>Stop working offline in this browser</button>}
        {legacy && <button className="btn ghost" disabled={busy} onClick={() => run(async () => {
          if (await ask({ title: 'Restore the copy from before the 1.6 upgrade?', message: 'Use this only if something is missing after the upgrade. The device goes back to that copy and then downloads everything again from the cloud.', confirmText: 'Restore', danger: true })) { await restoreLegacyCopy(); reloadForMode(); }
        })}><Undo2 size={16} />Restore the copy from before the upgrade</button>}
      </div>
    </section>
  );
}
