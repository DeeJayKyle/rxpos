// Forms, UI batch 3 (D). The Flutter app has the same in rxpos_flutter/lib/core/presentation/form_kit.dart.
//   MoneyInput  D5: "UGX" in front and thousand commas while typing; the value stays a number
//   PhoneInput  D6: 0772 123 456 as it is typed, a tick when it can take WhatsApp / SMS (normalizePhone)
//   Help        D3: a small (?) beside a tricky field with a one-sentence popover
//   checkField  D1: the checks a field gets when it is left (and on typing after its first error)
import { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle, Check } from 'lucide-react';
import { normalizePhone } from './store.jsx';

/** 1234567.5 → "1,234,567.5" while typing (the decimals typed are kept as typed) */
export function groupDigits(text) {
  const s = String(text ?? '').replace(/[^\d.]/g, '');
  const [int, ...dec] = s.split('.');
  const g = (int || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec.length ? `${g || '0'}.${dec.join('').slice(0, 2)}` : g;
}
export const moneyValue = (text) => { const n = Number(String(text ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };

/** D5: an amount: the currency in front, commas as it is typed, onChange gets a number (or '' when empty) */
export function MoneyInput({ value, onChange, currency = '', id, className = '', inputRef, ...rest }) {
  const [text, setText] = useState(() => (value === '' || value == null ? '' : groupDigits(String(value))));
  const last = useRef(value);
  // a value changed from outside (a preset, a reset) shows as it is
  useEffect(() => { if (value !== last.current) { last.current = value; setText(value === '' || value == null ? '' : groupDigits(String(value))); } }, [value]);
  return (
    <span className={'money-input ' + className}>
      {currency && <span className="money-cur" aria-hidden="true">{currency}</span>}
      <input {...rest} ref={inputRef} id={id} type="text" inputMode="decimal" autoComplete="off" value={text}
        onChange={(e) => { const t = groupDigits(e.target.value); setText(t); const v = t === '' ? '' : moneyValue(t); last.current = v; onChange(v); }} />
    </span>
  );
}

/** "0772123456" → "0772 123 456"; "+256772123456" → "+256 772 123 456" */
export function formatPhone(text) {
  const s = String(text ?? '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (s.startsWith('+')) { const d = s.slice(1); return ('+' + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join(' ')).trim(); }
  return [s.slice(0, 4), s.slice(4, 7), s.slice(7)].filter(Boolean).join(' ');
}
/** A phone that can take WhatsApp / SMS: normalizes to a full international number */
export const phoneOk = (text) => { const n = normalizePhone(text).replace(/\D/g, ''); return n.startsWith('256') ? n.length === 12 : n.length >= 11 && n.length <= 15; };

/** D6: a phone number formatted as it is typed, with a tick once it can take WhatsApp / SMS */
export function PhoneInput({ value, onChange, id, className = '', ...rest }) {
  const ok = !!value && phoneOk(value);
  return (
    <span className={'phone-input ' + className}>
      <input {...rest} id={id} type="tel" inputMode="tel" autoComplete="tel" value={formatPhone(value)} onChange={(e) => onChange(formatPhone(e.target.value))} />
      {ok && <span className="phone-ok" title="Can take WhatsApp and SMS" aria-label="Valid for WhatsApp and SMS"><Check size={14} /></span>}
    </span>
  );
}

/** D3: a (?) with a one-sentence explanation, shown on hover, focus or tap */
export function Help({ text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="help-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="help-btn" aria-label="What is this?" aria-describedby={open ? id : undefined} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}><HelpCircle size={14} /></button>
      {open && <span role="tooltip" id={id} className="help-pop">{text}</span>}
    </span>
  );
}

/** The help sentences of the tricky settings and fields (D3), one place for both apps' wording */
export const HELP = {
  reorder: 'When stock falls to this number, the medicine shows as low and goes on the reorder list.',
  fefo: 'First expiry, first out: the till sells the batch that expires soonest, so older stock goes before it expires.',
  blind: 'The cashier counts the cash without seeing what the till expects, so the count is honest; the difference shows after.',
  wholesale: 'The price for wholesale customers (clinics, other pharmacies); the wholesale till uses it instead of the retail price.',
  tax: 'VAT added to (or included in) sales. Leave 0 if the pharmacy does not charge VAT.',
  credit: 'The most this client may owe. A sale on credit that would go over it needs a manager.',
  markup: 'Added to the cost to suggest a selling price when stock is received.',
  expiryWarn: 'How many days before expiry a batch shows as expiring soon.',
  refundApprove: 'Refunds above this amount need a manager’s PIN or password, unless a manager does the refund.',
};

/** D1: the message for a field's value, or '' when it is fine. f: { label, required, type, min, validate(value, rec) } */
export function checkField(f, value, rec = {}) {
  const empty = value === '' || value == null || (typeof value === 'string' && !value.trim());
  if (f.required && empty) return `${f.label} is needed`;
  if (empty) return '';
  if ((f.type === 'number' || f.type === 'money') && (!isFinite(Number(String(value).replace(/,/g, ''))) || Number(String(value).replace(/,/g, '')) < (f.min ?? 0))) return `${f.label} must be ${f.min ?? 0} or more`;
  if (f.type === 'phone' && !phoneOk(value)) return 'Not a full phone number (e.g. 0772 123 456)';
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) return 'Not an email address';
  return f.validate?.(value, rec) || '';
}
