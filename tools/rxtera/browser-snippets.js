// Copying a pharmacy's data out of Rxtera (xxx.rxtera.com) — paste these into Chrome DevTools (F12 → Console)
// while signed in to Rxtera. Each snippet sends what it reads to receiver.cjs running on this PC (see README.md).
// Run setup first on EVERY page you open (it is lost when the page changes), then the snippet for that page.

// ── 0. setup: paste on every page ────────────────────────────────────────────────────────────────────────────
window.RX = { token: 'THE-TOKEN-YOU-GAVE-receiver.cjs', url: 'http://127.0.0.1:8799' };
window.rxSend = async (name, data) => {
  const r = await fetch(`${RX.url}/${RX.token}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  console.log(name, r.status === 200 ? 'saved' : 'FAILED ' + r.status);
};
window.rxSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome may ask to allow access to devices on your local network: click Allow.

// ── 1. any page: customers, suppliers, users, expiry lists, debtor/creditor reports, expenses, banks, formulations ─
(async () => {
  const cf = (h) => { const k = parseInt(h.substr(0, 2), 16); let s = ''; for (let i = 2; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ k); return s; }; // Cloudflare-hidden emails
  const cell = (c) => { const e = c.querySelector('[data-cfemail]'); if (e) return cf(e.getAttribute('data-cfemail')); const i = c.querySelector('input,select'); return (i ? (i.tagName === 'SELECT' ? i.selectedOptions[0]?.text ?? '' : i.value) : c.textContent).trim().replace(/\s+/g, ' '); };
  const grab = async (p) => {
    const out = []; let head = []; let prev = '';
    for (let pg = 1; pg < 300; pg++) {
      const doc = new DOMParser().parseFromString(await (await fetch(p + (p.includes('?') ? '&' : '?') + 'page=' + pg)).text(), 'text/html');
      const t = doc.querySelector('table'); if (!t) break;
      head = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim().replace(/\s+/g, ' '));
      const rows = [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map(cell)).filter((r) => r.some(Boolean) && r.length > 1);
      const sig = JSON.stringify(rows[0]); if (!rows.length || sig === prev) break; prev = sig; out.push(...rows);
      if (!doc.querySelector('[wire\\:click*="nextPage"]:not([disabled]), a[rel=next]')) break;
    }
    return { head, rows: out };
  };
  await rxSend('other', { customers: await grab('/customers'), suppliers: await grab('/suppliers'), users: await grab('/users'), expiry: await grab('/expiry'), expired: await grab('/expired'), creditReport: await grab('/reports/credit-report'), debitReport: await grab('/reports/debit-report') });
  await rxSend('extra', { formulations: await grab('/formulations'), banks: await grab('/bank'), loans: await grab('/loans'), deposits: await grab('/deposit'), expenses: await grab('/expenses'), expenseCategories: await grab('/expensescategory'), stockCounts: await grab('/stock/counting') });
  // Rxtera's logo is never copied (owner's decision, 16 Oct 2026).
})();

// ── 2. pages with a "show N" list that pages with Next: open /quickedit, then /costhistory, and paste on each ──
//    (name = 'quickedit' on /quickedit, 'costhistory' on /costhistory)
window.rxPaged = async (name) => {
  const size = [...document.querySelectorAll('select')].find((s) => /pageSize|perPage/.test(s.getAttribute('wire:model') || s.getAttribute('wire:model.live') || ''));
  if (size) { const before = document.querySelector('table tbody')?.textContent; size.value = [...size.options].at(-1).value; size.dispatchEvent(new Event('input', { bubbles: true })); size.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 60; i++) { await rxSleep(250); if (document.querySelector('table tbody')?.textContent !== before) break; } await rxSleep(800); }
  const head = [...document.querySelectorAll('table thead th')].map((h) => h.textContent.trim().replace(/\s+/g, ' '));
  const all = [];
  for (let guard = 0; guard < 2000; guard++) {
    for (const tr of document.querySelectorAll('table tbody tr')) all.push([...tr.cells].map((c) => { const i = c.querySelector('input,select'); return (i ? (i.tagName === 'SELECT' ? i.selectedOptions[0]?.text : i.value) : c.textContent).trim().replace(/\s+/g, ' '); }));
    const next = [...document.querySelectorAll('button[wire\\:click]')].find((b) => /nextPage/.test(b.getAttribute('wire:click')) && !b.disabled);
    if (!next) break;
    const first = document.querySelector('table tbody tr')?.textContent;
    next.click();
    for (let i = 0; i < 60; i++) { await rxSleep(250); if (document.querySelector('table tbody tr')?.textContent !== first) break; }
    await rxSleep(300);
  }
  await rxSend(name, { head, rows: all });
};
// rxPaged('quickedit')   ← on /quickedit
// rxPaged('costhistory') ← on /costhistory

// ── 3. /medicine-list: every medicine with prices and minimum stock ────────────────────────────────────────────
window.rxMedicines = async () => {
  const typeSel = [...document.querySelectorAll('select')].find((s) => (s.getAttribute('wire:model') || s.getAttribute('wire:model.live')) === 'type');
  const typeNames = {}; if (typeSel) for (const o of typeSel.options) if (o.value) typeNames[o.value] = o.text.trim();
  const size = [...document.querySelectorAll('select')].find((s) => /pageSize/.test(s.getAttribute('wire:model') || s.getAttribute('wire:model.live') || ''));
  const before = document.querySelector('table tbody')?.textContent;
  size.value = [...size.options].at(-1).value; size.dispatchEvent(new Event('input', { bubbles: true })); size.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 40; i++) { await rxSleep(250); if (document.querySelector('table tbody')?.textContent !== before) break; }
  await rxSleep(800);
  const all = new Map();
  for (let guard = 0; guard < 300; guard++) {
    for (const tr of document.querySelectorAll('table tbody tr')) {
      const c = [...tr.cells]; const sel = c[3]?.querySelector('select');
      const r = { code: c[0]?.textContent.trim(), name: c[1]?.textContent.trim(), generic: c[2]?.textContent.trim(), type: sel ? (sel.selectedOptions[0]?.text.trim() || typeNames[sel.value]) : c[3]?.textContent.trim(), retail: c[4]?.querySelector('input')?.value ?? c[4]?.textContent.trim(), wholesale: c[5]?.querySelector('input')?.value ?? c[5]?.textContent.trim(), min: c[6]?.querySelector('input')?.value ?? c[6]?.textContent.trim() };
      if (r.name) all.set(r.code + '|' + r.name, r);
    }
    console.log('medicines so far', all.size);
    const next = [...document.querySelectorAll('button[wire\\:click]')].find((b) => /nextPage/.test(b.getAttribute('wire:click')) && !b.disabled);
    if (!next) break;
    const first = document.querySelector('table tbody tr')?.textContent;
    next.click();
    for (let i = 0; i < 40; i++) { await rxSleep(250); if (document.querySelector('table tbody tr')?.textContent !== first) break; }
    await rxSleep(300);
  }
  await rxSend('medicines', [...all.values()]);
};
// rxMedicines()

// ── 4. /salesreport: every sale line, half a month at a time (newest first, stops after 3 empty months) ────────
// maxMonths: stop after that many months (nightly refresh: 2 = this month and last); default: until 3 empty months
window.rxSalesReport = async (fromYear, fromMonth, maxMonths = Infinity) => {
  const set = (name, val) => { const el = document.querySelector(`[wire\\:model="${name}"]`); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const bank = document.querySelector('[wire\\:model="bank"]'); set('bank', [...bank.options].find((o) => /^all$/i.test(o.text.trim())).value); // the default is "Cash" only!
  const pad = (n) => String(n).padStart(2, '0'), norm = (s) => s.replace(/\s+/g, ' ');
  const run = async (a, b) => {
    set('start_date', a); set('end_date', b);
    document.querySelector('form[wire\\:submit\\.prevent="search"] button[type=submit]').click();
    for (let i = 0; i < 300; i++) { await rxSleep(400); if (norm(document.body.innerText).includes(`from ${a} to ${b}`)) break; }
    await rxSleep(500);
    return [...document.querySelectorAll('table tbody tr')].map((r) => [...r.cells].map((c) => c.innerText.trim())).filter((c) => c.length >= 9);
  };
  const now = new Date(); let y = fromYear || now.getFullYear(), m = fromMonth || now.getMonth() + 1, empty = 0;
  for (let done = 0; empty < 3 && done < maxMonths; done++) {
    const key = `${y}-${pad(m)}`, last = new Date(y, m, 0).getDate();
    const rows = [...await run(`${key}-01`, `${key}-15`), ...await run(`${key}-16`, `${key}-${last}`)];
    console.log(key, rows.length, 'lines');
    if (rows.length) { empty = 0; await rxSend('sales-' + key, rows); } else empty++;
    if (--m === 0) { m = 12; y--; }
  }
};
// rxSalesReport()          ← everything (first copy); keep this tab in front while it runs
// rxSalesReport(0, 0, 2)   ← nightly: this month and last month only

// ── 5. DataTables lists: /stock/sale/history → 'saleheads', /stock/history → 'purchaseheads' ───────────────────
// maxRows: newest rows only (big pharmacies: Rxtera serves this list slowly)
window.rxTable = async (name, size = 500, maxRows = Infinity) => {
  const tbl = document.querySelector('table[id]'); const dt = $('#' + tbl.id).DataTable(); const all = [];
  for (let start = 0; ; start += size) {
    const prm = { ...dt.ajax.params(), start, length: size };
    const j = await (await fetch(dt.ajax.url() + (dt.ajax.url().includes('?') ? '&' : '?') + $.param(prm), { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } })).json();
    all.push(...j.data.map((r) => (name === 'purchaseheads' ? [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]] : r)));
    console.log(name, all.length, 'of', j.recordsTotal);
    if (j.data.length < size || all.length >= maxRows) break;
  }
  await rxSend(name, all);
};
// rxTable('saleheads')            ← on /stock/sale/history (all sales)
// rxTable('saleheads', 500, 3000) ← nightly: newest 3,000 sales only
// rxTable('purchaseheads')  ← on /stock/history

// ── 6. /stock/debit-notes → 'debitnotes', /stock/credit-notes → 'creditnotes' (with each note's details) ───────
window.rxNotes = async (name) => {
  const dt = $('#' + document.querySelector('table[id]').id).DataTable();
  const j = await (await fetch(dt.ajax.url() + (dt.ajax.url().includes('?') ? '&' : '?') + $.param({ ...dt.ajax.params(), start: 0, length: 5000 }), { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } })).json();
  const out = [];
  for (const r of j.data) {
    const href = (String(r[6]).match(/href="([^"]+)"/) || [])[1]; let detail = '';
    if (href) { const d = new DOMParser().parseFromString(await (await fetch(href)).text(), 'text/html'); detail = [...d.querySelectorAll('table')].map((t) => t.innerText.replace(/\s+/g, ' ')).join(' || ').slice(0, 1500); }
    out.push({ row: [r[0], r[1], r[2], r[3], r[4], r[5]].map(String), href, detail });
  }
  await rxSend(name, out);
};

// ── 7. /purchasereport: every purchase line with its invoice number ──────────────────────────────────────────
window.rxPurchaseReport = async () => {
  const set = (name, val) => { const el = document.querySelector(`[wire\\:model="${name}"]`); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  set('start_date', '2015-01-01'); set('end_date', `${new Date().getFullYear() + 1}-12-31`);
  const before = document.querySelector('table tbody')?.innerText;
  document.querySelector('form[wire\\:submit\\.prevent="search"] button[type=submit]').click();
  for (let i = 0; i < 200; i++) { await rxSleep(500); if (document.querySelector('table tbody')?.innerText !== before) break; }
  await rxSleep(1500);
  const head = [...document.querySelectorAll('table thead th')].map((h) => h.textContent.trim());
  const rows = [...document.querySelectorAll('table tbody tr')].map((r) => [...r.cells].map((c) => c.innerText.trim())).filter((c) => c.length >= 10);
  await rxSend('purchaselines', { head, rows });
};

// ── 8. each stock count: open /stock/counting/<N>/checkVariance and run rxStockCount(N) ───────────────────────
window.rxStockCount = async (id) => {
  const el = document.querySelector('[wire\\:key="load-more-sentinel"]');
  const comp = el?.closest('[wire\\:id]'); const w = comp && (comp.__livewire?.$wire || Livewire.find(comp.getAttribute('wire:id')));
  const total = Number((document.body.innerText.match(/(\d+) items/) || [])[1]) || 0;
  for (let i = 0; w && i < 80; i++) { const n = document.querySelectorAll('table tbody tr').length; if (n >= total) break; await w.loadMore(); await rxSleep(500); }
  const head = [...document.querySelectorAll('table thead th')].map((h) => h.textContent.trim().replace(/\s+/g, ' '));
  const rows = [...document.querySelectorAll('table tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim().replace(/\s+/g, ' '))).filter((r) => r.length > 2);
  await rxSend('stockcount-' + id, { id, total, head, rows });
};
