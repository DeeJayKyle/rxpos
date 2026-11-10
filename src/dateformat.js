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

// An expiry as printed on packs and invoices, whatever its format (workplan follow-up, owner's request 2026-11-10):
// 06/2028, 6/28, 2028-06, JUN 2028, 30-JUN-2028, 30/06/2028 or 06/30/2028, 062028, 300628, 20280630, "EXP: 06/28".
// Day and month are told apart when one of them is above 12; when both could be either, the device's date format
// decides. Month and year only means the last day of that month. Same rules in Dart (rxpos_flutter
// lib/features/stock/domain/stock_form.dart parseExpiry); both are checked against tests/expiry-cases.json.
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
const monthOf = (w) => MONTHS[w] || MONTHS[w.slice(0, 3)] || null;
const okExpiry = (y, m, d) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
const iso = (y, m, d) => (okExpiry(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null);
const endOf = (y, m) => (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? iso(y, m, lastDay(y, m)) : null);
/** Day, month, year from three numbers in the order written, the year last: told apart when one is above 12 */
const dmyOrMdy = (a, b, y, fmt) => (a > 12 && b <= 12 ? iso(y, b, a) : b > 12 && a <= 12 ? iso(y, a, b) : fmt === 'mdy' ? iso(y, a, b) : iso(y, b, a));

/** An expiry as typed or printed → YYYY-MM-DD, '' for an empty box, null when it can't be read */
export function parseExpiry(text, fmt = 'dmy') {
  let s = String(text || '').trim().toUpperCase().replace(/^(EXP(IRY)?(\s*DATE)?|USE\s*BY|BEST\s*BEFORE|BB)\s*[.:-]?\s*/, '').trim();
  if (!s) return '';
  const words = s.split(/[^A-Z0-9]+/).filter(Boolean);
  if (/[A-Z]/.test(s)) {
    // a month name: JUN 2028, JUN-28, 30 JUN 2028, JUNE 30 2028
    const at = words.findIndex((w) => /^[A-Z]+$/.test(w) && monthOf(w));
    if (at < 0) return null;
    const m = monthOf(words[at]), nums = words.filter((w, i) => i !== at).map((w) => (/^\d+$/.test(w) ? w : null));
    if (nums.some((w) => w === null) || !nums.length || nums.length > 2) return null;
    if (nums.length === 1) return endOf(year4(nums[0]), m);
    const four = nums.findIndex((w) => w.length === 4);
    const [d, y] = four === 0 ? [nums[1], nums[0]] : [nums[0], nums[1]];
    return iso(year4(y), m, Number(d));
  }
  const n = words.map(Number);
  if (words.length === 3) return words[0].length === 4 ? iso(n[0], n[1], n[2]) : dmyOrMdy(n[0], n[1], year4(words[2]), fmt);
  if (words.length === 2) {
    if (words[0].length === 4) return endOf(n[0], n[1]);
    if (words[1].length === 4) return endOf(n[1], n[0]);
    return n[0] <= 12 ? endOf(year4(words[1]), n[0]) : n[1] <= 12 ? endOf(year4(words[0]), n[1]) : null;
  }
  if (words.length !== 1) return null;
  const t = words[0], two = (i) => Number(t.slice(i, i + 2)), four = (i) => Number(t.slice(i, i + 4));
  if (t.length === 8) return (/^20/.test(t) && iso(four(0), two(4), two(6))) || dmyOrMdy(two(0), two(2), four(4), fmt);
  if (t.length === 6) return (two(0) >= 1 && two(0) <= 12 && four(2) >= 2000 ? endOf(four(2), two(0)) : null)
    || (four(0) >= 2000 && two(4) >= 1 && two(4) <= 12 ? endOf(four(0), two(4)) : null)
    || dmyOrMdy(two(0), two(2), 2000 + two(4), fmt);
  if (t.length === 4) return two(0) >= 1 && two(0) <= 12 ? endOf(2000 + two(2), two(0)) : null;
  return null;
}
