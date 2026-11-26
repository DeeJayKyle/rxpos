// Settings and This device, laid out as the owner chose from the "app settings" references (2026-11-15): settings in
// labelled groups (an icon, a short name, one line on what it is for, › when it opens a section), a search box that
// finds any setting and takes you to it, quick switches for the common on / off settings, the rarely changed ones
// behind "Advanced", and a red Danger zone whose actions need a warning screen and a second confirmation.
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, ChevronRight, AlertTriangle, X } from 'lucide-react';
import { ask } from '../feedback.jsx';

/** Every setting the search finds: [label, what it is for, page, section] */
export const SETTINGS_INDEX = [
  ['Pharmacy name', 'Shown on receipts', '/settings', 'general'], ['Phone', 'Pharmacy phone number', '/settings', 'general'], ['Address', 'Pharmacy address', '/settings', 'general'],
  ['NDA licence / registration no.', 'Licence number on receipts', '/settings', 'general'], ['TIN', 'Tax number', '/settings', 'general'], ['Currency', 'UGX, KES, $…', '/settings', 'general'],
  ['Decimal places', 'Rounding of amounts', '/settings', 'general'], ['Tax / VAT rate', 'Standard VAT rate; VAT category per medicine', '/settings', 'general'],
  ['Default retail markup', 'Suggested retail prices', '/settings', 'general'], ['Default wholesale markup', 'Suggested wholesale prices', '/settings', 'general'],
  ['Target margin', 'Lower margins are flagged', '/settings', 'general'], ['Round worked-out prices', 'Round prices up', '/settings', 'general'],
  ['Non-cash sales go to', 'Bank for mobile money and card sales', '/settings', 'general'], ['This device works as branch', 'Which branch this device sells for', '/settings', 'general'],
  ['Payment methods at the POS', 'Cash, mobile money, card, insurance', '/settings', 'payments'],
  ['Receipt printer paper', '80 mm, 58 mm or A4', '/settings', 'receipts'], ['Print the receipt automatically', 'After each sale', '/settings', 'receipts'],
  ['Blind cash-up', 'Count the cash before seeing the total', '/settings', 'receipts'], ['Receipt footer message', 'Text at the bottom of receipts', '/settings', 'receipts'],
  ['Add Stock receives medicines with packs in', 'Packs or single units', '/settings', 'receipts'], ['Retail till sells in', 'Units or packs', '/settings', 'receipts'],
  ['Wholesale till sells in', 'Packs or units', '/settings', 'receipts'], ['Warn about expiry', 'Days before expiry', '/settings', 'receipts'],
  ['Supplier lead time', 'Reordering', '/settings', 'receipts'], ['Reorder enough stock for', 'Reordering', '/settings', 'receipts'], ['Dead stock after no sales for', 'Slow movers', '/settings', 'receipts'],
  ['Set reorder levels automatically', 'Every week from sales', '/settings', 'receipts'], ['Safety stock', 'Extra days of sales', '/settings', 'receipts'],
  ['Refill reminder', 'WhatsApp / SMS text', '/settings', 'messages'], ['Payment reminder', 'WhatsApp / SMS text', '/settings', 'messages'],
  ["Administrator's WhatsApp", 'Password recovery', '/settings', 'messages'], ['Client details at the POS', 'Off, optional or required', '/settings', 'messages'],
  ['Daily summary for the owner', 'Emailed every evening', '/settings', 'alerts'], ['Scheduled report emails', 'Reports by email', '/settings', 'alerts'],
  ['Show product promotions after the app is idle', 'Shop window', '/settings', 'alerts'], ['Hourly time reminder', "With today's to-dos", '/settings', 'alerts'],
  ['Daily greeting', 'Health tips to the team', '/settings', 'alerts'], ['Quiet from', 'No pop-ups at night', '/settings', 'alerts'],
  ['Weather location', 'Where the weather comes from', '/settings', 'alerts'], ['Storage limits', 'Fridge and room temperatures', '/settings', 'alerts'],
  ['Online sync', 'Cloud status', '/settings', 'online'], ['Mobile Money & SMS', 'Payments and messages', '/settings', 'online'],
  ['Backup', 'Download a copy of the pharmacy', '/settings', 'backup'], ['Daily stock sheet', 'Google Sheets', '/settings', 'backup'], ['App version', 'Updates', '/settings', 'backup'],
  ['Restore default settings', 'Danger zone', '/settings', 'danger'],
  ['Screen', 'Phone or desktop view, text size', '/device', 'Screen'], ['Text and button size', 'Zoom', '/device', 'Screen'], ['Rotation', 'Upright or sideways', '/device', 'Screen'],
  ['Navigation', 'Sidebar or top bar', '/device', 'Navigation'], ['Dates', 'Date format', '/device', 'Dates'], ['Notification sounds', 'Tones and volume', '/device', 'Notification sounds'],
  ['When RxPOS is in the background', 'Desktop notifications, badges', '/device', 'When RxPOS is in the background'], ['Sync & storage', 'What is saved on this device', '/device', 'Sync & storage'],
  ['Keyboard', 'Shortcuts', '/device', 'Keyboard'], ['AI System Doctor', 'Check this device', '/device', 'AI System Doctor'],
];

/** Scroll to a setting named in location.state.find and flash it */
export function useFindSetting(ready = true) {
  const location = useLocation();
  const find = location.state?.find;
  useEffect(() => {
    if (!find || !ready) return;
    const t = setTimeout(() => {
      const el = [...document.querySelectorAll('.page h3, .page .field > span, .page .settings-row strong')].find((x) => x.textContent.toLowerCase().includes(find.toLowerCase()));
      const box = el?.closest('.field, .card, section') || el;
      if (!box) return;
      box.closest('details')?.setAttribute('open', '');
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.classList.add('flash');
      setTimeout(() => box.classList.remove('flash'), 2200);
    }, 250);
    return () => clearTimeout(t);
  }, [find, ready, location.key]);
}

/** Search box over every setting */
export function SettingsSearch({ can = () => true }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const hits = useMemo(() => {
    const w = q.trim().toLowerCase();
    if (!w) return [];
    return SETTINGS_INDEX.filter(([l, d, path]) => (path !== '/settings' || can('settings.manage')) && (l + ' ' + d).toLowerCase().includes(w)).slice(0, 8);
  }, [q, can]);
  const go = ([label, , path, sec]) => { setQ(''); navigate(path, { state: { tab: path === '/settings' ? sec : undefined, find: sec === 'danger' ? 'Danger zone' : label } }); };
  return (
    <div className="settings-search">
      <Search size={16} aria-hidden="true" />
      <input type="search" placeholder="Search settings" aria-label="Search settings" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0]); if (e.key === 'Escape') setQ(''); }} />
      {q && (
        <ul className="settings-hits" role="listbox">
          {hits.map((h) => <li key={h[0] + h[2]} role="option" aria-selected="false"><button type="button" onClick={() => go(h)}><strong>{h[0]}</strong><small>{h[1]} · {h[2] === '/device' ? 'This device' : 'Settings'}</small></button></li>)}
          {!hits.length && <li className="muted small p-3">No setting matches “{q}”</li>}
        </ul>
      )}
    </div>
  );
}

/** One group of rows: a small label above a rounded container */
export function SettingsGroup({ label, children }) {
  return (
    <div className="settings-group">
      {label && <div className="settings-group-label">{label}</div>}
      <div className="settings-group-box">{children}</div>
    </div>
  );
}

/** A row that opens a section: icon, name, one line, › (a tab, so the keyboard and screen readers know it) */
export function SettingsRow({ icon: Icon, label, desc, active, onClick, tab = true }) {
  return (
    <button type="button" aria-current={active ? 'page' : undefined} className={'settings-row' + (tab ? ' tab' : '') + (active ? ' active' : '')} onClick={onClick}>
      {Icon && <span className="settings-icon"><Icon size={17} /></span>}
      <span className="settings-text"><strong>{label}</strong>{desc && <small>{desc}</small>}</span>
      <ChevronRight size={16} className="settings-chevron" aria-hidden="true" />
    </button>
  );
}

/** A switch row that saves at once */
export function ToggleRow({ icon: Icon, label, desc, checked, onChange, disabled }) {
  return (
    <label className="settings-row toggle">
      {Icon && <span className="settings-icon"><Icon size={17} /></span>}
      <span className="settings-text"><strong>{label}</strong>{desc && <small>{desc}</small>}</span>
      <input type="checkbox" className="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Danger zone: actions that are hard to undo. Each opens a warning screen, then asks once more. */
export function DangerZone({ actions }) {
  const [open, setOpen] = useState(null);
  const list = actions.filter(Boolean);
  if (!list.length) return null;
  return (
    <section className="danger-zone-box" aria-label="Danger zone">
      <div className="settings-group-label danger">Danger zone</div>
      <div className="settings-group-box">
        {list.map((a) => (
          <button key={a.label} type="button" className="settings-row danger" onClick={() => setOpen(a)}>
            <span className="settings-icon"><a.icon size={17} /></span>
            <span className="settings-text"><strong>{a.label}</strong><small>{a.desc}</small></span>
            <ChevronRight size={16} className="settings-chevron" aria-hidden="true" />
          </button>
        ))}
      </div>
      {open && <DangerSheet a={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function DangerSheet({ a, onClose }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const go = async () => {
    onClose(); // the warning screen gives way to the last question
    if (!(await ask({ title: `${a.confirm}?`, message: a.final || 'This can’t be undone.', confirmText: a.confirm, danger: true }))) return;
    await a.run();
  };
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal danger-sheet" role="alertdialog" aria-modal="true" aria-labelledby="danger-title">
        <button type="button" className="icon-btn danger-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="danger-art" aria-hidden="true"><AlertTriangle size={54} /></span>
        <h3 id="danger-title">{a.title}</h3>
        <p className="muted">{a.text}</p>
        <button type="button" className="btn danger-outline" onClick={go}>Yes, {a.confirm.toLowerCase()}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        {a.note && <small className="muted">{a.note}</small>}
      </div>
    </div>
  );
}
