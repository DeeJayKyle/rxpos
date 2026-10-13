import { useState } from 'react';
import { Plus, Zap, WifiOff, MonitorSmartphone, ShieldCheck, Cloud, KeyRound } from 'lucide-react';
import { useStore, verifyPassword, makePassword, uid, put, addSampleData, audit } from '../store.jsx';
import { Tabs } from '../ui.jsx';
import { cloudLogin, cleanUrl, DEFAULT_CLOUD } from '../cloud.js';

// When the web app is opened from the cloud itself, that address is the hub
const defaultHub = () => (/^https:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : DEFAULT_CLOUD);

export default function Auth() {
  const { db, update, setUser, syncCfg, saveSyncCfg, syncNow, syncStatus } = useStore();
  const firstRun = db.users.length === 0;
  const [mode, setMode] = useState(firstRun && /(workers|pages)\.dev$/.test(location.hostname) ? 'account' : 'new');
  const [form, setForm] = useState({ name: '', pharmacy: '', email: '', password: '', confirm: '', sample: true, url: syncCfg.url || defaultHub(), key: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const login = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const email = form.email.trim().toLowerCase();
      const u = db.users.find((x) => x.email === email && !x.disabled);
      if (!u || !(await verifyPassword(u, form.password))) return setError('Invalid email or password.');
      // Quietly upgrade old password hashes to the stronger salted format
      if (u.algo !== 'pbkdf2') { const pw = await makePassword(form.password); update((d) => { put(d, 'users', { ...u, ...pw }); }); }
      setUser({ id: u.id, name: u.name, email: u.email, role: u.role });
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    const email = form.email.trim().toLowerCase();
    const admin = { id: uid(), name: form.name || 'Administrator', email, role: 'admin', ...(await makePassword(form.password)) };
    update((d) => {
      put(d, 'users', admin);
      if (form.pharmacy) d.settings = { ...d.settings, name: form.pharmacy, updatedAt: new Date().toISOString() };
      if (form.sample) addSampleData(d, admin.name);
      audit(d, admin, 'Pharmacy created', form.pharmacy || 'My Pharmacy');
    });
    setUser({ id: admin.id, name: admin.name, email, role: 'admin' });
  };

  // Staff joining from a new device: sign in to the cloud with their own account (no shared key needed)
  const joinWithAccount = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const url = cleanUrl(form.url);
      const { token, user } = await cloudLogin(url, form.email.trim().toLowerCase(), form.password);
      saveSyncCfg({ ...syncCfg, url, key: token, account: user.email, cursor: 0, pushedAt: '' });
      setTimeout(syncNow, 300);
      setUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const joinWithKey = (e) => {
    e.preventDefault();
    setError('');
    saveSyncCfg({ ...syncCfg, url: cleanUrl(form.url), key: form.key.trim(), account: '', cursor: 0, pushedAt: '' });
    setTimeout(syncNow, 300);
  };

  return (
    <div className="auth-bg">
      <section className="auth-hero">
        <div className="brand"><span className="logo"><Plus size={20} strokeWidth={3} /></span> RxPOS</div>
        <div>
          <h1>Run your pharmacy <em>anywhere</em>, even offline.</h1>
          <ul>
            <li><Zap size={18} />Lightning-fast checkout, barcode scanning and Mobile Money</li>
            <li><WifiOff size={18} />Keeps selling when the internet is down, then syncs automatically</li>
            <li><MonitorSmartphone size={18} />One system on Windows PCs, Android phones and the web, across all your branches</li>
            <li><ShieldCheck size={18} />Batch & expiry tracking, audit trail, finance and reports built in</li>
          </ul>
        </div>
        <small style={{ opacity: .6 }}>© {new Date().getFullYear()} RxPOS</small>
      </section>
      <div className="auth-side">
        <div className="auth-card">
          <div className="brand big"><span className="logo"><Plus size={20} strokeWidth={3} /></span> RxPOS</div>
          {!firstRun ? (
            <form onSubmit={login} className="stack">
              <p className="muted center">Sign in to {db.settings.name}</p>
              <label className="field"><span>Email</span><input type="email" autoComplete="username" value={form.email} onChange={set('email')} required autoFocus /></label>
              <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required /></label>
              {error && <div className="error">{error}</div>}
              <button className="btn primary block" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
            </form>
          ) : (
            <>
              <Tabs tabs={[['new', 'New pharmacy'], ['account', 'Join with my account'], ['key', 'Admin: sync key']]} value={mode} onChange={(m) => { setMode(m); setError(''); }} />
              {mode === 'new' && (
                <form onSubmit={create} className="stack">
                  <p className="muted center">Create the administrator account.</p>
                  <label className="field"><span>Your name</span><input value={form.name} onChange={set('name')} required /></label>
                  <label className="field"><span>Pharmacy name</span><input value={form.pharmacy} onChange={set('pharmacy')} /></label>
                  <label className="field"><span>Email</span><input type="email" autoComplete="username" value={form.email} onChange={set('email')} required /></label>
                  <label className="field"><span>Password (8+ characters)</span><input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required /></label>
                  <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></label>
                  <label className="field check"><input type="checkbox" checked={form.sample} onChange={set('sample')} /><span>Load sample medicines to try it out</span></label>
                  {error && <div className="error">{error}</div>}
                  <button className="btn primary block">Create pharmacy</button>
                </form>
              )}
              {mode === 'account' && (
                <form onSubmit={joinWithAccount} className="stack">
                  <p className="muted center"><Cloud size={14} /> Use the email and password your administrator created for you. Your pharmacy’s data downloads to this device.</p>
                  <label className="field"><span>Email</span><input type="email" autoComplete="username" value={form.email} onChange={set('email')} required autoFocus /></label>
                  <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required /></label>
                  <details><summary className="muted small">Cloud address</summary><input value={form.url} onChange={set('url')} /></details>
                  {error && <div className="error">{error}</div>}
                  <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in & download'}</button>
                </form>
              )}
              {mode === 'key' && (
                <form onSubmit={joinWithKey} className="stack">
                  <p className="muted center"><KeyRound size={14} /> For the owner/administrator: connect with the pharmacy’s sync key, then sign in with your usual account.</p>
                  <label className="field"><span>Cloud / hub address</span><input value={form.url} onChange={set('url')} required /></label>
                  <label className="field"><span>Sync key</span><input type="password" value={form.key} onChange={set('key')} required /></label>
                  {syncStatus.state === 'error' && <div className="error">{syncStatus.error}</div>}
                  {syncStatus.state === 'syncing' && <div className="muted center">Downloading data…</div>}
                  <button className="btn primary block">Connect & download</button>
                </form>
              )}
            </>
          )}
          <p className="muted small center">Works offline. Data is kept on this device{syncCfg.url ? ' and synced with the cloud' : ''}.</p>
        </div>
      </div>
    </div>
  );
}
