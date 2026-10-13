// App-wide toasts and confirmation dialogs (replace the browser's alert/confirm/prompt, which look dated
// and block the page). Call toast()/ask()/askText() from anywhere; <FeedbackHost/> renders them.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

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

export function FeedbackHost() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    listener = (ev) => {
      if (ev.type === 'toast') {
        setToasts((t) => [...t.slice(-3), ev.item]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== ev.item.id)), ev.item.tone === 'error' ? 6000 : 3500);
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
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={'toast ' + t.tone}>
              <Icon size={18} /><span>{t.message}</span>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
            </div>
          );
        })}
      </div>
      {dialog && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && close(dialog.input ? null : false)}
          onKeyDown={(e) => e.key === 'Escape' && close(dialog.input ? null : false)}>
          <form className="modal dialog" onSubmit={(e) => { e.preventDefault(); if (!tooShort) close(dialog.input ? value : true); }}>
            <div className={'dialog-icon ' + (dialog.danger ? 'danger' : 'info')}>{dialog.danger ? <AlertTriangle size={22} /> : <Info size={22} />}</div>
            <h3>{dialog.title || (dialog.danger ? 'Are you sure?' : 'Please confirm')}</h3>
            {dialog.message && <p className="muted">{dialog.message}</p>}
            {dialog.input && (
              <input ref={inputRef} type={dialog.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog.placeholder} />
            )}
            {dialog.input && dialog.minLength && <small className="muted">At least {dialog.minLength} characters</small>}
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => close(dialog.input ? null : false)}>Cancel</button>
              <button className={'btn ' + (dialog.danger ? 'danger-solid' : 'primary')} disabled={tooShort} autoFocus={!dialog.input}>{dialog.confirmText || 'Confirm'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
