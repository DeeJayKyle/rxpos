// Cost check: when and why each medicine's cost price changed. Read-only: it changes nothing.
//   RXPOS_API=https://api.rxposug.com OWNER_KEY=… node tools/cost-check.mjs [tenant-slug…] [--days 60]
//   node tools/cost-check.mjs --file decrypted-backup.json [tenant-slug…]
// Every sale line keeps the medicine's cost at the time it was sold, so the sales are a history of each cost price. For
// every change between two sales of a medicine it looks for what came between: a delivery (Add Stock sets the cost to the
// delivery's cost per stock unit), a change of the unit of issue, an edit in the audit log, or nothing that says why.
// A new cost about a pack size away from the old one (×10, ÷10…) is flagged: a pack's cost taken as one unit's, or the
// other way round. It prints medicine names, dates and costs only — never customer details.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fetchAll } from './stock-audit.mjs';

const EAT = 3 * 3600e3;
const ugTime = (iso) => new Date(new Date(iso).getTime() + EAT).toISOString().slice(0, 16).replace('T', ' ');
const n = (x) => Number(x) || 0;
const r2 = (x) => Math.round(x * 100) / 100;

/** The pack size (or 1/size) that the ratio of two costs is close to, else 0 */
export function packRatio(oldCost, newCost, sizes) {
  if (!(oldCost > 0) || !(newCost > 0)) return 0;
  const q = newCost / oldCost;
  for (const s of sizes) if (s > 1 && (Math.abs(q / s - 1) < 0.15 || Math.abs(q * s - 1) < 0.15)) return q > 1 ? s : -s;
  return 0;
}

/**
 * products, sales, purchases, audit: one pharmacy's live records. since: ISO date; changes before it are left out.
 * Returns { changes: [...], byCause: {cause: count}, products: n, now: [...] } — each change is
 * { product, from, to, at, cause, detail, packRatio }.
 */
export function costHistory({ products = [], sales = [], purchases = [], audit = [], batches = [], since = '' }) {
  const P = new Map(products.map((p) => [p.id, p]));
  const byName = new Map(products.map((p) => [String(p.name || '').toLowerCase(), p]));
  const sizesOf = (p) => [...new Set([...(p?.packs || []).map((k) => n(k.size)), ...(p?.unitChanges || []).map((c) => n(c.factor))].filter((s) => s > 1))];
  const lines = new Map(); // productId → [{ at, cost, origin }]
  for (const s of sales) {
    if (s.refund || s.type === 'refund') continue;
    for (const i of s.items || []) {
      if (i.kit || !i.id || !(n(i.cost) > 0)) continue;
      (lines.get(i.id) || lines.set(i.id, []).get(i.id)).push({ at: s.date, cost: n(i.cost), origin: s.origin || s.device || '' });
    }
  }
  const buys = new Map(); // productId → [{ at, cost, pack }]
  for (const pu of purchases) for (const i of pu.items || []) {
    if (!i.productId) continue;
    (buys.get(i.productId) || buys.set(i.productId, []).get(i.productId)).push({ at: pu.createdAt || pu.updatedAt || pu.date, day: pu.date, cost: n(i.cost), pack: i.pack || null, number: pu.number || pu.invoice || '' });
  }
  const edits = (audit || []).filter((a) => /Price changed|Unit of issue|Inventory edited|Selling units|Medicines changed|Medicine renamed|merged/i.test(a.action || ''));
  const changes = [];
  for (const [pid, list] of lines) {
    const p = P.get(pid);
    if (!p) continue;
    list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1], b = list[k];
      if (Math.abs(a.cost - b.cost) < 0.005 || String(b.at) < since) continue;
      const between = (x) => String(x) > String(a.at) && String(x) <= String(b.at);
      const bought = (buys.get(pid) || []).filter((x) => between(x.at) || between(x.day));
      const unit = (p.unitChanges || []).filter((c) => between(c.at));
      const name = String(p.name || '').toLowerCase();
      const logged = edits.filter((e) => between(e.date) && String(e.details || '').toLowerCase().includes(name));
      // two tills: one still holding the older copy of the medicine sells at the old cost after the other's new one
      const back = list.slice(0, k - 1).some((x) => Math.abs(x.cost - b.cost) < 0.005) && a.origin && b.origin && a.origin !== b.origin;
      let cause = 'no recorded reason', detail = '';
      if (unit.length) { cause = 'unit of issue changed'; detail = unit.map((c) => `1 ${c.from} = ${c.factor} ${c.to}`).join('; '); }
      else if (bought.length) { cause = 'delivery received'; detail = bought.map((x) => `${x.number} at ${r2(x.cost)} per unit${x.pack ? ` (received as ${x.pack.count} ${x.pack.name} of ${x.pack.size} at ${r2(n(x.pack.cost))})` : ''}`).join('; '); }
      else if (logged.length) { cause = 'edited (audit log)'; detail = logged.map((e) => `${e.action} by ${e.user}`).join('; '); }
      else if (back) cause = 'two tills, one with an older copy';
      if (cause === 'no recorded reason') {
        // what else happened then: anything in the audit log in the window (its first 4), and the medicine's batch costs
        const near = (audit || []).filter((e) => between(e.date)).slice(-4).map((e) => `${e.action}: ${String(e.details || '').slice(0, 70)}`);
        const bs = batches.filter((x) => x.productId === pid).map((x) => `${x.batch} ${r2(n(x.cost))}${x.received ? ' rcvd ' + x.received : ''}`).slice(-4);
        detail = `cost last set ${p._f?.cost || p.updatedAt || '?'}; batches ${bs.join(', ') || 'none'}${near.length ? '; meanwhile: ' + near.join(' | ') : ''}`;
      }
      changes.push({ product: p.name, productId: pid, from: a.cost, to: b.cost, at: b.at, after: a.at, cause, detail, packRatio: packRatio(a.cost, b.cost, sizesOf(p)) });
    }
  }
  changes.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const byCause = {};
  for (const c of changes) byCause[c.cause] = (byCause[c.cause] || 0) + 1;
  // today's cost against the last delivery's cost per unit
  const now = [];
  for (const p of products) {
    const last = (buys.get(p.id) || []).filter((x) => x.cost > 0).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    if (!last || Math.abs(n(p.cost) - last.cost) < 0.01) continue;
    now.push({ product: p.name, cost: n(p.cost), lastDelivery: last.cost, number: last.number, at: last.at, packRatio: packRatio(last.cost, n(p.cost), sizesOf(p)), costChangedAt: p._f?.cost || p.updatedAt || '' });
  }
  // many medicines' costs set in the same second: one bulk save (an import, a merge, a device re-sending its copy)
  const sec = new Map();
  for (const p of products) { const t = String(p._f?.cost || p.updatedAt || '').slice(0, 19); if (t) (sec.get(t) || sec.set(t, []).get(t)).push(p); }
  const bulk = [...sec].filter(([, ps]) => ps.length >= 5).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([t, ps]) => ({
    at: t, n: ps.length, origins: [...new Set(ps.map((p) => p._origin).filter(Boolean))].slice(0, 3),
    audit: (audit || []).filter((e) => Math.abs(new Date(e.date) - new Date(t + 'Z')) < 120e3).map((e) => `${e.date.slice(11, 19)} ${e.action} (${e.user}): ${String(e.details || '').slice(0, 80)}`).slice(0, 8),
    sample: ps.slice(0, 5).map((p) => `${p.name} ${r2(n(p.cost))}`) }));
  return { changes, byCause, now, bulk, products: lines.size, medicines: products.length };
}

export function formatCosts(title, h) {
  const L = [`\n================ ${title}: cost prices ================`];
  L.push(`${h.changes.length} cost changes between sales of ${h.products} medicines sold`);
  for (const [k, v] of Object.entries(h.byCause).sort((a, b) => b[1] - a[1])) L.push(`  ${String(v).padStart(5)}  ${k}`);
  const packs = h.changes.filter((c) => c.packRatio);
  L.push(`  ${String(packs.length).padStart(5)}  of them about a pack size away (×/÷ the pack: pack and unit mixed up)`);
  L.push('\nLatest changes (newest first):');
  for (const c of h.changes.slice(0, 60)) L.push(`  ${ugTime(c.at)}  ${c.product}: ${r2(c.from)} → ${r2(c.to)}${c.packRatio ? `  [×${c.packRatio > 0 ? c.packRatio : '1/' + -c.packRatio}]` : ''}  — ${c.cause}${c.detail ? ': ' + c.detail : ''}`);
  L.push('\nCosts set in the same second for many medicines (UTC):');
  for (const b of h.bulk || []) L.push(`  ${b.at}  ${b.n} medicines${b.origins.length ? ' from ' + b.origins.join(', ') : ''}; e.g. ${b.sample.join(', ')}${b.audit.length ? '\n      audit then: ' + b.audit.join('\n                  ') : ''}`);
  L.push(`\n${h.now.length} medicines whose cost today differs from their last delivery's cost per unit:`);
  for (const x of h.now.slice(0, 40)) L.push(`  ${x.product}: today ${r2(x.cost)}, last delivery ${x.number} ${r2(x.lastDelivery)}${x.packRatio ? `  [×${x.packRatio > 0 ? x.packRatio : '1/' + -x.packRatio}]` : ''}; cost last set ${x.costChangedAt ? ugTime(x.costChangedAt) : '?'}`);
  return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--file'), di = args.indexOf('--days');
  const days = di >= 0 ? Number(args[di + 1]) : 60;
  const only = args.filter((a, k) => !a.startsWith('--') && k !== fi + 1 && k !== di + 1);
  const data = fi >= 0 ? (() => { const j = JSON.parse(fs.readFileSync(args[fi + 1], 'utf8')); return { tenants: j.tenants, rows: j.records }; })() : await fetchAll();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  for (const t of data.tenants) {
    if (only.length && !only.includes(t.slug) && !only.includes(t.id)) continue;
    const live = {};
    for (const r of data.rows) {
      if (r.tenant !== t.id || r.deleted || r.rec == null) continue;
      if (!['products', 'sales', 'purchases', 'audit', 'batches'].includes(r.t)) continue;
      let rec; try { rec = typeof r.rec === 'string' ? JSON.parse(r.rec) : r.rec; } catch { continue; }
      if (!rec) continue;
      rec.id ??= r.id;
      if (r.t === 'sales') rec.origin = r.origin;
      if (r.t === 'products') rec._origin = r.origin;
      (live[r.t] ||= []).push(rec);
    }
    console.log(formatCosts(`${t.name} (/${t.slug || t.id})`, costHistory({ ...live, since })).join('\n'));
  }
}
