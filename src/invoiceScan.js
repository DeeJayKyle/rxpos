// Scanning a supplier invoice into Add Stock: photo or PDF → pages as images → AI reads each page (Workers AI,
// Mistral Small 3.1) → lines matched to this pharmacy's medicines. Nothing is saved until the person checks it.
import { aiInvoice } from './cloud.js';
import { shrinkPhoto } from './pages/Scan.jsx';

const MAX_PAGES = 4;

/** PDF → one JPEG per page (first few pages), using pdf.js (Apache-2.0), loaded only when needed */
async function pdfPages(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, 1800 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(await shrinkPhoto(canvas.toDataURL('image/jpeg', 0.92), 1600));
  }
  return { pages: out, total: pdf.numPages };
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('That file could not be opened')); r.readAsDataURL(file); });

/** A chosen file (photo or PDF) → page images ready to read */
export async function invoicePages(file) {
  if (!file) return { pages: [], total: 0 };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfPages(file);
  if (!/^image\//.test(file.type)) throw new Error('Choose a photo (JPG / PNG) or a PDF of the invoice');
  return { pages: [await shrinkPhoto(await readAsDataUrl(file), 1600)], total: 1 };
}

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

const STOP = new Set(['tablet', 'tablets', 'tabs', 'tab', 'capsule', 'capsules', 'caps', 'cap', 'syrup', 'suspension', 'susp', 'cream', 'injection', 'inj', 'drops', 'the', 'and', 'with', 'for', 'pack', 'pcs', 'box', 'bottle', 'btl']);
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));
const strengths = (s) => (String(s || '').toLowerCase().match(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)/g) || []).map((x) => x.replace(/\s+/g, ''));

/** Best match for a name read off an invoice among this pharmacy's medicines (null when nothing is close) */
export function matchProduct(name, products) {
  const want = tokens(name);
  if (!want.length) return null;
  const wantStr = strengths(name);
  let best = null;
  for (const p of products) {
    const have = new Set(tokens(`${p.name} ${p.generic || ''}`));
    const words = want.filter((w) => !/^\d/.test(w));
    if (!words.length) continue;
    const hit = words.filter((w) => have.has(w) || [...have].some((h) => h.length >= 5 && (h.startsWith(w) || w.startsWith(h)))).length / words.length;
    if (hit < 0.5) continue;
    const pStr = strengths(p.name);
    const strengthOk = !wantStr.length || !pStr.length || wantStr.some((x) => pStr.includes(x));
    const score = hit + (strengthOk ? 0.3 : -0.6) + (tokens(p.name)[0] === want[0] ? 0.2 : 0) + (p.stock > 0 ? 0.05 : 0);
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= 0.75 ? best.p : null;
}

/** Supplier named on the invoice → one of the pharmacy's suppliers (or null) */
export function matchSupplier(name, suppliers) {
  const want = tokens(name).filter((w) => !['ltd', 'limited', 'co', 'company', 'u', 'uganda', 'pharma', 'pharmaceuticals', 'pharmacy'].includes(w));
  if (!want.length) return null;
  let best = null;
  for (const s of suppliers) {
    const have = new Set(tokens(s.name));
    const score = want.filter((w) => have.has(w)).length / want.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { s, score };
  }
  return best?.s || null;
}

/** Read every page and merge them into one invoice */
export async function readInvoice(cfg, pages, onPage) {
  const merged = { supplier: '', invoiceNo: '', date: '', total: 0, items: [] };
  for (let i = 0; i < pages.length; i++) {
    onPage?.(i + 1, pages.length);
    const r = await aiInvoice(cfg, pages[i]);
    merged.supplier ||= r.supplier; merged.invoiceNo ||= r.invoiceNo; merged.date ||= r.date; merged.total ||= r.total;
    merged.items.push(...(r.items || []));
  }
  return merged;
}
