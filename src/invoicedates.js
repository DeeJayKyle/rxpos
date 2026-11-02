// Dates as written on invoices → YYYY-MM-DD, used by the app and the cloud (worker/invoiceread.js). The AI copies
// expiry and invoice dates exactly as written; this turns them into dates (month ends and leap years included).
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
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

