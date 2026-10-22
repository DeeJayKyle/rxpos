// App-wide toasts and confirmation dialogs (replace the browser's alert/confirm/prompt, which look dated
// and block the page). Call toast()/ask()/askText() from anywhere; <FeedbackHost/> renders them.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { PasswordInput } from './password.jsx';

let listener = null;
let seq = 0;
const emit = (ev) => listener?.(ev);

/** toast('Saved'), toast('Out of stock', 'error'), tone: success | error | warn | info */
export function toast(message, tone = 'success') {
  emit({ type: 'toast', item: { id: ++seq, message, tone } });
}

/** await ask({ title, message, confirmText, danger }) → true/false */
export function ask(opts) {
  return new Promise((resolve) => emit({ type: 'dialog', item: { ...(typeof opts === 'string' ? { message: opts } : opts), resolve } }));
}

/** await askText({ title, message, type: 'password', minLength }) → string or null */
export function askText(opts) {
  return new Promise((resolve) => emit({ type: 'dialog', item: { ...opts, input: true, resolve } }));
}

const ICONS = { success: CheckCircle2, error: XCircle, warn: AlertTriangle, info: Info };

/** One toast. Success/info fade on their own; errors and warnings stay until dismissed and announce as alerts.
 *  The auto-dismiss timer pauses while the pointer is over the toast or it has keyboard focus. */
function Toast({ t, onClose }) {
  const Icon = ICONS[t.tone] || Info;
  const sticky = t.tone === 'error' || t.tone === 'warn';
  const paused = useRef(false);
  useEffect(() => {
    if (sticky) return undefined;
    let id;
    const arm = () => { id = setTimeout(() => { if (paused.current) arm(); else onClose(); }, 3500); };
    arm();
    return () => clearTimeout(id);
  }, [sticky]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'toast ' + t.tone} role={sticky ? 'alert' : 'status'} aria-live={sticky ? 'assertive' : 'polite'}
      tabIndex={0}
      onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}
      onFocus={() => { paused.current = true; }} onBlur={() => { paused.current = false; }}>
      <Icon size={18} /><span>{t.message}</span>
      <button className="icon-btn" aria-label="Dismiss" onClick={onClose}><X size={16} /></button>
    </div>
  );
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    listener = (ev) => {
      if (ev.type === 'toast') {
        setToasts((t) => [...t.slice(-3), ev.item]); // each toast dismisses itself (errors/warnings stay; see Toast)
      } else {
        setValue('');
        setDialog(ev.item);
      }
    };
    return () => { listener = null; };
  }, []);

  useEffect(() => { if (dialog?.input) setTimeout(() => inputRef.current?.focus(), 30); }, [dialog]);

  const close = (result) => { dialog.resolve(result); setDialog(null); };
  const tooShort = dialog?.input && value.length < (dialog.minLength || 1);

  return (
    <>
      <div className="toasts">
        {toasts.map((t) => <Toast key={t.id} t={t} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />)}
      </div>
      {dialog && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && close(dialog.input ? null : false)}
          onKeyDown={(e) => e.key === 'Escape' && close(dialog.input ? null : false)}>
          <form className="modal dialog" onSubmit={(e) => { e.preventDefault(); if (!tooShort) close(dialog.input ? value : true); }}>
            <div className={'dialog-icon ' + (dialog.danger ? 'danger' : 'info')}>{dialog.danger ? <AlertTriangle size={22} /> : <Info size={22} />}</div>
            <h3>{dialog.title || (dialog.danger ? 'Are you sure?' : 'Please confirm')}</h3>
            {dialog.message && <p className="muted">{dialog.message}</p>}
            {dialog.input && (dialog.type === 'password'
              ? <PasswordInput ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog.placeholder} />
              : <input ref={inputRef} type={dialog.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog.placeholder} />)}
            {dialog.input && dialog.minLength && <small className="muted">At least {dialog.minLength} characters</small>}
            <div className="form-actions">
              <button type="button" className="btn ghost" autoFocus={dialog.danger && !dialog.input} onClick={() => close(dialog.input ? null : false)}>Cancel</button>
              <button className={'btn ' + (dialog.danger ? 'danger-solid' : 'primary')} disabled={tooShort} autoFocus={!dialog.danger && !dialog.input}>{dialog.confirmText || 'Confirm'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
