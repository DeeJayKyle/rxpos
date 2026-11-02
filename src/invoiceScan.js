// Scanning a supplier invoice into Add Stock: photo or PDF → pages as images → two AI models read each page
// independently in the cloud and are cross-checked (worker/invoiceread.js) → lines matched to this pharmacy's medicines
// → a delivery draft that waits for a person to check it. Nothing reaches stock until "Receive stock".
import { aiInvoice } from './cloud.js';
import { shrinkPhoto } from './pages/Scan.jsx';

const MAX_PAGES = 6;
const PAGE_PX = 2000; // small print and handwriting need the detail; the cloud takes pages up to 2 MB

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
    const viewport = page.getViewport({ scale: Math.min(3, PAGE_PX / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(await shrinkPhoto(canvas.toDataURL('image/jpeg', 0.92), PAGE_PX));
  }
  return { pages: out, total: pdf.numPages };
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('That file could not be opened')); r.readAsDataURL(file); });

/** A chosen file (photo or PDF) → page images ready to read */
export async function invoicePages(file) {
  if (!file) return { pages: [], total: 0 };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfPages(file);
  if (!/^image\//.test(file.type)) throw new Error('Choose a photo (JPG / PNG) or a PDF of the invoice');
  return { pages: [await shrinkPhoto(await readAsDataUrl(file), PAGE_PX)], total: 1 };
}
/** A page image (data URL) → a Blob, to keep in the pharmacy's cloud with the draft */
export function pageBlob(dataUrl) { // decoded here: the app's security policy (rightly) doesn't let fetch() read data: URLs
  const [head, data] = String(dataUrl).split(',');
  const bin = atob(data), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: (/data:([^;]+)/.exec(head) || [])[1] || 'image/jpeg' });
}

import { normDate } from './invoicedates.js';
export { normDate };

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
  const merged = { supplier: '', invoiceNo: '', date: '', total: 0, items: [], linesTotal: 0, readings: 0 };
  for (let i = 0; i < pages.length; i++) {
    onPage?.(i + 1, pages.length);
    const r = await aiInvoice(cfg, pages[i]);
    merged.supplier ||= r.supplier; merged.invoiceNo ||= r.invoiceNo; merged.date ||= r.date; merged.total ||= r.total;
    merged.items.push(...(r.items || []).map((it) => ({ ...it, page: i + 1 })));
    merged.linesTotal += Number(r.linesTotal) || 0;
    merged.readings = Math.max(merged.readings, Number(r.readings) || 1);
  }
  // the lines of all pages against the invoice total (printed once, usually on the last page)
  merged.totalMatches = !merged.total || Math.abs(merged.linesTotal - merged.total) <= Math.max(1, merged.total * 0.01);
  return merged;
}
