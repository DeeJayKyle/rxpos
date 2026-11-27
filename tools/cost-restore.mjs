// Cost restore: puts back the costs that one save changed for many medicines at once (e.g. a Quick Edit save), to what
// each cost was just before it. Dry run by default: prints the list and writes nothing. APPLY=yes writes it.
//   RXPOS_API=… OWNER_KEY=… [APPLY=yes] node tools/cost-restore.mjs <tenant-slug> <UTC second, e.g. 2026-11-26T16:01:58>
// The cost before the save is the later of: the cost on the medicine's last sale before it, and its last delivery's cost
// of one unit before it. A medicine whose cost changed again after that save (a delivery since, say) is left alone.
// The owner's law (worker/ownerlaw.js): this writes pharmacy data, so the cloud refuses it unless the owner approved
// this exact list: OWNER_APPROVED=yes is set only after the owner saw the list and said yes.
import { pathToFileURL } from 'node:url';
import { fetchAll } from './stock-audit.mjs';

const n = (x) => Number(x) || 0;
const r2 = (x) => Math.round(x * 100) / 100;

/** Pure plan: [{ id, name, now, was, from }] for the medicines whose cost was set in the save at `at` (to the second) */
export function planCostRestore({ products = [], sales = [], purchases = [] }, at) {
  const sec = String(at).slice(0, 19);
  const last = new Map(); // productId → { at, cost, from }
  const see = (pid, when, cost, from) => {
    if (!pid || !(cost > 0) || !when || String(when).slice(0, 19) >= sec) return;
    const cur = last.get(pid);
    if (!cur || String(when) > String(cur.at)) last.set(pid, { at: when, cost, from });
  };
  for (const s of sales) for (const i of s.items || []) if (!i.kit) see(i.id, s.date, n(i.cost), `sale ${s.number || ''}`.trim());
  for (const pu of purchases) for (const i of pu.items || []) see(i.productId, pu.createdAt || pu.updatedAt || pu.date, n(i.cost), `delivery ${pu.number || pu.invoice || ''}`.trim());
  const out = [];
  for (const p of products) {
    if (String(p._f?.cost || p.updatedAt || '').slice(0, 19) !== sec) continue; // cost not set in that save, or set again since
    const b = last.get(p.id);
    if (!b || Math.abs(b.cost - n(p.cost)) < 0.005) continue;
    out.push({ id: p.id, name: p.name, now: n(p.cost), was: b.cost, from: b.from });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** The medicine with its old cost back; the cost's change time is now (so it wins on every device) */
export function restoredRecord(p, was) {
  const { _f, updatedAt: _u, ...rest } = p;
  const f = { ..._f };
  delete f.cost;
  return { ...rest, cost: was, ...(Object.keys(f).length ? { _f: f } : {}) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [slug, at] = process.argv.slice(2);
  if (!slug || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(at || '')) { console.error('usage: node tools/cost-restore.mjs <tenant-slug> <YYYY-MM-DDTHH:MM:SS UTC>'); process.exit(2); }
  const APPLY = process.env.APPLY === 'yes';
  const API = (process.env.RXPOS_API || 'https://api.rxposug.com').replace(/\/+$/, '');
  const data = await fetchAll();
  const t = data.tenants.find((x) => x.slug === slug || x.id === slug);
  if (!t) throw new Error(`No pharmacy ${slug}`);
  const live = {};
  for (const r of data.rows) {
    if (r.tenant !== t.id || r.deleted || r.rec == null || !['products', 'sales', 'purchases'].includes(r.t)) continue;
    let rec; try { rec = typeof r.rec === 'string' ? JSON.parse(r.rec) : r.rec; } catch { continue; }
    if (rec) { rec.id ??= r.id; (live[r.t] ||= []).push(rec); }
  }
  const plan = planCostRestore(live, at);
  console.log(`\n### ${t.name} (/${t.slug || t.id}): costs set at ${at} UTC — ${APPLY ? 'APPLYING' : 'dry run (nothing written)'}`);
  console.log(`${plan.length} medicines to put back:`);
  for (const x of plan) console.log(`  ${x.name}: ${r2(x.now)} → ${r2(x.was)}  (from ${x.from})`);
  if (APPLY && plan.length) {
    const P = new Map(live.products.map((p) => [p.id, p]));
    const records = plan.map((x) => ({ t: 'products', id: x.id, rec: restoredRecord(P.get(x.id), x.was) }));
    // said in the pharmacy's audit log too
    records.push({ t: 'audit', id: 'cost-restore-' + Date.now().toString(36), rec: { date: new Date().toISOString(), user: 'RxPOS owner', action: 'Cost changed', branchId: 'main',
      details: `Put back ${plan.length} costs changed at ${at} UTC, on the owner's approval: ${plan.map((x) => `${x.name} ${r2(x.now)} → ${r2(x.was)}`).join('; ')}`.slice(0, 2000) } });
    const r = await fetch(`${API}/api/owner/tenants/${t.id}/records`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OWNER_KEY, ...(process.env.OWNER_APPROVED === 'yes' ? { 'X-Owner-Approved': 'yes' } : {}) }, body: JSON.stringify({ records }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    console.log(`written: ${j.written}`);
  }
}
