// Inputs shared by the stock screens: a date box in the pharmacy's chosen format (This device → Dates) and a medicine
// picker you can type into (in-stock medicines first).
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Plus, Search } from 'lucide-react';
import { deviceSettings, onDevice } from './device.js';
import { formatDate, parseDate, parseExpiry, datePlaceholder } from './dateformat.js';
import { searchProducts } from './search.js';

/** The date format this device uses (re-renders when it changes) */
export function useDateFormat() {
  const [fmt, setFmt] = useState(deviceSettings().dateFormat || 'dmy');
  useEffect(() => onDevice((d) => setFmt(d.dateFormat || 'dmy')), []);
  return fmt;
}

/**
 * A date typed in the chosen format, or picked from the calendar. `value`/`onChange` are YYYY-MM-DD. `monthYear` lets
 * an expiry be typed as 06/2028 (the last day of June 2028).
 */
export function DateInput({ value, onChange, min, max, monthYear = false, ...rest }) {
  const fmt = useDateFormat();
  const [text, setText] = useState(formatDate(value, fmt));
  const [bad, setBad] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => { setText(formatDate(value, fmt)); setBad(false); }, [value, fmt]);
  // an expiry (monthYear) is read whatever its format: 06/2028, JUN 2028, 30/06/2028, 062028… (dateformat.js parseExpiry)
  const read = (t) => (monthYear ? parseExpiry(t, fmt) : parseDate(t, fmt));
  const commit = () => {
    const iso = read(text);
    if (iso === null || (iso && ((min && iso < min) || (max && iso > max)))) { setBad(true); return; }
    setBad(false);
    if (iso !== (value || '')) onChange(iso); else setText(formatDate(value, fmt));
  };
  const why = bad ? (read(text) === null ? (monthYear ? 'Could not read this expiry: try 06/2028, JUN 2028 or 30/06/2028' : `Type the date as ${datePlaceholder(fmt, monthYear)}`) : min && read(text) < min ? 'This date is in the past' : 'This date is in the future') : '';
  return (
    <span className={'date-input' + (bad ? ' bad' : '')}>
      <input {...rest} type="text" inputMode="numeric" value={text} placeholder={datePlaceholder(fmt, monthYear)} title={why || datePlaceholder(fmt, monthYear)}
        onChange={(e) => {
          const t = e.target.value; setText(t); setBad(false);
          // a complete date (4-digit year, or YYYY-MM-DD) is kept at once; anything shorter waits for Enter or leaving the box
          // (an expiry typed as digits only, 30062028, waits too: 300620 could already be read as a date)
          const done = monthYear ? /[^0-9]\d{4}\s*$|^\d{4}-\d{1,2}(-\d{1,2})?$/.test(t.trim()) : /\d{4}\s*$|^\d{4}-\d{1,2}-\d{1,2}$/.test(t.trim());
          const iso = done ? read(t) : null;
          if (iso && ((min && iso < min) || (max && iso > max))) setBad(true); // complete but outside the allowed dates: red at once
          else if (iso && iso !== (value || '')) onChange(iso);
        }} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} aria-invalid={bad || undefined} />
      <button type="button" className="icon-btn sm" tabIndex={-1} disabled={rest.disabled} title="Pick from the calendar" aria-label="Pick from the calendar"
        onClick={() => { try { pickerRef.current?.showPicker(); } catch { pickerRef.current?.focus(); } }}><CalendarDays size={15} /></button>
      <input ref={pickerRef} type="date" className="date-native" tabIndex={-1} aria-hidden="true" value={value || ''} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
      {bad && <small className="date-why text-danger">{why}</small>}
    </span>
  );
}

/**
 * Choose a medicine by typing: name, generic or barcode, every word; medicines in stock come first, with their stock.
 * `extra` adds rows above the results (e.g. "New medicine"). Calls onPick(id).
 */
export function MedicinePicker({ products, value, onPick, placeholder = 'Search medicine…', onNew, newLabel }) {
  const current = value ? products.find((p) => p.id === value) : null;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState(null);
  const box = useRef(null);
  const list = useMemo(() => {
    if (!open) return [];
    const found = q.trim() ? searchProducts(products, q) : products;
    // in stock first, then the rest; each group keeps the search ranking (or A–Z when nothing is typed)
    const inStock = [], rest = [];
    for (const p of found) ((p.stock > 0 || p.totalStock > 0) ? inStock : rest).push(p);
    const sort = (a) => (q.trim() ? a : a.slice().sort((x, y) => x.name.localeCompare(y.name)));
    return [...sort(inStock), ...sort(rest)].slice(0, 60);
  }, [open, q, products]);
  const rows = [...list.map((p) => ({ p })), ...(onNew ? [{ add: true }] : [])];
  useEffect(() => setHi(0), [q]);
  const place = () => { const r = box.current?.getBoundingClientRect(); if (r) setPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 340) }); };
  useEffect(() => {
    if (!open) return undefined;
    place();
    const close = (e) => { if (!box.current?.contains(e.target) && !e.target.closest?.('.med-pick-list')) setOpen(false); };
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place); document.addEventListener('mousedown', close);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('mousedown', close); };
  }, [open]);
  const choose = (row) => { if (!row) return; setOpen(false); setQ(''); if (row.add) onNew(q.trim()); else onPick(row.p.id); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { if (open && rows.length) { e.preventDefault(); choose(rows[hi]); } }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="med-pick" ref={box}>
      <Search size={14} className="med-pick-icon" aria-hidden="true" />
      <input role="combobox" aria-expanded={open} aria-autocomplete="list" aria-label="Medicine" placeholder={current ? current.name : placeholder}
        value={open ? q : current ? current.name : ''} onFocus={() => { setOpen(true); setQ(''); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={key} />
      {open && pos && (
        <div className="med-pick-list" role="listbox" style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width }}>
          {rows.map((r, i) => r.add ? (
            <button type="button" key="add" role="option" aria-selected={i === hi} className={'med-pick-row add' + (i === hi ? ' hi' : '')} onMouseDown={(e) => { e.preventDefault(); choose(r); }}>
              <Plus size={14} /> {newLabel ? newLabel(q.trim()) : `New medicine${q.trim() ? `: “${q.trim()}”` : ''}`}
            </button>
          ) : (
            <button type="button" key={r.p.id} role="option" aria-selected={i === hi} className={'med-pick-row' + (i === hi ? ' hi' : '') + (r.p.id === value ? ' on' : '')} onMouseDown={(e) => { e.preventDefault(); choose(r); }}>
              <span>{r.p.name}{r.p.generic ? <small className="muted"> · {r.p.generic}</small> : null}</span>
              <small className={r.p.stock > 0 ? 'stock-in' : 'muted'}>{r.p.stock > 0 ? `${r.p.stock} in stock` : 'none in stock'}</small>
            </button>
          ))}
          {!list.length && <div className="med-pick-empty muted small">No medicine matches “{q}”.</div>}
        </div>
      )}
    </div>
  );
}
