import { useState } from 'react';
import { Zap, WifiOff, MonitorSmartphone, ShieldCheck, Cloud, KeyRound, Mail, MessageSquareText, MessageCircle, ArrowLeft, Crown } from 'lucide-react';
import { useStore, verifyPassword, makePassword, uid, put, addSampleData, audit, normalizePhone } from '../store.jsx';
import { Tabs } from '../ui.jsx';
import { Logo } from '../logo.jsx';
import { toast } from '../feedback.jsx';
import { cloudLogin, cleanUrl, DEFAULT_CLOUD, forgotPassword, resetPassword, whatsappLink } from '../cloud.js';

// When the web app is opened from the cloud itself, that address is the hub
const defaultHub = () => (/^https:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : DEFAULT_CLOUD);

export default function Auth() {
  const { db, update, setUser, syncCfg, saveSyncCfg, syncNow, syncStatus } = useStore();
  const firstRun = db.users.length === 0;
  const [mode, setMode] = useState(firstRun && /(workers|pages)\.dev$/.test(location.hostname) ? 'account' : firstRun ? 'new' : 'signin');
  const [form, setForm] = useState({ name: '', pharmacy: '', email: '', password: '', confirm: '', sample: false, url: syncCfg.url || defaultHub(), key: '', tenant: '', code: '', newPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(null); // { stage: 'ask' | 'code', channel, hint }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const run = async (fn) => { setError(''); setBusy(true); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  const login = (e) => { e.preventDefault(); run(async () => {
    const email = form.email.trim().toLowerCase();
    const u = db.users.find((x) => x.email === email && !x.disabled);
    if (!u || !(await verifyPassword(u, form.password))) throw new Error('Invalid email or password.');
    // Quietly upgrade old password hashes to the stronger salted format
    if (u.algo !== 'pbkdf2') { const pw = await makePassword(form.password); update((d) => { put(d, 'users', { ...u, ...pw }); }); }
    setUser({ id: u.id, name: u.name, email: u.email, role: u.role });
  }); };

  const create = (e) => { e.preventDefault(); run(async () => {
    if (form.password.length < 8) throw new Error('Use a password of at least 8 characters.');
    if (form.password !== form.confirm) throw new Error('Passwords do not match.');
    const email = form.email.trim().toLowerCase();
    const admin = { id: uid(), name: form.name || 'Administrator', email, role: 'admin', phone: '', ...(await makePassword(form.password)) };
    update((d) => {
      put(d, 'users', admin);
      if (form.pharmacy) d.settings = { ...d.settings, name: form.pharmacy, updatedAt: new Date().toISOString() };
      if (form.sample) addSampleData(d, admin.name);
      audit(d, admin, 'Pharmacy created', form.pharmacy || 'My Pharmacy');
    });
    setUser({ id: admin.id, name: admin.name, email, role: 'admin' });
  }); };

  // Staff joining from a new device: sign in to the cloud with their own account (no shared key needed)
  const joinWithAccount = (e) => { e.preventDefault(); run(async () => {
    const url = cleanUrl(form.url);
    const { token, user, pharmacy } = await cloudLogin(url, form.email.trim().toLowerCase(), form.password, form.tenant.trim().toLowerCase());
    saveSyncCfg({ ...syncCfg, url, key: token, account: user.email, cursor: 0, pushedAt: '' });
    setTimeout(syncNow, 300);
    toast(`Connected to ${pharmacy}. Downloading data…`, 'info');
    setUser(user);
  }); };

  const joinWithKey = (e) => {
    e.preventDefault();
    setError('');
    saveSyncCfg({ ...syncCfg, url: cleanUrl(form.url), key: form.key.trim(), account: '', cursor: 0, pushedAt: '' });
    setTimeout(syncNow, 300);
  };

  // ---- forgotten password ----
  const adminPhone = normalizePhone(db.settings.adminWhatsApp || db.settings.phone || '');
  const sendCode = (channel) => run(async () => {
    if (!form.email.trim()) throw new Error('Enter your email first.');
    const r = await forgotPassword(form.url, { email: form.email.trim().toLowerCase(), tenant: form.tenant.trim().toLowerCase() || undefined, channel });
    setForgot({ stage: 'code', channel, hint: r.hint, message: r.message });
  });
  const confirmReset = (e) => { e.preventDefault(); run(async () => {
    if (form.newPassword.length < 8) throw new Error('Use a password of at least 8 characters.');
    await resetPassword(form.url, { email: form.email.trim().toLowerCase(), tenant: form.tenant.trim().toLowerCase() || undefined, code: form.code, password: form.newPassword, channel: forgot.channel });
    toast('Password changed. You can sign in with it now.', 'success');
    setForgot(null);
    setForm((f) => ({ ...f, password: '', code: '', newPassword: '' }));
    syncNow(); // bring the new password to this device
    setMode(firstRun ? 'account' : 'signin');
  }); };

  const forgotPanel = () => (
    <div className="stack">
      <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setForgot(null); setError(''); }}><ArrowLeft size={14} />Back to sign in</button>
      {forgot.stage === 'ask' ? (
        <>
          <p className="muted center">We'll send a 6-digit code to the email or phone saved on your account.</p>
          <label className="field"><span>Your email</span><input type="email" value={form.email} onChange={set('email')} required autoFocus /></label>
          <details><summary className="muted small">Pharmacy code / cloud address</summary>
            <input placeholder="Pharmacy code (only if asked)" value={form.tenant} onChange={set('tenant')} />
            <input value={form.url} onChange={set('url')} style={{ marginTop: 6 }} /></details>
          {error && <div className="error">{error}</div>}
          <button type="button" className="btn primary block" disabled={busy || !navigator.onLine} onClick={() => sendCode('email')}><Mail size={16} />Email me a code (Gmail works)</button>
          <button type="button" className="btn ghost block" disabled={busy || !navigator.onLine} onClick={() => sendCode('sms')}><MessageSquareText size={16} />Send a code by SMS</button>
          <a className={'btn ghost block' + (adminPhone.length < 12 ? ' disabled-link' : '')} target="_blank" rel="noreferrer"
            href={adminPhone.length >= 12 ? whatsappLink(adminPhone, `Hello, this is ${form.email || '(my email)'}. I forgot my RxPOS password at ${db.settings.name}. Please reset it for me.`) : undefined}>
            <MessageCircle size={16} />Ask my administrator on WhatsApp</a>
          {!navigator.onLine && <p className="muted small center">You're offline. Ask your administrator to reset your password on any RxPOS device (Users & Roles → Password).</p>}
        </>
      ) : (
        <form onSubmit={confirmReset} className="stack">
          <div className="notice">{forgot.message}{forgot.hint ? ` (${forgot.hint})` : ''}</div>
          <label className="field"><span>6-digit code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={set('code')} required autoFocus /></label>
          <label className="field"><span>New password (8+ characters)</span><input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} required /></label>
          {error && <div className="error">{error}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
          <button type="button" className="btn sm ghost" onClick={() => setForgot({ stage: 'ask' })}>Didn't get it? Try again</button>
        </form>
      )}
    </div>
  );

  const ForgotLink = <button type="button" className="link-btn" onClick={() => { setForgot({ stage: 'ask' }); setError(''); }}>Forgot password?</button>;

  return (
    <div className="auth-bg">
      <section className="auth-hero">
        <div className="brand"><Logo size={36} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span></div>
        <div>
          <h1>Run your pharmacy <em>anywhere</em>, even offline.</h1>
          <ul>
            <li><Zap size={18} />Lightning-fast checkout, barcode scanning and Mobile Money</li>
            <li><WifiOff size={18} />Keeps selling when the internet is down, then syncs automatically</li>
            <li><MonitorSmartphone size={18} />One system on Windows PCs, Android phones and the web, across all your branches</li>
            <li><ShieldCheck size={18} />Batch & expiry tracking, drug information, audit trail, finance and reports built in</li>
          </ul>
        </div>
        <small style={{ opacity: .6 }}>© {new Date().getFullYear()} RxPOS · <a href="#/owner" style={{ color: 'inherit' }}><Crown size={11} /> Owner console</a></small>
      </section>
      <div className="auth-side">
        <div className="auth-card">
          <div className="brand big"><Logo size={44} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span></div>
          {forgot ? forgotPanel() : !firstRun ? (
            <form onSubmit={login} className="stack">
              <p className="muted center">Sign in to {db.settings.name}</p>
              <label className="field"><span>Email</span><input type="email" autoComplete="username" value={form.email} onChange={set('email')} required autoFocus /></label>
              <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required /></label>
              {error && <div className="error">{error}</div>}
              <button className="btn primary block" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
              {ForgotLink}
            </form>
          ) : (
            <>
              <Tabs tabs={[['account', 'Join with my account'], ['new', 'New pharmacy'], ['key', 'Admin: sync key']]} value={mode} onChange={(m) => { setMode(m); setError(''); }} />
              {mode === 'new' && (
                <form onSubmit={create} className="stack">
                  <p className="muted center">Set up a new pharmacy on this device. You'll be its administrator.</p>
                  <label className="field"><span>Your name</span><input value={form.name} onChange={set('name')} required /></label>
                  <label className="field"><span>Pharmacy name</span><input value={form.pharmacy} onChange={set('pharmacy')} /></label>
                  <label className="field"><span>Email (Gmail works, used to recover your password)</span><input type="email" autoComplete="username" value={form.email} onChange={set('email')} required /></label>
                  <label className="field"><span>Password (8+ characters)</span><input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required /></label>
                  <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></label>
                  <label className="field check"><input type="checkbox" checked={form.sample} onChange={set('sample')} /><span>Add 10 sample medicines with stock (for practice)</span></label>
                  {error && <div className="error">{error}</div>}
                  <button className="btn primary block">Create pharmacy</button>
                </form>
              )}
              {mode === 'account' && (
                <form onSubmit={joinWithAccount} className="stack">
                  <p className="muted center"><Cloud size={14} /> Use the email and password your administrator created for you. Your pharmacy’s data downloads to this device.</p>
                  <label className="field"><span>Email</span><input type="email" autoComplete="username" value={form.email} onChange={set('email')} required autoFocus /></label>
                  <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required /></label>
                  <details><summary className="muted small">Pharmacy code / cloud address</summary>
                    <input placeholder="Pharmacy code (only if asked)" value={form.tenant} onChange={set('tenant')} />
                    <input value={form.url} onChange={set('url')} style={{ marginTop: 6 }} /></details>
                  {error && <div className="error">{error}</div>}
                  <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in & download'}</button>
                  {ForgotLink}
                </form>
              )}
              {mode === 'key' && (
                <form onSubmit={joinWithKey} className="stack">
                  <p className="muted center"><KeyRound size={14} /> For the pharmacy owner/administrator: connect with the pharmacy’s sync key, then create or sign in to your account.</p>
                  <label className="field"><span>Cloud address</span><input value={form.url} onChange={set('url')} required /></label>
                  <label className="field"><span>Sync key</span><input type="password" value={form.key} onChange={set('key')} required /></label>
                  {syncStatus.state === 'error' && <div className="error">{syncStatus.error}</div>}
                  {syncStatus.state === 'syncing' && <div className="muted center">Downloading data…</div>}
                  {syncStatus.state === 'ok' && firstRun && <div className="notice">Connected. If this pharmacy has no users yet, choose “New pharmacy” to create the administrator.</div>}
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
