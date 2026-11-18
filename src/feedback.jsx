// App-wide toasts and confirmation dialogs (replace the browser's alert/confirm/prompt, which look dated
// and block the page). Call toast()/ask()/askText() from anywhere; <FeedbackHost/> renders them.
import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { PasswordInput } from './password.jsx';
import { useFocusTrap } from './focustrap.js';

let listener = null;
let seq = 0;
const emit = (ev) => listener?.(ev);

/** toast('Saved'), toast('Out of stock', 'error'), tone: success | error | warn | info;
 *  { action: { label: 'Undo', run } } adds a button (and keeps the toast 6 s) */
export function toast(message, tone = 'success', { action } = {}) {
  emit({ type: 'toast', item: { id: ++seq, message, tone, action } });
}

/** await ask({ title, message, confirmText, cancelText, danger, focusCancel }) → true/false. focusCancel: Cancel has the
 *  focus (as with danger), so an Enter typed or scanned by habit does not confirm. */
export function ask(opts) {
  return new Promise((resolve) => emit({ type: 'dialog', item: { ...(typeof opts === 'string' ? { message: opts } : opts), id: ++seq, resolve } }));
}

/** await askText({ title, message, type: 'password', minLength }) → string or null */
export function askText(opts) {
  return new Promise((resolve) => emit({ type: 'dialog', item: { ...opts, input: true, id: ++seq, resolve } }));
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
    const arm = () => { id = setTimeout(() => { if (paused.current) arm(); else onClose(); }, t.action ? 6000 : 3500); };
    arm();
    return () => clearTimeout(id);
  }, [sticky]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'toast ' + t.tone} role={sticky ? 'alert' : 'status'} aria-live={sticky ? 'assertive' : 'polite'}
      tabIndex={0}
      onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}
      onFocus={() => { paused.current = true; }} onBlur={() => { paused.current = false; }}>
      <Icon size={18} /><span>{t.message}</span>
      {t.action && <button type="button" className="btn sm toast-action" onClick={() => { t.action.run(); onClose(); }}>{t.action.label}</button>}
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
      {dialog && <Dialog key={dialog.id} dialog={dialog} value={value} setValue={setValue} inputRef={inputRef} tooShort={tooShort} close={close} />}
    </>
  );
}

/** The confirm / text box, as a dialog of its own so its focus trap starts and ends with it */
function Dialog({ dialog, value, setValue, inputRef, tooShort, close }) {
  const ref = useRef(null);
  const titleId = useId(), msgId = useId();
  const cancel = () => close(dialog.input ? null : false);
  useFocusTrap(ref, cancel);
  const cancelFirst = (dialog.danger || dialog.focusCancel) && !dialog.input;
  return (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
          <form ref={ref} tabIndex={-1} className="modal dialog" role={dialog.danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={dialog.message ? msgId : undefined}
            onSubmit={(e) => { e.preventDefault(); if (!tooShort) close(dialog.input ? value : true); }}>
            <div className={'dialog-icon ' + (dialog.danger ? 'danger' : 'info')}>{dialog.danger ? <AlertTriangle size={22} /> : <Info size={22} />}</div>
            <h3 id={titleId}>{dialog.title || (dialog.danger ? 'Are you sure?' : 'Please confirm')}</h3>
            {dialog.message && <p className="muted" id={msgId}>{dialog.message}</p>}
            {dialog.input && (dialog.type === 'password'
              ? <PasswordInput ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog.placeholder} />
              : <input ref={inputRef} type={dialog.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog.placeholder} />)}
            {dialog.input && dialog.minLength && <small className="muted">At least {dialog.minLength} characters</small>}
            <div className="form-actions">
              <button type="button" className="btn ghost" autoFocus={cancelFirst} onClick={cancel}>{dialog.cancelText || 'Cancel'}</button>
              <button className={'btn ' + (dialog.danger ? 'danger-solid' : 'primary')} disabled={tooShort} autoFocus={!cancelFirst && !dialog.input}>{dialog.confirmText || 'Confirm'}</button>
            </div>
          </form>
        </div>
  );
}
