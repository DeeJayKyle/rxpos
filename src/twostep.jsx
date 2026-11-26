// Switch two-step sign-in on or off for yourself: scan a QR code with an authenticator app, confirm with a code.
import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { Qr as QrCode } from './qr.jsx';
import { Modal } from './ui.jsx';
import { useStore } from './store.jsx';
import { toast } from './feedback.jsx';
import { twoStep } from './cloud.js';

const Qr = ({ text }) => <QrCode text={text} label="QR code to scan with the authenticator app" />;

export function TwoStepModal({ onClose }) {
  const { syncCfg, user } = useStore();
  const [state, setState] = useState({ stage: 'loading' }); // loading | off | setup | on | error
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { twoStep(syncCfg).then((r) => setState({ stage: r.enabled ? 'on' : 'off', left: r.recoveryLeft })).catch((e) => setState({ stage: 'error', error: e.message })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const start = () => go(async () => { const r = await twoStep(syncCfg, '/setup', {}); setState({ stage: 'setup', ...r }); setCode(''); });
  const enable = (e) => { e.preventDefault(); go(async () => { const r = await twoStep(syncCfg, '/enable', { code }); try { localStorage.setItem(`rxpos-2fa-ok:${syncCfg.tenant || 'device'}:${user.id}`, '1'); } catch { /* ignore */ } setState({ stage: 'codes', codes: r.recovery || [] }); setCode(''); toast('Two-step sign-in is on. Signing in on a new device will ask for a code.'); }); };
  // 2026-11 audit: a new set of one-time recovery codes (the old ones stop working)
  const renew = () => go(async () => { const r = await twoStep(syncCfg, '/recovery', { code }); setState({ stage: 'codes', codes: r.recovery || [] }); setCode(''); });
  const disable = (e) => { e.preventDefault(); go(async () => { await twoStep(syncCfg, '/disable', { code }); setState({ stage: 'off' }); setCode(''); toast('Two-step sign-in is off', 'info'); }); };
  const codeBox = <input className="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Authenticator code" required minLength={6} autoFocus />;
  return (
    <Modal title={<><ShieldCheck size={18} /> Two-step sign-in</>} onClose={onClose}>
      {state.stage === 'loading' && <div className="cart-empty"><Loader2 size={26} className="spin" /></div>}
      {state.stage === 'error' && <div className="error">{state.error}</div>}
      {state.stage === 'off' && (
        <div className="stack">
          <p>Protect your account even if someone learns your password: signing in on a new device also asks for a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy…).</p>
          <div className="form-actions"><button className="btn ghost" onClick={onClose}>Not now</button><button className="btn primary" disabled={busy} onClick={start}><ShieldCheck size={16} />Set it up</button></div>
        </div>
      )}
      {state.stage === 'setup' && (
        <form className="stack" onSubmit={enable}>
          <p className="small">1. In the authenticator app, add an account and scan this code:</p>
          <div className="qr-wrap"><Qr text={state.uri} /></div>
          <p className="small muted center">On this phone? <a href={state.uri}>Open in the authenticator app</a> · or type the key: <code className="key">{state.secret.replace(/(.{4})/g, '$1 ').trim()}</code></p>
          <p className="small">2. Type the 6-digit code the app shows:</p>
          {codeBox}
          <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || code.length !== 6}>Switch on</button></div>
        </form>
      )}
      {state.stage === 'codes' && (
        <div className="stack">
          <p className="notice"><ShieldCheck size={15} /> Two-step sign-in is on. Keep these recovery codes somewhere safe (print them or write them down): each one signs you in once if you lose your phone. They are shown only now.</p>
          <pre className="keybox" style={{ fontSize: 16, lineHeight: 1.7, textAlign: 'center' }} aria-label="Recovery codes">{(state.codes || []).join('\n')}</pre>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText((state.codes || []).join('\n')).then(() => toast('Recovery codes copied'), () => {})}>Copy</button>
            <button type="button" className="btn primary" onClick={() => setState({ stage: 'on', left: (state.codes || []).length })}>I have kept them</button>
          </div>
        </div>
      )}
      {state.stage === 'on' && (
        <form className="stack" onSubmit={disable}>
          <p className="notice"><ShieldCheck size={15} /> Two-step sign-in is on for your account.</p>
          {state.left != null && <p className="small muted">{state.left} recovery code{state.left === 1 ? '' : 's'} left.</p>}
          <p className="small muted">To switch it off (or move it to a new phone), or to get new recovery codes, type a current code from the app:</p>
          {codeBox}
          <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Close</button><button type="button" className="btn ghost" disabled={busy || code.length !== 6} onClick={renew}>New recovery codes</button><button className="btn danger" disabled={busy || code.length !== 6}><ShieldOff size={16} />Switch off</button></div>
        </form>
      )}
    </Modal>
  );
}
