// Scheduled email reports (Payroll & HR's sibling from the POScream comparison): a pharmacy keeps report schedules
// (table `reportSchedules`, changed only by people who manage settings). Every evening at 21:00 Uganda time the cloud
// sends each schedule that is due an email with an Excel workbook attached: daily (that day), weekly (on Sundays: the
// last 7 days) or monthly (on the last day: the month). Sheets: summary, sales, sales by medicine, expenses, and stock
// that needs attention. Sent through Brevo like the daily summary. The workbook is written here, with no dependency.
import { eatDay, summarise, attention } from './summary.js';

export const REPORT_KINDS = ['summary', 'sales', 'items', 'expenses', 'stock'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The period a schedule covers when it runs at [now], or null when it is not due today. */
export function periodFor(frequency, now = new Date()) {
  const { day, startIso, endIso } = eatDay(now);
  const d = new Date(day + 'T00:00:00Z');
  const back = (n) => new Date(d.getTime() - n * 864e5);
  if (frequency === 'weekly') {
    if (d.getUTCDay() !== 0) return null; // Sundays
    const from = back(6).toISOString().slice(0, 10);
    return { from, to: day, startIso: new Date(Date.parse(startIso) - 6 * 864e5).toISOString(), endIso, label: `week ${from} to ${day}` };
  }
  if (frequency === 'monthly') {
    if (new Date(d.getTime() + 864e5).getUTCDate() !== 1) return null; // the last day of the month
    const from = day.slice(0, 8) + '01';
    return { from, to: day, startIso: new Date(Date.parse(from + 'T00:00:00Z') - 3 * 3600e3).toISOString(), endIso, label: day.slice(0, 7) };
  }
  return { from: day, to: day, startIso, endIso, label: day };
}

/** "Send now": the schedule's period up to today (today; the last 7 days; the month so far). */
export function periodToDate(frequency, now = new Date()) {
  const { day, startIso, endIso } = eatDay(now);
  const days = frequency === 'weekly' ? 6 : frequency === 'monthly' ? Number(day.slice(8)) - 1 : 0;
  const from = new Date(Date.parse(day + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10);
  const label = frequency === 'weekly' ? `last 7 days to ${day}` : frequency === 'monthly' ? `${day.slice(0, 7)} to date` : day;
  return { from, to: day, startIso: new Date(Date.parse(startIso) - days * 864e5).toISOString(), endIso, label };
}

// ---------- the workbook ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A zip archive of [files] ({name: text}), stored without compression (every spreadsheet program reads it). */
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, s]) => (s === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true)));
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2],
      [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, s]) => (s === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    parts.push(new Uint8Array(head.buffer), n, data);
    central.push(new Uint8Array(cen.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  const count = Object.keys(files).length;
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, count, 2], [10, count, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]].forEach(([o, v, s]) => (s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const col = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** An .xlsx workbook: [sheets] is [{ name, rows: [{column: value}] }]; bold frozen header, filters, numbers as numbers. */
export function xlsx(sheets) {
  const sheetXml = ({ rows }) => {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const cell = (ref, v, head) => {
      if (v === null || v === undefined || v === '') return '';
      if (!head && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="2"><v>${v}</v></c>`;
      const text = /^[=+\-@]/.test(String(v)) && !head ? "'" + v : String(v); // never a formula
      return `<c r="${ref}" t="inlineStr"${head ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
    };
    const width = keys.map((k) => Math.min(60, Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)) + 3));
    const body = [`<row r="1">${keys.map((k, c) => cell(col(c) + 1, k, true)).join('')}</row>`,
      ...rows.map((r, i) => `<row r="${i + 2}">${keys.map((k, c) => cell(col(c) + (i + 2), r[k], false)).join('')}</row>`)].join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (keys.length ? `<cols>${width.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '') +
      `<sheetData>${body}</sheetData>${keys.length ? `<autoFilter ref="A1:${col(keys.length - 1)}${rows.length + 1}"/>` : ''}</worksheet>`;
  };
  const names = sheets.map((s, i) => esc(String(s.name).replace(/[[\]*?/\\:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`));
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F1EA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });
  return zip(files);
}

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const n = (v) => Number(v) || 0;

/** The sheets of a report from the period's records (pure: also used by the tests). */
export function reportSheets({ kinds, sales, expenses, categories = [], branches = [], attention: att = { expiring: [], low: [] }, label }) {
  const want = new Set(kinds?.length ? kinds : REPORT_KINDS);
  const f = summarise({ sales, expenses, branches });
  const branch = (id) => branches.find((b) => b.id === id)?.name || (!id || id === 'main' ? 'Main branch' : id);
  const cat = (id) => categories.find((c) => c.id === id)?.name || 'Expense';
  const out = [];
  if (want.has('summary')) {
    out.push({ name: 'Summary', rows: [
      { figure: 'Period', value: label }, { figure: 'Sales', value: f.total }, { figure: 'Number of sales', value: f.count },
      ...f.byPay.map(([k, v]) => ({ figure: `  paid by ${k}`, value: v })), { figure: 'On credit', value: f.credit },
      { figure: 'Discounts', value: f.discounts }, { figure: 'Refunds', value: f.refundValue }, { figure: 'Tax', value: f.tax },
      { figure: 'Cost of medicines sold', value: f.cost }, { figure: 'Gross profit', value: f.profit }, { figure: 'Expenses', value: f.expenses },
      { figure: 'Net', value: f.net }, ...f.byBranch.map(([k, v]) => ({ figure: `Sales at ${k}`, value: v })),
    ] });
  }
  if (want.has('sales')) {
    out.push({ name: 'Sales', rows: [...sales].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((s) => ({
      date: String(s.date || '').replace('T', ' ').slice(0, 16), number: s.number || '', customer: s.customerName || '', cashier: s.cashier || '', branch: branch(s.branchId),
      payment: s.payment || 'Cash', items: (s.items || []).length, discount: n(s.discount), total: n(s.total), paid: n(s.paid ?? s.total), status: s.status || 'completed',
    })) });
  }
  if (want.has('items')) {
    const by = new Map();
    for (const s of sales) if (s.status !== 'refunded') for (const i of s.items || []) {
      const r = by.get(i.name) || { medicine: i.name, quantity: 0, sales: 0, cost: 0 };
      r.quantity += n(i.qty); r.sales += n(i.qty) * n(i.price); r.cost += n(i.qty) * n(i.cost); by.set(i.name, r);
    }
    out.push({ name: 'Sales by medicine', rows: [...by.values()].sort((a, b) => b.sales - a.sales).map((r) => ({ ...r, profit: r.sales - r.cost })) });
  }
  if (want.has('expenses')) {
    out.push({ name: 'Expenses', rows: [...expenses].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => ({
      date: String(e.date || '').slice(0, 10), category: cat(e.categoryId), description: e.description || '', paidTo: e.payee || '', method: e.method || '', amount: n(e.amount),
    })) });
  }
  if (want.has('stock')) {
    out.push({ name: 'Expiring', rows: att.expiring });
    out.push({ name: 'Low stock', rows: att.low });
  }
  return { sheets: out.map((x) => (x.rows.length ? x : { ...x, rows: [{ note: 'None in this period' }] })), figures: f };
}

/** Send every report schedule that is due (or just [scheduleId] of [tenantId], now, whatever its frequency). */
export async function scheduledReports(env, { now = new Date(), dry = false, tenantId = null, scheduleId = null } = {}) {
  const db = env.DB;
  const tenants = (await db.prepare("SELECT id, name FROM tenants WHERE status IS NULL OR status = 'active'").all()).results.filter((t) => !tenantId || t.id === tenantId);
  const out = [];
  for (const t of tenants) {
    const rows = async (sql, ...args) => (await db.prepare(sql).bind(t.id, ...args).all()).results.map((r) => JSON.parse(r.rec || 'null')).filter(Boolean);
    const schedules = (await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'reportSchedules' AND deleted = 0"))
      .filter((s) => (scheduleId ? s.id === scheduleId : s.active !== false));
    if (!schedules.length) continue;
    const settings = (await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'settings' AND id = 'settings' AND deleted = 0"))[0] || {};
    const name = settings.name || t.name;
    for (const s of schedules) {
      const p = scheduleId ? periodToDate(s.frequency, now) : periodFor(s.frequency, now);
      if (!p) continue;
      const to = String(s.emails || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => EMAIL.test(x)).slice(0, 10);
      const kinds = (Array.isArray(s.reports) ? s.reports : []).filter((k) => REPORT_KINDS.includes(k));
      const sales = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'sales' AND deleted = 0 AND json_extract(rec, '$.date') >= ?2 AND json_extract(rec, '$.date') < ?3", p.startIso, p.endIso);
      const expenses = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'expenses' AND deleted = 0 AND substr(json_extract(rec, '$.date'), 1, 10) BETWEEN ?2 AND ?3", p.from, p.to);
      const categories = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'expenseCategories' AND deleted = 0");
      const branches = await rows("SELECT rec FROM records WHERE tenant = ?1 AND t = 'branches' AND deleted = 0");
      const att = !kinds.length || kinds.includes('stock') ? await attention(db, t.id, p.to) : undefined;
      const { sheets, figures } = reportSheets({ kinds, sales, expenses, categories, branches, attention: att, label: p.label });
      const file = `${name.replace(/[^\w -]+/g, '').trim() || 'RxPOS'} ${s.name || 'report'} ${p.label}.xlsx`.replace(/\s+/g, ' ');
      const money = (v) => `${settings.currency || 'UGX'} ${Math.round(n(v)).toLocaleString('en-US')}`;
      const text = [`${name}: ${s.name || 'report'} for ${p.label}`, '', `Sales: ${money(figures.total)} (${figures.count})`, `Gross profit: ${money(figures.profit)}`,
        `Expenses: ${money(figures.expenses)}`, `Net: ${money(figures.net)}`, '', `The full report is in the attached workbook (${sheets.map((x) => x.name).join(', ')}).`, '', '— RxPOS'].join('\n');
      let sent = 0, error = to.length ? '' : 'no email addresses';
      if (!dry && to.length) {
        if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) error = 'email not set up';
        else {
          const content = b64(xlsx(sheets));
          const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'RxPOS' }, to: to.map((email) => ({ email })),
              subject: `${name}: ${s.name || 'report'} (${p.label})`, textContent: text, attachment: [{ name: file, content }] }),
          }).catch((e) => ({ ok: false, status: e.message }));
          if (r.ok) sent = to.length; else error = 'Brevo ' + r.status;
        }
      }
      out.push({ tenant: t.id, schedule: s.id, period: p.label, to, sent, error, file, sheets: sheets.map((x) => ({ name: x.name, rows: x.rows.length })) });
    }
  }
  return out;
}
