// Turns a Pharmcare (Rxtera) export into an RxPOS data pack (same shape as an RxPOS backup).
//   node scripts/build-pharmcare-seed.mjs <export.json> <outDir> [pharmacy name]
// Writes <outDir>/rxpos-pharmcare-data.json (importable from Settings → Data & backup)
// and <outDir>/staff-temporary-passwords.txt. Both stay on this PC: they hold the pharmacy's own data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [src, outDir, pharmacyName = 'Pharmcare Hub'] = process.argv.slice(2);
if (!src || !outDir) { console.error('usage: node build-pharmcare-seed.mjs <export.json> <outDir> [pharmacy name]'); process.exit(1); }
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = JSON.parse(fs.readFileSync(src, 'utf8'));
const cat = JSON.parse(fs.readFileSync(path.join(root, 'src/data/catalog.json'), 'utf8'));

const at = new Date().toISOString();
const day = at.slice(0, 10);
const t0 = '2000-01-01T00:00:00.000Z';
const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().replace(/\W+/g, '-');
let seq = 0;
const id = (p) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ---------- base tables (same defaults as a fresh RxPOS) ----------
const FORMS = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Infusions', 'Creams', 'Ointments', 'Gels', 'Drops', 'Eye Drops', 'Ear Drops', 'Inhalers', 'Sachets', 'Suppositories', 'Pessaries', 'Lotions', 'Powders', 'Devices', 'Surgicals', 'Cosmetics', 'Supplements', 'Sundries', 'Others'];
const EXPENSE_CATS = ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Licenses & Fees', 'Repairs', 'Stationery', 'Other'];
const TABLES = ['products', 'formulations', 'customers', 'suppliers', 'sales', 'proformas', 'purchases', 'movements', 'prescriptions', 'expenses', 'expenseCategories', 'banks', 'bankTx', 'loans', 'payments', 'users', 'batches', 'branches', 'transfers', 'audit', 'purchaseOrders', 'roles', 'messages', 'shifts', 'license'];
const d = Object.fromEntries(TABLES.map((t) => [t, []]));
const forms = new Set([...FORMS, ...cat.forms]);
const FORM_MAP = { 'N/A': 'Others', Inhaler: 'Inhalers', Specials: 'Others', Generals: 'Sundries' };
d.expenseCategories = EXPENSE_CATS.map((name) => ({ id: 'expcat-' + slug(name), name, updatedAt: t0 }));
d.customers = [{ id: 'walk-in', name: 'Walk-in Customer', phone: '', updatedAt: t0 }];
d.banks = [{ id: 'cash-drawer', name: 'Cash at hand', account: '', opening: 0, updatedAt: t0 }];
d.branches = [{ id: 'main', name: 'Main branch', address: '', updatedAt: t0 }];

// ---------- medicines: the standard catalog, with Pharmcare prices and items laid over it ----------
const used = new Set();
const barcode = (b) => {
  if (b && !used.has(b)) { used.add(b); return b; }
  for (;;) { const c = '20' + String(crypto.randomInt(1e10)).padStart(10, '0'); if (!used.has(c)) { used.add(c); return c; } }
};
const byName = new Map();
cat.rows.forEach(([name, generic, form, price, wholesale, cost, code, unit], i) => {
  const p = { id: 'cat-' + (i + 1), name, generic, form, price, wholesale: wholesale || price, cost: cost || Math.round((wholesale || price) * 0.8), barcode: barcode(code), unit, reorder: 0, updatedAt: at, fromCatalog: true };
  d.products.push(p);
  if (!byName.has(norm(name))) byName.set(norm(name), p);
});
let matched = 0, added = 0;
const fromRx = new Set();
for (const m of ex.medicines) {
  const form = FORM_MAP[m.type] || m.type || 'Others';
  forms.add(form);
  const retail = num(m.retail), wholesale = num(m.wholesale) || retail;
  const fields = { generic: m.generic || '', form, price: retail, wholesale, cost: Math.round(wholesale * 0.8), reorder: num(m.min), rxCode: m.code };
  const hit = byName.get(norm(m.name));
  if (hit && !fromRx.has(hit.id)) { Object.assign(hit, fields, { name: m.name.trim() }); fromRx.add(hit.id); matched++; }
  else {
    const p = { id: 'rx-' + m.code, name: m.name.trim(), unit: 'Unit', barcode: barcode(''), updatedAt: at, ...fields };
    d.products.push(p); fromRx.add(p.id);
    if (!byName.has(norm(m.name))) byName.set(norm(m.name), p);
    added++;
  }
}
d.formulations = [...forms].map((name) => ({ id: 'form-' + slug(name), name, updatedAt: t0 }));

// ---------- opening stock: batches with expiry where Pharmcare had them, the rest as an opening lot ----------
const lots = new Map();
for (const e of [...(ex.expiry || []), ...(ex.expired || [])]) {
  const k = norm(e['Brand Name']);
  if (!lots.has(k)) lots.set(k, []);
  lots.get(k).push({ batch: String(e['Batch No'] || '').trim(), expiry: e['Expiry Date'] || '', qty: num(e['Quantity Left']), cost: num(e.Cost) });
}
let stockLines = 0, units = 0, newFromStock = 0;
const move = (productId, qty, batchId) => d.movements.push({ id: id('mv'), productId, qty, type: 'Opening stock', ref: 'Pharmcare', note: 'Opening stock brought over from Pharmcare', user: 'Data import', batchId, branchId: 'main', date: at, updatedAt: at });
for (const r of ex.inventory) {
  const qty = num(r.qty);
  if (qty <= 0) continue;
  let p = byName.get(norm(r.name));
  if (!p) { // in stock but missing from the medicine list: add it so the stock is not lost (price to be set)
    p = { id: id('rx'), name: r.name.trim(), generic: r.generic || '', form: 'Others', price: 0, wholesale: 0, cost: 0, reorder: 0, unit: 'Unit', barcode: barcode(''), updatedAt: at, needsPrice: true };
    d.products.push(p); byName.set(norm(r.name), p); newFromStock++;
  }
  let left = qty;
  for (const l of lots.get(norm(r.name)) || []) {
    if (left <= 0) break;
    const take = Math.min(left, l.qty);
    if (take <= 0) continue;
    const b = { id: id('bt'), productId: p.id, batch: l.batch || 'PC-' + day.replace(/-/g, ''), expiry: l.expiry, cost: l.cost, received: day, updatedAt: at };
    d.batches.push(b); move(p.id, take, b.id); left -= take;
    if (l.cost && !p.costFromBatch) { p.cost = l.cost; p.costFromBatch = true; }
  }
  if (left > 0) {
    const b = { id: id('bt'), productId: p.id, batch: 'OPENING', expiry: '', cost: p.cost || 0, received: day, updatedAt: at };
    d.batches.push(b); move(p.id, left, b.id);
  }
  stockLines++; units += qty;
}
// Reorder levels only for medicines the pharmacy actually keeps (its inventory list), so low-stock alerts stay meaningful
const kept = new Set(ex.inventory.map((r) => byName.get(norm(r.name))?.id).filter(Boolean));
d.products.forEach((p) => { delete p.costFromBatch; if (!kept.has(p.id)) p.reorder = 0; });

// ---------- customers & suppliers ----------
const hidden = (s) => (/email.?protected/i.test(s || '') ? '' : String(s || '').trim());
for (const c of ex.customers || []) {
  if (!c.Name || /^client$/i.test(c.Name.trim())) continue;
  d.customers.push({ id: id('cu'), name: c.Name.trim(), phone: String(c['Phone No.'] || '').trim(), email: hidden(c.Email), address: c.Address || '', notes: c.Notes || '', updatedAt: at });
}
for (const s of ex.suppliers || []) {
  d.suppliers.push({ id: id('su'), name: s.Name.trim(), contact: s['Contact Person'] || '', phone: String(s.Phone || '').trim(), email: hidden(s['E-mail']), address: s.Address || '', updatedAt: at });
}

// ---------- staff: same people and levels; Pharmcare passwords cannot be read, so each gets a temporary one ----------
const ROLE = { administrator: 'admin', manager: 'manager', dispenser: 'dispenser', cashier: 'cashier', pharmacist: 'pharmacist' };
// Pharmcare hides staff emails; real ones can be given in <outDir>/staff-emails.json as { "Full Name": "email" }
const emailsFile = path.join(outDir, 'staff-emails.json');
const KNOWN_EMAIL = Object.fromEntries(Object.entries(fs.existsSync(emailsFile) ? JSON.parse(fs.readFileSync(emailsFile, 'utf8')) : {}).map(([k, v]) => [norm(k), v]));
const words = ['Amber', 'Cedar', 'Coral', 'Delta', 'Ember', 'Falcon', 'Harbor', 'Indigo', 'Jade', 'Kestrel', 'Lotus', 'Maple', 'Nova', 'Orchid', 'Pine', 'Quartz', 'River', 'Sage', 'Tulip', 'Willow'];
const pbkdf2 = (pw) => { const salt = crypto.randomBytes(16); return { algo: 'pbkdf2', salt: salt.toString('base64'), hash: crypto.pbkdf2Sync(pw, salt, 100000, 32, 'sha256').toString('hex') }; };
const creds = [];
for (const u of ex.users || []) {
  const name = String(u['Full Name'] || '').trim();
  if (!name) continue;
  const email = hidden(u['E-mail']) || KNOWN_EMAIL[norm(name)] || slug(name).replace(/-+/g, '.').replace(/^\.|\.$/g, '') + '@pharmcare.local';
  const pw = words[crypto.randomInt(words.length)] + '-' + crypto.randomInt(1000, 9999) + '-' + words[crypto.randomInt(words.length)];
  d.users.push({ id: id('us'), name, email: email.toLowerCase(), role: ROLE[norm(u['User Group'])] || 'cashier', phone: '', ...pbkdf2(pw), mustChangePassword: true, updatedAt: at });
  creds.push(`${name.padEnd(20)} ${email.toLowerCase().padEnd(36)} ${pw}`);
}

d.audit.push({ id: id('au'), date: at, user: 'Data import', action: 'Data brought over from Pharmcare', details: `${d.products.length} medicines, ${stockLines} stock lines, ${d.customers.length - 1} customers, ${d.suppliers.length} suppliers, ${d.users.length} staff`, branchId: 'main', updatedAt: at });
d.settings = { name: pharmacyName, currency: 'UGX', decimals: 0, updatedAt: at };
d._tomb = [];
const pack = { ...d, _meta: { source: 'pharmcare.rxtera.com', exportedAt: ex.exportedAt, builtAt: at } };

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'rxpos-pharmcare-data.json'), JSON.stringify(pack));
fs.writeFileSync(path.join(outDir, 'staff-temporary-passwords.txt'),
  `RxPOS (Pharmcare edition) - temporary sign-in passwords, created ${day}\r\n` +
  `Give each person theirs privately; RxPOS asks them to choose their own the first time they sign in (they can change it later with the key button beside their name).\r\n` +
  `Emails ending @pharmcare.local are placeholders: replace them with real ones in Users & Roles so password recovery works.\r\n\r\n` +
  creds.join('\r\n') + '\r\n');
console.log(JSON.stringify({ products: d.products.length, pharmcareMatchedToCatalog: matched, pharmcareAdded: added, addedFromStockOnly: newFromStock, stockLines, units, batches: d.batches.length, customers: d.customers.length - 1, suppliers: d.suppliers.length, staff: d.users.length }));
