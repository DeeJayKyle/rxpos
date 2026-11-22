// Dates as written on invoices → YYYY-MM-DD, used by the app and the cloud (worker/invoiceread.js). The AI copies
// expiry and invoice dates exactly as written; this turns them into dates (a month alone: the 30th, the 28th in February).
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
// an expiry written as a month and year (06/2028, Jun-28) is taken as the 30th of that month, the 28th in February
// (the owner's rule, 2026-11-20: never later than the month's end, the same day every month)
const lastDay = (y, m) => `${y}-${String(m).padStart(2, '0')}-${m === 2 ? 28 : 30}`;
const year4 = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));
/** Expiry / invoice dates as written on invoices → YYYY-MM-DD ('' when it can't be read) */
export function normDate(v, { endOfMonth = true } = {}) {
  const s = String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[/.-](\d{1,2})$/); // 2028-06
  if (m) return endOfMonth ? lastDay(+m[1], +m[2]) : `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/yyyy
  if (m) return `${year4(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{2,4})$/); // mm/yyyy or mm/yy
  if (m && +m[1] >= 1 && +m[1] <= 12) return lastDay(year4(m[2]), +m[1]);
  m = s.match(/^(?:(\d{1,2})[ /.-]?)?([a-z]{3,9})[ /.,-]*(\d{2,4})$/); // 30 Jun 2028, Jun-28, June 2028
  if (m && (MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)])) {
    const mo = MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)];
    return m[1] ? `${year4(m[3])}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}` : lastDay(year4(m[3]), mo);
  }
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}


/** Days a delivery date lies before [todayStr] when that is more than [days] (0 otherwise, or for an unreadable date).
 * A wrong date (often read off a scanned invoice) files the delivery away from today's in Purchase history and
 * the day's reports, so Add Stock asks before receiving with it (2026-11-22). */
export const OLD_DELIVERY_DAYS = 3;
export function oldDeliveryDays(date, todayStr, days = OLD_DELIVERY_DAYS) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(date || '')) || !re.test(String(todayStr || ''))) return 0;
  const n = Math.round((Date.parse(todayStr) - Date.parse(date)) / 864e5);
  return n > days ? n : 0;
}
