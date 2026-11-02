// Typing and showing dates the way the pharmacy writes them (This device → Dates, or the link in Add Stock):
// DD/MM/YYYY (Uganda, default), MM/DD/YYYY or YYYY-MM-DD. Stored dates are always YYYY-MM-DD. An expiry may be typed
// with month and year only (06/2028, 6/28) and means the last day of that month, as printed on packs.
export const DATE_FORMATS = [['dmy', 'DD/MM/YYYY'], ['mdy', 'MM/DD/YYYY'], ['ymd', 'YYYY-MM-DD']];
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const year4 = (y) => (String(y).length <= 2 ? 2000 + Number(y) : Number(y));
const valid = (y, m, d) => y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);

/** YYYY-MM-DD → as the person reads it ('' stays '') */
export function formatDate(iso, fmt = 'dmy') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const [, y, mo, d] = m;
  return fmt === 'mdy' ? `${mo}/${d}/${y}` : fmt === 'ymd' ? `${y}-${mo}-${d}` : `${d}/${mo}/${y}`;
}

/** What was typed → YYYY-MM-DD, or null when it isn't a date ('' for an empty box). `monthYear` allows 06/2028. */
export function parseDate(text, fmt = 'dmy', { monthYear = false } = {}) {
  const s = String(text || '').trim();
  if (!s) return '';
  const parts = s.split(/[^0-9]+/).filter(Boolean).map(Number);
  let y, m, d;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) [y, m, d] = parts; // ISO is always understood
  else if (parts.length === 3) {
    if (fmt === 'ymd') [y, m, d] = parts;
    else if (fmt === 'mdy') [m, d, y] = parts;
    else [d, m, y] = parts;
    y = year4(y);
  } else if (parts.length === 2 && monthYear) {
    if (fmt === 'ymd' && String(parts[0]).length === 4) [y, m] = parts; else [m, y] = parts;
    y = year4(y); d = valid(y, m, 1) ? lastDay(y, m) : 0;
  } else if (parts.length === 1 && /^\d{6}$|^\d{8}$/.test(s)) { // 06102026 / 061026 typed without separators
    const t = s.length === 8 ? [s.slice(0, 2), s.slice(2, 4), s.slice(4)] : [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
    if (fmt === 'ymd') return parseDate(s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : '', fmt);
    [d, m, y] = fmt === 'mdy' ? [t[1], t[0], t[2]].map(Number) : t.map(Number);
    y = year4(y);
  } else return null;
  return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}
/** The pattern to show in an empty box */
export const datePlaceholder = (fmt = 'dmy', monthYear = false) => (fmt === 'ymd' ? 'yyyy-mm-dd' : fmt === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy') + (monthYear ? (fmt === 'ymd' ? ' or yyyy-mm' : ' or mm/yyyy') : '');
