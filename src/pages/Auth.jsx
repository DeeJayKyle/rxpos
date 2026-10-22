import { useEffect, useRef, useState } from 'react';
import { Zap, WifiOff, MonitorSmartphone, ShieldCheck, Mail, MessageSquareText, MessageCircle, ArrowLeft, Crown, Building2, LogIn } from 'lucide-react';
import { useStore, verifyPassword, makePassword, put, normalizePhone } from '../store.jsx';
import { Logo, BrandLogo } from '../logo.jsx';
import { toast } from '../feedback.jsx';
import { cloudLogin, cloudUrl, forgotPassword, resetPassword, whatsappLink, pharmacyInfo, googleClient, resetWithGoogle, DEFAULT_CLOUD } from '../cloud.js';
import { isWeb, isNative, pharmacySlugFromUrl } from '../platform.js';
import { PasswordInput } from '../password.jsx';

const LAST_EMAIL = 'rxpos-last-email';
const REMEMBER_CHOICE = 'rxpos-remember-choice';
// This device passed two-step sign-in for this person, so it may sign them in offline
const trustKey = (tenant, uid) => `rxpos-2fa-ok:${tenant || 'device'}:${uid}`;
const trusted = (tenant, uid) => { try { return localStorage.getItem(trustKey(tenant, uid)) === '1'; } catch { return false; } };
const networkFailure = (e) => e instanceof TypeError || /took too long|No internet|Failed to fetch|NetworkError/i.test(e.message);

/**
 * Sign in. Accounts are created by the RxPOS owner (administrators) and by each pharmacy's administrator (staff).
 * The first sign-in on a device needs the internet and downloads the pharmacy; after that it also works offline.
 */
export default function Auth() {
  const { db, update, setUser, syncCfg, linkPharmacy } = useStore();
  const url = cloudUrl();
  const slug = pharmacySlugFromUrl();
  const [pharmacy, setPharmacy] = useState(() => (syncCfg.tenant && (!slug || slug === syncCfg.slug) ? { name: syncCfg.pharmacy || db.settings.name, slug: syncCfg.slug, logo: db.license?.[0]?.branding?.logo } : null));
  const [form, setForm] = useState(() => ({ email: (() => { try { return localStorage.getItem(LAST_EMAIL) || ''; } catch { return ''; } })(), password: '', code: slug || syncCfg.slug || '', otp: '', newPassword: '' }));
  const [needCode, setNeedCode] = useState(false);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem(REMEMBER_CHOICE) === '1'; } catch { return false; } });
  const keepChoice = (v) => { setRemember(v); try { localStorage.setItem(REMEMBER_CHOICE, v ? '1' : '0'); } catch { /* ignore */ } };
  const [twoStep, setTwoStep] = useState(null); // { tenant } while the authenticator code is asked
  const [totp, setTotp] = useState('');
  const [choices, setChoices] = useState(null); // pharmacies this email + password opens
  const [ownerToken, setOwnerToken] = useState(''); // set when the same email + password is also the RxPOS owner's
  // The owner's email and password open the owner console (web only: it isn't part of the apps)
  const openOwner = (token) => {
    if (!isWeb) throw new Error(`That is the RxPOS owner account. Open ${DEFAULT_CLOUD.replace(/^https?:\/\//, '')} in a web browser to manage pharmacies.`);
    try { sessionStorage.setItem('rxpos-owner-key', token); } catch {}
    location.hash = '#/owner';
  };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(() => (location.hash.startsWith('#/forgot') ? { stage: 'ask' } : null)); // { stage: 'ask' | 'code', channel, hint }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const run = async (fn) => { setError(''); setBusy(true); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  // The pharmacy behind this web address (rxposug.com/<pharmacy>)
  useEffect(() => {
    if (!slug || (pharmacy && pharmacy.slug === slug)) return;
    pharmacyInfo(url, slug).then((p) => setPharmacy({ name: p.name, slug: p.slug, logo: p.logo })).catch((e) => setPharmacy({ error: e.message }));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const isUsername = form.email.trim().length > 0 && !form.email.includes('@');
  const signIn = (e) => { e.preventDefault(); run(async () => {
    const email = form.email.trim().toLowerCase();
    const code = form.code.trim().toLowerCase();
    const local = db.users.find((x) => !x.disabled && (x.email === email || (x.username || '').toLowerCase() === email));
    const sameStore = !code || [syncCfg.tenant, syncCfg.slug].includes(code);
    setChoices(null);
    try { localStorage.setItem(LAST_EMAIL, email); } catch {}

    if (navigator.onLine) {
      try {
        const r = await cloudLogin(url, email, form.password, twoStep ? twoStep.tenant : code, twoStep ? totp : undefined);
        if (r.twoFactor) { setTwoStep({ tenant: code }); setTotp(''); return; }
        if (r.owner) { openOwner(r.owner.token); return; }
        if (r.choose) { setChoices(r.choose); setOwnerToken(r.ownerToken || ''); return; } // several pharmacies (or also the owner): let them pick
        await finish(r, email);
        return;
      } catch (err) {
        if (/more than one pharmacy/i.test(err.message)) { setNeedCode(true); throw err; }
        if (!(networkFailure(err) && local && sameStore)) throw err;
        // the cloud can't be reached: fall back to this device's copy of the account
      }
    }
    if (!local || !sameStore) throw new Error('No internet connection. The first sign-in on a device needs the internet to download your pharmacy.');
    if (!(await verifyPassword(local, form.password))) throw new Error('Wrong email or password.');
    if (local.twoFactor && !trusted(syncCfg.tenant, local.id)) throw new Error('You use two-step sign-in, and this device has not been signed in with your code yet. Connect to the internet once to sign in here.');
    if (local.algo !== 'pbkdf2') { const pw = await makePassword(form.password); update((d) => { put(d, 'users', { ...local, ...pw }); }); }
    setUser({ id: local.id, name: local.name, email: local.email, role: local.role }, { remember });
  }); };

  // ---- forgotten password ----
  const adminPhone = normalizePhone(db.settings.adminWhatsApp || db.settings.phone || '');
  const sendCode = (channel) => run(async () => {
    if (!form.email.trim()) throw new Error('Enter your email first.');
    const r = await forgotPassword(url, { email: form.email.trim().toLowerCase(), tenant: form.code.trim().toLowerCase() || undefined, channel });
    setForgot({ stage: 'code', channel, hint: r.hint, message: r.message });
  });
  const confirmReset = (e) => { e.preventDefault(); run(async () => {
    if (form.newPassword.length < 8) throw new Error('Use a password of at least 8 characters.');
    await resetPassword(url, { email: form.email.trim().toLowerCase(), tenant: form.code.trim().toLowerCase() || undefined, code: form.otp, password: form.newPassword, channel: forgot.channel });
    toast('Password changed. Sign in with it now.', 'success');
    setForgot(null);
    setForm((f) => ({ ...f, password: '', otp: '', newPassword: '' }));
  }); };

  const finish = async (r, email) => {
    await linkPharmacy({ url, token: r.token, account: email, tenant: r.tenant, slug: r.slug, pharmacy: r.pharmacy });
    if (twoStep) try { localStorage.setItem(trustKey(r.tenant, r.user.id), '1'); } catch { /* storage blocked */ }
    setTwoStep(null);
    if (isWeb && r.slug && slug !== r.slug) history.replaceState(null, '', '/' + r.slug + location.hash);
    setUser(r.user, { remember });
  };
  const choose = (c) => run(async () => {
    if (c.code === '__owner__') { openOwner(ownerToken); return; }
    const email = form.email.trim().toLowerCase();
    const r = await cloudLogin(url, email, form.password, c.code);
    setChoices(null);
    if (r.twoFactor) { setTwoStep({ tenant: c.code }); setTotp(''); return; }
    await finish(r, email);
  });
  const codeField = (
    <label className="field"><span>Pharmacy web address or code</span>
      <input value={form.code} onChange={set('code')} placeholder="e.g. citycare-ntinda" autoCapitalize="none" spellCheck={false} /></label>
  );

  const forgotPanel = () => (
    <div className="stack">
      <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setForgot(null); setError(''); }}><ArrowLeft size={14} />Back to sign in</button>
      {forgot.stage === 'ask' ? (
        <>
          <p className="muted center">We'll send a 6-digit code to the email or phone saved on your account.</p>
          <label className="field"><span>Your email</span><input type="email" value={form.email} onChange={set('email')} required autoFocus /></label>
          {(needCode || !slug) && codeField}
          {error && <div className="error" role="alert">{error}</div>}
          <GoogleReset url={url} code={form.code.trim().toLowerCase()} slug={slug || syncCfg.slug} onDone={(email) => { setForm((x) => ({ ...x, email, password: '' })); setForgot(null); toast('Password changed with Google. Sign in with the new password.', 'success'); }} />
          <button type="button" className="btn ghost block" disabled={busy || !navigator.onLine} onClick={() => sendCode('email')}><Mail size={16} />Email me a code</button>
          <button type="button" className="btn ghost block" disabled={busy || !navigator.onLine} onClick={() => sendCode('sms')}><MessageSquareText size={16} />Send a code by SMS</button>
          <a className={'btn ghost block' + (adminPhone.length < 12 ? ' disabled-link' : '')} target="_blank" rel="noreferrer"
            href={adminPhone.length >= 12 ? whatsappLink(adminPhone, `Hello, this is ${form.email || '(my email)'}. I forgot my RxPOS password at ${db.settings.name}. Please reset it for me.`) : undefined}>
            <MessageCircle size={16} />Ask my administrator on WhatsApp</a>
          {!navigator.onLine && <p className="muted small center">You're offline. Ask your administrator to reset your password (Users & Roles → Password).</p>}
        </>
      ) : (
        <form onSubmit={confirmReset} className="stack">
          <div className="notice">{forgot.message}{forgot.hint ? ` (${forgot.hint})` : ''}</div>
          <label className="field"><span>6-digit code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.otp} onChange={set('otp')} required autoFocus /></label>
          <label className="field"><span>New password (8+ characters)</span><PasswordInput autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} required /></label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
          <button type="button" className="btn sm ghost" onClick={() => setForgot({ stage: 'ask' })}>Didn't get it? Try again</button>
        </form>
      )}
    </div>
  );

  const title = pharmacy?.name ? `Sign in to ${pharmacy.name}` : 'Sign in to your pharmacy';
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
        <small style={{ opacity: .6 }}>© {new Date().getFullYear()} RxPOS</small>
      </section>
      <div className="auth-side">
        <div className="auth-card">
          <div className="brand big"><BrandLogo src={pharmacy?.logo} size={44} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span></div>
          {choices ? (
            <div className="stack">
              <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setChoices(null); setError(''); }} disabled={busy}><ArrowLeft size={14} />Back</button>
              <p className="center auth-title"><strong>{choices.some((c) => c.code === '__owner__') ? 'Where to?' : 'Which pharmacy?'}</strong><br /><span className="muted small">{choices.some((c) => c.code === '__owner__') ? `Choose where to sign in as ${form.email}` : `${form.email} works at ${choices.length} pharmacies`}</span></p>
              <div className="pharmacy-choices">
                {choices.map((c) => (
                  <button key={c.code} type="button" className={'pharmacy-choice' + ((c.code === syncCfg.slug) ? ' current' : '')} onClick={() => choose(c)} disabled={busy}>
                    {c.code === '__owner__' ? <Crown size={18} /> : <Building2 size={18} />}
                    <span className="grow"><strong>{c.name}</strong><small className="muted">{c.code === '__owner__' ? 'Manage all pharmacies' : <>{c.code}{c.role ? ` · ${c.role}` : ''}{c.code === syncCfg.slug ? ' · this device' : ''}</>}</small></span>
                    <LogIn size={16} />
                  </button>
                ))}
              </div>
              {error && <div className="error" role="alert">{error}</div>}
              {busy && <p className="muted small center">Signing in…</p>}
            </div>
          ) : twoStep ? (
            <form onSubmit={signIn} className="stack">
              <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setTwoStep(null); setError(''); }} disabled={busy}><ArrowLeft size={14} />Back</button>
              <div className="center twostep-head"><ShieldCheck size={26} /><strong>Two-step sign-in</strong><span className="muted small">Type the 6-digit code from the authenticator app on your phone</span></div>
              <input className="otp-input" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus aria-label="Authenticator code" required minLength={6} />
              {error && <div className="error" role="alert">{error}</div>}
              <button className="btn primary block" disabled={busy || totp.length !== 6}><LogIn size={16} />{busy ? 'Checking…' : 'Sign in'}</button>
              <p className="muted small center">Lost your phone? Your administrator can switch two-step sign-in off for you (Users &amp; Roles).</p>
            </form>
          ) : forgot ? forgotPanel() : (
            <form onSubmit={signIn} className="stack">
              {pharmacy?.error ? <div className="error" role="alert">{pharmacy.error}</div> : <p className="muted center auth-title"><Building2 size={15} /> {title}</p>}
              <label className="field"><span>Email or username</span><input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.email} onChange={set('email')} required autoFocus={!form.email} /></label>
              <label className="field"><span>Password</span><PasswordInput autoComplete="current-password" value={form.password} onChange={set('password')} required autoFocus={!!form.email} /></label>
              {(needCode || (isUsername && !slug)) && codeField}
              <div className="row between remember-row">
                <label className="check small"><input type="checkbox" checked={remember} onChange={(e) => keepChoice(e.target.checked)} /><span>Remember me for 30 days</span></label>
                <button type="button" className="link-btn small" onClick={() => { setForgot({ stage: 'ask' }); setError(''); }}>Forgot password?</button>
              </div>
              {remember && <p className="muted small remember-note">Stays signed in on this device. Leave it off on a shared computer.</p>}
              {error && <div className="error" role="alert">{error}</div>}
              <button className="btn primary block" disabled={busy}><LogIn size={16} />{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Forgot password → prove your Gmail / Google account, then choose a new password */
function GoogleReset({ url, code, slug, onDone }) {
  const [clientId, setClientId] = useState(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null), pwRef = useRef('');
  pwRef.current = pw;
  useEffect(() => { if (navigator.onLine) googleClient(url).then((j) => setClientId(j.clientId)).catch(() => {}); }, [url]);
  useEffect(() => {
    if (!clientId || isNative || !ref.current) return;
    const render = () => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: async ({ credential }) => {
        setErr('');
        if (pwRef.current.length < 8) { setErr('Type your new password (8+ characters) first, then press the Google button.'); return; }
        try { const j = await resetWithGoogle(url, { credential, tenant: code || slug || undefined, password: pwRef.current }); onDone(j.email); } catch (e) { setErr(e.message); }
      } });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'continue_with', width: 280 });
    };
    if (window.google?.accounts?.id) { render(); return; }
    const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = render; document.head.appendChild(sc);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clientId) return null;
  if (isNative) return <a className="btn ghost block" href={DEFAULT_CLOUD + '/' + (slug || '') + '#/forgot'} target="_blank" rel="noreferrer">Reset with Google (opens the web page)</a>;
  return (
    <div className="google-reset">
      <p className="muted small center">Reset with the Google (Gmail) account on your RxPOS profile:</p>
      <PasswordInput autoComplete="new-password" placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
      <div className="google-btn" ref={ref} />
      {err && <div className="error" role="alert">{err}</div>}
      <div className="or-line"><span>or</span></div>
    </div>
  );
}
