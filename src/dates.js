// Date helpers, in this device's local time (Uganda is UTC+3, so UTC dates would roll over at 3 am).
// Pure and dependency-free so they can be unit-tested on their own (review Phase 1.8). Re-exported from store.jsx,
// so existing `import { daysUntil, today, ... } from './store.jsx'` keeps working.
const pad2 = (n) => String(n).padStart(2, '0');
/** YYYY-MM-DD of a moment in this device's local time */
export const localDate = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
export const today = () => localDate();
/** The local day a record belongs to: plain dates ("2026-10-15") stay as they are, timestamps are converted */
export const dayOf = (v) => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s ? localDate(s) : ''; };
export const monthOf = (v) => dayOf(v).slice(0, 7);
export const daysUntil = (date) => Math.ceil((new Date(date) - new Date(today())) / 864e5);
export const daysSince = (date) => Math.floor((Date.now() - new Date(date)) / 864e5);
