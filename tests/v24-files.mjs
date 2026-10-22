// File-upload hardening (security review 0.4): no SVG, magic-byte check, nosniff + CSP, attachment for non-raster.
//   node v24-files.mjs <base> <ownerKey> <outDir>
import { Buffer } from 'node:buffer';
const [base, ownerKey] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: JSON.stringify(body) }).then((r) => r.json());
const login = (email, pw, slug) => fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, tenant: slug }) }).then((r) => r.json());

const t = await owner('/tenants', { name: 'File Pharmacy', admin: { name: 'Fi Admin', email: 'fi@test.rx', password: 'fi-pass-1234' } });
const slug = t.tenant.slug, tid = t.tenant.id;
const tok = (await login('fi@test.rx', 'fi-pass-1234', slug)).token;
check('signed in', !!tok);

let idn = 0;
const upload = (type, name, bytes) => { const data = Buffer.from(bytes).toString('base64'); const id = 'file' + (idn++) + 'abcdef'; return fetch(base + '/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ id, n: 0, chunks: 1, size: bytes.length, name, type, data }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({})) ) })); };
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 1];

let r = await upload('image/svg+xml', 'x.svg', Buffer.from('<svg onload="alert(1)"></svg>'));
check('0.4 SVG upload is rejected (415)', r.status === 415, r.status + ' ' + (r.error || ''));
r = await upload('image/png', 'fake.png', Buffer.from('<script>alert(1)</script>'));
check('0.4 a .png that is really HTML is rejected (magic bytes)', r.status === 415, r.status);
r = await upload('image/png', 'ok.png', PNG);
check('0.4 a real PNG is accepted', r.done === true && !!r.path, JSON.stringify(r));
const pngPath = r.path;
r = await upload('image/gif', 'ok.gif', GIF);
check('0.4 a real GIF is accepted', r.done === true, JSON.stringify(r));
r = await upload('application/pdf', 'doc.pdf', Buffer.from('%PDF-1.4\n%abc'));
check('a PDF is still accepted', r.done === true, JSON.stringify(r));
const pdfPath = r.path;

// serve headers
let res = await fetch(base + pngPath);
check('0.4 PNG served with nosniff', res.headers.get('x-content-type-options') === 'nosniff');
check('0.4 PNG served with a locked-down CSP', /sandbox/.test(res.headers.get('content-security-policy') || ''), res.headers.get('content-security-policy'));
check('0.4 PNG (raster) shown inline', /inline/.test(res.headers.get('content-disposition') || ''), res.headers.get('content-disposition'));
res = await fetch(base + pdfPath);
check('0.4 PDF (non-raster) forced to download (attachment)', /attachment/.test(res.headers.get('content-disposition') || ''), res.headers.get('content-disposition'));
check('0.4 PDF also nosniff', res.headers.get('x-content-type-options') === 'nosniff');

await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
