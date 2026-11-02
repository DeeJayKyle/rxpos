// Measure invoice reading: render the fictional invoices (invoices.mjs) in every style, ask each model with each set of
// instructions, score every field against the known answer. Runs in GitHub Actions (needs Cloudflare Workers AI).
//   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/invoice-eval/run.mjs [models…]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { INVOICES, STYLES, html, total } from './invoices.mjs';
import { CURRENT, CANDIDATE } from './prompts.mjs';
import { clean, finish } from '../../worker/invoiceread.js';

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOKEN = process.env.CLOUDFLARE_API_TOKEN;
// through the temporary eval worker (its AI binding) when given, else the Workers AI REST API
const EVAL_URL = process.env.EVAL_URL, EVAL_KEY = process.env.EVAL_KEY;
const runModel = (model, input) => (EVAL_URL
  ? fetch(EVAL_URL, { method: 'POST', headers: { 'x-eval-key': EVAL_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input }), signal: AbortSignal.timeout(180000) }).then((r) => r.json())
  : api('/run/' + model, input));
const api = (p, body) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai${p}`, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180000) }).then((r) => r.json());

// 1. which vision models this account can run
const found = [];
for (let page = 1; page <= 5 && !EVAL_URL; page++) {
  const r = await api(`/models/search?per_page=100&page=${page}`);
  if (!r.success) { console.log('model list not available:', JSON.stringify(r.errors || r).slice(0, 300)); break; }
  for (const m of r.result) {
    const text = JSON.stringify(m).toLowerCase();
    if (/vision|image-to-text|multimodal|"vision":true|scout|gemma-3|qwen2\.5-vl|llava|mistral-small-3\.1/.test(text)) found.push(m.name);
  }
  if (r.result.length < 100) break;
}
console.log('vision-capable models:', found.join(', ') || '(none found by search)');
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : [...new Set(['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct', ...found.filter((n) => /scout|gemma-3|qwen.*vl|mistral-small/.test(n))])];

// 2. render every invoice in every style
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1.6 });
const images = [];
for (const inv of INVOICES) for (const style of STYLES) {
  await page.setContent(html(inv, style), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.locator('.page').screenshot({ type: 'jpeg', quality: style === 'photo' ? 55 : 82 });
  fs.mkdirSync('invoice-eval-out', { recursive: true });
  fs.writeFileSync(`invoice-eval-out/${inv.id}-${style}.jpg`, buf);
  images.push({ inv, style, url: 'data:image/jpeg;base64,' + buf.toString('base64'), kb: Math.round(buf.length / 1024) });
}
await browser.close();
console.log('images:', images.map((i) => `${i.inv.id}-${i.style} ${i.kb} KB`).join(', '));

// 3. ask and score
const firstJson = (t) => { if (t && typeof t === 'object') return t; t = String(t || ''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); };
const num = (v) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s) => String(s || '').toLowerCase().match(/[a-z]{3,}|\d+(\.\d+)?/g) || [];
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function day(v) {
  const s = String(v || '').trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{1,2})$/); if (m) return lastDay(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{2,4})$/); if (m) return lastDay(+(m[2].length === 2 ? '20' + m[2] : m[2]), +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*[ -](\d{2,4})$/); if (m && MON[m[1]]) return lastDay(+(m[2].length === 2 ? '20' + m[2] : m[2]), MON[m[1]]);
  return s;
}
function score(inv, out) {
  const s = { lines: 0, name: 0, qty: 0, cost: 0, batch: 0, expiry: 0, extra: 0, supplier: 0, invoiceNo: 0, date: 0, unclearFlaggedWrong: 0, wrongNotFlagged: 0 };
  const items = Array.isArray(out?.items) ? out.items : [];
  const used = new Set();
  for (const want of inv.items) {
    let best = -1, bestScore = 0;
    items.forEach((it, k) => { if (used.has(k)) return; const w = words(want.name), h = new Set(words(it.name)); const sc = w.filter((x) => h.has(x)).length / w.length; if (sc > bestScore) { bestScore = sc; best = k; } });
    if (best < 0 || bestScore < 0.5) { s.wrongNotFlagged++; continue; }
    used.add(best); s.lines++;
    const it = items[best];
    const okName = bestScore >= 0.8, okQty = num(it.qty) === want.qty, okCost = num(it.unitCost) === want.unitCost, okBatch = norm(it.batch) === norm(want.batch), okExp = day(it.expiry) === want.expiry;
    s.name += okName; s.qty += okQty; s.cost += okCost; s.batch += okBatch; s.expiry += okExp;
    const allOk = okName && okQty && okCost && okBatch && okExp;
    if (!allOk && !it.unclear) s.wrongNotFlagged++;
  }
  s.extra = items.length - used.size;
  s.supplier = norm(out?.supplier).includes(norm(inv.supplier).slice(0, 10)) ? 1 : 0;
  s.invoiceNo = norm(out?.invoiceNo) === norm(inv.invoiceNo) ? 1 : 0;
  s.date = day(out?.date) === inv.date ? 1 : 0;
  return s;
}
const rows = [];
await Promise.all(MODELS.map(async (model) => {
  for (const [pname, prompt] of [['current', CURRENT], ['candidate', CANDIDATE]]) {
    for (const im of images) {
      const t0 = Date.now();
      let out = null, err = '';
      try {
        const r = await runModel(model, { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: im.url } }] }], max_tokens: 2500, temperature: 0.1 });
        if (!r.success) throw new Error(JSON.stringify(r.errors || r).slice(0, 200));
        out = firstJson(r.result.response ?? r.result);
      } catch (e) { err = e.message; }
      const sc = out ? score(im.inv, out) : null;
      rows.push({ model, prompt: pname, image: `${im.inv.id}-${im.style}`, n: im.inv.items.length, sc, err, s: Math.round((Date.now() - t0) / 1000), out });
      console.log(model.split('/').pop().padEnd(34), pname.padEnd(9), `${im.inv.id}-${im.style}`.padEnd(18), sc ? `lines ${sc.lines}/${im.inv.items.length} qty ${sc.qty} cost ${sc.cost} batch ${sc.batch} exp ${sc.expiry} name ${sc.name} extra ${sc.extra} sup ${sc.supplier} no ${sc.invoiceNo} date ${sc.date} silent-errors ${sc.wrongNotFlagged}` : 'ERROR ' + err, `${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
}));
// 4. summary: share of fields right, per model × instructions × style
console.log('\nSUMMARY (fields right out of all fields; silent errors = wrong lines not flagged for checking)');
const groups = {};
for (const r of rows) {
  const style = r.image.split('-').slice(2).join('-');
  for (const key of [`${r.model}|${r.prompt}|ALL`, `${r.model}|${r.prompt}|${style}`]) {
    const g = (groups[key] ||= { right: 0, of: 0, silent: 0, errors: 0 });
    if (!r.sc) { g.errors++; g.of += r.n * 5; continue; }
    g.right += r.sc.qty + r.sc.cost + r.sc.batch + r.sc.expiry + r.sc.name; g.of += r.n * 5; g.silent += r.sc.wrongNotFlagged;
  }
}
for (const [k, g] of Object.entries(groups).sort()) console.log(k.padEnd(70), `${Math.round((100 * g.right) / g.of)}%`.padStart(5), `silent errors ${g.silent}`, g.errors ? `failed calls ${g.errors}` : '');
// 5. the two models cross-checked, as the cloud does it (worker/invoiceread.js): fields right, wrong lines that slipped
// through without a flag (silent), and right lines flagged anyway (extra checking for the person)
if (MODELS.length >= 2) {
  console.log('\nCROSS-CHECKED (' + MODELS.slice(0, 2).map((m) => m.split('/').pop()).join(' + ') + ')');
  const tally = {};
  for (const [pname] of [['current'], ['candidate']]) for (const im of images) {
    const a = rows.find((r) => r.model === MODELS[0] && r.prompt === pname && r.image === `${im.inv.id}-${im.style}`);
    const b = rows.find((r) => r.model === MODELS[1] && r.prompt === pname && r.image === `${im.inv.id}-${im.style}`);
    if (!a?.out || !b?.out) continue;
    const r = finish(clean(a.out), clean(b.out));
    let right = 0, silent = 0, flaggedOk = 0, flaggedBad = 0;
    for (const want of im.inv.items) {
      const it = r.items.find((x) => words(x.name).filter((w) => new Set(words(want.name)).has(w)).length / Math.max(1, words(want.name).length) >= 0.5);
      if (!it) { silent++; continue; }
      const ok = [num(it.qty) === want.qty, num(it.unitCost) === want.unitCost, norm(it.batch) === norm(want.batch), day(it.expiry) === want.expiry, true];
      right += ok.filter(Boolean).length;
      const allOk = ok.every(Boolean), flagged = (it.check || []).length > 0;
      if (!allOk && !flagged) silent++; if (allOk && flagged) flaggedOk++; if (!allOk && flagged) flaggedBad++;
    }
    for (const key of [`${pname}|ALL`, `${pname}|${im.style}`]) {
      const g = (tally[key] ||= { right: 0, of: 0, silent: 0, caught: 0, extra: 0, lines: 0 });
      g.right += right; g.of += im.inv.items.length * 5; g.silent += silent; g.caught += flaggedBad; g.extra += flaggedOk; g.lines += im.inv.items.length;
    }
  }
  for (const [k, g] of Object.entries(tally).sort()) console.log(k.padEnd(24), `${Math.round((100 * g.right) / g.of)}% fields right`.padEnd(18), `wrong lines caught ${g.caught}`, `· slipped through ${g.silent}`, `· right lines flagged ${g.extra} of ${g.lines}`);
}
fs.writeFileSync('invoice-eval-out/results.json', JSON.stringify(rows, null, 1));
