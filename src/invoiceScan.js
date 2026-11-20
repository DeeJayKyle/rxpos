// Scanning a supplier invoice into Add Stock: photo or PDF → pages as images → two AI models read each page
// independently in the cloud and are cross-checked (worker/invoiceread.js) → lines matched to this pharmacy's medicines
// → a delivery draft that waits for a person to check it. Nothing reaches stock until "Receive stock".
import { aiInvoice } from './cloud.js';
import { enhancePixels } from './pageenhance.js';

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
    out.push(await preparePage(canvas));
  }
  return { pages: out, total: pdf.numPages };
}

/** An image (data URL or canvas) → a page ready to read: no bigger than PAGE_PX, small photos enlarged (the models
 *  read small handwriting better a little larger), the light evened out and the contrast stretched (pageenhance.js) */
export function preparePage(src) {
  const draw = (img, w, h) => {
    const k = Math.min(PAGE_PX / Math.max(w, h), Math.max(1, 1400 / Math.max(w, h)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    try { const d = ctx.getImageData(0, 0, c.width, c.height); enhancePixels(d.data, c.width, c.height); ctx.putImageData(d, 0, 0); }
    catch { /* a canvas that can't be read back: the page goes as it is */ }
    return c.toDataURL('image/jpeg', 0.88);
  };
  if (typeof src !== 'string') return Promise.resolve(draw(src, src.width, src.height));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height));
    img.onerror = () => reject(new Error('That file is not a photo'));
    img.src = src;
  });
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('That file could not be opened')); r.readAsDataURL(file); });

/** A chosen file (photo or PDF) → page images ready to read */
export async function invoicePages(file) {
  if (!file) return { pages: [], total: 0 };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfPages(file);
  if (!/^image\//.test(file.type)) throw new Error('Choose a photo (JPG / PNG) or a PDF of the invoice');
  return { pages: [await preparePage(await readAsDataUrl(file))], total: 1 };
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

// matching what was read to the pharmacy's medicines and suppliers (pure, tested): src/invoiceMatch.js
export { matchProduct, matchSupplier, rankProducts, learnedNames, lastBatchOf, fillFromLast } from './invoiceMatch.js';

/** Read every page and merge them into one invoice. The pages are read side by side (two at a time: each page is
 *  already two AI readings in the cloud), and put back in page order. */
export async function readInvoice(cfg, pages, onPage) {
  const merged = { supplier: '', invoiceNo: '', date: '', total: 0, items: [], linesTotal: 0, readings: 0 };
  const results = new Array(pages.length);
  let next = 0, done = 0;
  onPage?.(1, pages.length);
  const worker = async () => {
    while (next < pages.length) {
      const i = next++;
      results[i] = await aiInvoice(cfg, pages[i]);
      done++; if (done < pages.length) onPage?.(done + 1, pages.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, pages.length) }, worker));
  results.forEach((r, i) => {
    merged.supplier ||= r.supplier; merged.invoiceNo ||= r.invoiceNo; merged.date ||= r.date;
    merged.items.push(...(r.items || []).map((it) => ({ ...it, page: i + 1 })));
    merged.linesTotal += Number(r.linesTotal) || 0;
    merged.readings = Math.max(merged.readings, Number(r.readings) || 1);
  });
  // the invoice total is printed once, usually on the last page: the last page that has one
  merged.total = [...results].reverse().find((r) => Number(r.total) > 0)?.total || 0;
  // the lines of all pages against the invoice total
  merged.totalMatches = !merged.total || Math.abs(merged.linesTotal - merged.total) <= Math.max(1, merged.total * 0.01);
  return merged;
}
