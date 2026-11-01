// Stock repair: fixes what tools/stock-audit.mjs finds that can be fixed safely, by ADDING correcting stock movements
// (history is never edited). Dry run by default: prints the plan and writes nothing. APPLY=yes writes it.
//   RXPOS_API=… OWNER_KEY=… [APPLY=yes] node tools/stock-repair.mjs [tenant-slug…]
// Fixes:
//   • batches below zero while the same medicine has stock in other batches (an adjustment "Remove" booked more than one
//     batch held): the shortfall moves to those other batches, earliest expiry first. Each medicine's total is unchanged.
// Reports (no automatic fix, they need a decision): receipts made in RxPOS since stock tracking began whose stock was
// not taken out, and duplicated stock changes. Prints stock figures only, never customer details.
import { pathToFileURL } from 'node:url';
import { fetchAll, inputFor, ugDay } from './stock-audit.mjs';
import { catalogCost } from '../worker/dailystock.js';

/** Pure plan for one pharmacy: correcting movements to bring negative batches back to zero from the medicine's other batches. */
export function planRepairs({ products = [], batches = [], movements = [], sales = [] }, { now = new Date().toISOString() } = {}) {
  const P = new Map(products.map((p) => [p.id, p])), B = new Map(batches.map((b) => [b.id, b]));
  const cost = (pid) => (P.has(pid) ? Number(P.get(pid).cost) || 0 : catalogCost(pid));
  const lots = new Map();
  for (const m of movements) {
    const br = m.branchId || 'main', k = br + '|' + (m.batchId || 'lb-' + m.productId);
    const l = lots.get(k) || { key: k, br, pid: m.productId, batchId: m.batchId || null, qty: 0 };
    l.qty += Number(m.qty) || 0; lots.set(k, l);
  }
  const exp = (l) => (l.batchId ? B.get(l.batchId)?.expiry : P.get(l.pid)?.expiry) || '9999';
  const day = ugDay(now).replace(/-/g, '');
  const moves = [], lines = [], unfixable = [];
  for (const neg of [...lots.values()].filter((l) => l.qty < -1e-9 && (!l.batchId || B.has(l.batchId)))) {
    let need = -neg.qty;
    const donors = [...lots.values()].filter((l) => l !== neg && l.pid === neg.pid && l.br === neg.br && l.qty > 1e-9 && (!l.batchId || B.has(l.batchId)))
      .sort((a, b) => exp(a).localeCompare(exp(b)));
    const takes = [];
    for (const d of donors) { if (need <= 1e-9) break; const t = Math.min(d.qty, need); takes.push([d, t]); need -= t; }
    const moved = -neg.qty - need;
    if (moved <= 1e-9) { unfixable.push({ medicine: P.get(neg.pid)?.name || neg.pid, qty: neg.qty }); continue; }
    const note = 'Correction (stock audit): this batch went below zero when more was removed than it held; the shortfall is taken from the batches that still held the stock';
    const base = { productId: neg.pid, type: 'Adjustment', ref: 'AUDIT-' + day, note, user: 'Stock audit', branchId: neg.br, date: now };
    moves.push({ ...base, id: `audit-${day}-${neg.key}-in`, qty: moved, batchId: neg.batchId });
    takes.forEach(([d, t], n) => moves.push({ ...base, id: `audit-${day}-${neg.key}-out${n}`, qty: -t, batchId: d.batchId }));
    lines.push({ medicine: P.get(neg.pid)?.name || neg.pid, batch: neg.batchId ? B.get(neg.batchId)?.batch : '(no batch)', was: neg.qty, movedFrom: takes.map(([d, t]) => `${d.batchId ? B.get(d.batchId)?.batch : '(no batch)'} −${t}`).join(', '),
      valueBackInTotal: Math.round(moved * cost(neg.pid)), leftNegative: need > 1e-9 ? -need : 0 });
  }
  return { moves, lines, unfixable };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const APPLY = process.env.APPLY === 'yes';
  const API = (process.env.RXPOS_API || 'https://api.rxposug.com').replace(/\/+$/, '');
  const data = await fetchAll();
  for (const t of data.tenants) {
    if (only.length && !only.includes(t.slug) && !only.includes(t.id)) continue;
    const input = inputFor(data.rows, t.id);
    const plan = planRepairs(input);
    console.log(`\n### ${t.name} (/${t.slug || t.id}) — ${APPLY ? 'APPLYING' : 'dry run (nothing written)'}`);
    console.log(`negative batches to correct: ${plan.lines.length}; correcting movements: ${plan.moves.length}`);
    for (const l of plan.lines) console.log(`  ${l.medicine} [${l.batch}] ${l.was} → 0, taken from ${l.movedFrom}${l.leftNegative ? ` (still ${l.leftNegative}: not enough stock elsewhere)` : ''}`);
    for (const u of plan.unfixable) console.log(`  CANNOT FIX (no other stock of it): ${u.medicine} ${u.qty}`);
    // receipts made in RxPOS since stock tracking began with stock not taken out: details to investigate
    const start = input.movements.filter((m) => /^Opening stock/.test(m.type)).map((m) => m.date).sort()[0] || '0000';
    const refs = new Map();
    for (const m of input.movements) if (['Sale', 'Sale edit', 'Refund'].includes(m.type)) (refs.get(m.ref) || refs.set(m.ref, []).get(m.ref)).push(m);
    for (const s of input.sales) {
      if (s.date < start || String(s.id).startsWith('rx-') || s.proforma) continue;
      const got = refs.get(s.number) || [];
      const want = (s.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0);
      const out = -got.filter((m) => m.type !== 'Refund').reduce((a, m) => a + (Number(m.qty) || 0), 0);
      if (Math.abs(want - out) > 1e-6) {
        console.log(`  RECEIPT ${s.number} ${s.date} status=${s.status} type=${s.type || 'retail'} device=${s.origin || '?'} branch=${s.branchId || 'main'} items=${JSON.stringify((s.items || []).map((i) => ({ id: i.id, name: i.name, qty: i.qty, pack: i.pack ? i.pack.name + '×' + i.pack.size : undefined, alloc: i.alloc })))} movements=${JSON.stringify(got.map((m) => ({ type: m.type, productId: m.productId, qty: m.qty, batchId: m.batchId, date: m.date, device: m.origin })))}`);
        const other = input.movements.filter((m) => (s.items || []).some((i) => i.id === m.productId) && Math.abs(Date.parse(m.date) - Date.parse(s.date)) < 600e3);
        console.log(`    stock changes for those medicines within 10 minutes: ${JSON.stringify(other.map((m) => ({ type: m.type, ref: m.ref, qty: m.qty, date: m.date })))}`);
      }
    }
    if (APPLY && plan.moves.length) {
      for (let i = 0; i < plan.moves.length; i += 400) {
        const r = await fetch(`${API}/api/owner/tenants/${t.id}/records`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OWNER_KEY },
          body: JSON.stringify({ records: plan.moves.slice(i, i + 400).map((m) => ({ t: 'movements', id: m.id, rec: m })) }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
        console.log(`  written: ${j.written}`);
      }
    }
  }
}
