import { useState } from 'react';
import { useStore, hashPassword, uid, put, addSampleData } from '../store.jsx';
import { Tabs } from '../ui.jsx';

export default function Auth() {
  const { db, update, setUser, syncCfg, saveSyncCfg, syncNow, syncStatus } = useStore();
  const firstRun = db.users.length === 0;
  const [mode, setMode] = useState('new');
  const [form, setForm] = useState({ name: '', pharmacy: '', email: '', password: '', confirm: '', sample: true, url: syncCfg.url, key: syncCfg.key });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const login = async (e) => {
    e.preventDefault();
    setError('');
    const email = form.email.trim().toLowerCase();
    const hash = await hashPassword(form.password);
    const u = db.users.find((x) => x.email === email && x.hash === hash && !x.disabled);
    if (!u) return setError('Invalid email or password.');
    setUser({ id: u.id, name: u.name, email: u.email, role: u.role });
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    const email = form.email.trim().toLowerCase();
    const hash = await hashPassword(form.password);
    const admin = { id: uid(), name: form.name || 'Administrator', email, role: 'admin', hash };
    update((d) => {
      put(d, 'users', admin);
      if (form.pharmacy) d.settings = { ...d.settings, name: form.pharmacy, updatedAt: new Date().toISOString() };
      if (form.sample) addSampleData(d, admin.name);
    });
    setUser({ id: admin.id, name: admin.name, email, role: 'admin' });
  };

  const connect = (e) => {
    e.preventDefault();
    setError('');
    let url = form.url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) url = 'http://' + url;
    saveSyncCfg({ ...syncCfg, url, key: form.key.trim(), cursor: 0, pushedAt: '' });
    setTimeout(syncNow, 300);
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="brand big"><span className="logo">✚</span> PharmaPOS</div>
        {!firstRun ? (
          <form onSubmit={login} className="stack">
            <p className="muted center">Sign in to {db.settings.name}</p>
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} required autoFocus /></label>
            <label className="field"><span>Password</span><input type="password" value={form.password} onChange={set('password')} required /></label>
            {error && <div className="error">{error}</div>}
            <button className="btn primary block">Log in</button>
          </form>
        ) : (
          <>
            <Tabs tabs={[['new', 'New pharmacy'], ['join', 'Join existing (sync)']]} value={mode} onChange={setMode} />
            {mode === 'new' ? (
              <form onSubmit={create} className="stack">
                <p className="muted center">Create the administrator account.</p>
                <label className="field"><span>Your name</span><input value={form.name} onChange={set('name')} required /></label>
                <label className="field"><span>Pharmacy name</span><input value={form.pharmacy} onChange={set('pharmacy')} /></label>
                <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} required /></label>
                <label className="field"><span>Password</span><input type="password" value={form.password} onChange={set('password')} required /></label>
                <label className="field"><span>Confirm password</span><input type="password" value={form.confirm} onChange={set('confirm')} required /></label>
                <label className="field check"><input type="checkbox" checked={form.sample} onChange={set('sample')} /><span>Load sample medicines to try it out</span></label>
                {error && <div className="error">{error}</div>}
                <button className="btn primary block">Create pharmacy</button>
              </form>
            ) : (
              <form onSubmit={connect} className="stack">
                <p className="muted center">Download your pharmacy's data from a PharmaPOS Hub, then sign in with your usual account.</p>
                <label className="field"><span>Hub address</span><input placeholder="e.g. 192.168.1.20:8686 or https://hub.example.com" value={form.url} onChange={set('url')} required /></label>
                <label className="field"><span>Sync key</span><input type="password" value={form.key} onChange={set('key')} required /></label>
                {syncStatus.state === 'error' && <div className="error">{syncStatus.error}</div>}
                {syncStatus.state === 'syncing' && <div className="muted center">Downloading data…</div>}
                <button className="btn primary block">Connect & download</button>
              </form>
            )}
          </>
        )}
        <p className="muted small center">Works offline. Data is kept on this device{syncCfg.url ? ' and synced with your hub' : ''}.</p>
      </div>
    </div>
  );
}
