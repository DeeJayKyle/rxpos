// Faster sync, stage 2 (docs/SYNC-SPEED-PLAN.md): a full download may ask for the core first and the history after.
// Together they are exactly the full download, never a record twice; the core holds what selling, stock and debts
// need. Runs on the cloud and the hub.   node v71-sync-phases.mjs <base> <ownerKey>
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 240) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const post = (path, token, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));

const t = await owner('/tenants', { name: 'Phases Sample Pharmacy', admin: { name: 'Phil Sample', email: 'phil@test.rx', password: 'phil-pass-12345' } });
const tid = t.tenant.id, slug = t.tenant.slug;
const old = '2025-03-01T10:00:00.000Z', recent = new Date(Date.now() - 3600e3).toISOString();
const sale = (id, extra) => ({ t: 'sales', id, rec: { number: 'R-' + id, date: old, total: 1000, paid: 1000, customerId: 'walk-in', items: [], status: 'completed', ...extra } });
const seeded = await owner(`/tenants/${tid}/records`, { records: [
  { t: 'products', id: 'ph-p1', rec: { name: 'Sample Tabs', price: 500 } },
  { t: 'movements', id: 'ph-m1', rec: { productId: 'ph-p1', qty: 100, type: 'Opening stock', date: old } },
  sale('cash-old'), // an old cash sale to a walk-in: history
  sale('cash-blank', { customerId: '' }), // no client given: a walk-in too
  sale('cash-recent', { date: recent }), // today's: core (cash-up, returns)
  sale('named-old', { customerId: 'cust-1' }), // a client's: core (their history and debt)
  sale('unpaid-old', { paid: 400 }), // not fully paid: core (a debt)
  sale('insured-old', { insurance: { insurerId: 'ins-1', share: 600 } }), // an insurer owes part: core
  { t: 'customers', id: 'cust-1', rec: { name: 'Sample Client' } },
  { t: 'audit', id: 'ph-a1', rec: { action: 'Sample', date: old } },
  { t: 'messages', id: 'ph-msg1', rec: { text: 'Hello', date: old } },
] });
check('sample pharmacy seeded', seeded.ok === true, JSON.stringify(seeded).slice(0, 120));
const token = (await post('/api/login', null, { email: 'phil@test.rx', password: 'phil-pass-12345', tenant: slug })).j.token;
const cutoff = new Date(Date.now() - 3 * 864e5).toISOString();

/** every page of one kind of download, with small pages so the paging is exercised */
async function all(extra) {
  const got = [];
  let since = 0, r;
  for (let n = 0; n < 50; n++) {
    r = await post('/api/sync', token, { deviceId: 'ph-dev', since, changes: [], v: 2, all: true, limit: 3, ...extra });
    if (r.status !== 200) return { error: r.status, got };
    got.push(...r.j.changes.map((x) => x.t + '|' + x.id));
    since = r.j.cursor;
    if (!r.j.more) break;
  }
  return { got, last: r.j };
}
const plain = await all({});
const core = await all({ phase: 'core', cutoff });
const hist = await all({ phase: 'history', cutoff });
check('the cloud says which phase it sent', core.last.phase === 'core' && hist.last.phase === 'history' && plain.last.phase === null, `${core.last.phase} ${hist.last.phase} ${plain.last.phase}`);
const both = [...core.got, ...hist.got];
check('core and history together are exactly the full download', both.length === plain.got.length && new Set(both).size === both.length && plain.got.every((k) => both.includes(k)), `${core.got.length} + ${hist.got.length} vs ${plain.got.length}`);
const inCore = (k) => core.got.includes(k), inHist = (k) => hist.got.includes(k);
check('medicines and stock movements come with the core', inCore('products|ph-p1') && inCore('movements|ph-m1'));
check('clients come with the core', inCore('customers|cust-1'));
check('old cash sales to walk-in customers wait for the history', inHist('sales|cash-old') && inHist('sales|cash-blank'));
check('today\'s sales come with the core (cash-up, returns)', inCore('sales|cash-recent'));
check('a client\'s sales come with the core (their debt and history)', inCore('sales|named-old'));
check('unpaid and insured sales come with the core (debts)', inCore('sales|unpaid-old') && inCore('sales|insured-old'));
check('the audit log and messages wait for the history', inHist('audit|ph-a1') && inHist('messages|ph-msg1'));
check('the users and settings come with the core (signing in, the till)', core.got.some((k) => k.startsWith('users|')));
const normal = await post('/api/sync', token, { deviceId: 'ph-dev', since: 0, changes: [], v: 2, phase: 'core', cutoff });
check('a phase is only for full downloads: a normal sync ignores it', normal.j.phase === null && normal.status === 200, normal.j.phase);
const badCut = await all({ phase: 'core', cutoff: 'not a date' });
check('a cutoff that is not a date falls back to the last 3 days', !badCut.error && badCut.got.includes('sales|cash-recent') && !badCut.got.includes('sales|cash-old'));

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
