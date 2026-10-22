// Security headers on the served site (review 0.7). Also checks the entry HTML has no inline <script>.
//   node v25-headers.mjs <base> <ownerKey> <outDir>
const [base] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 160) : ''}`); };

const res = await fetch(base + '/');
const h = (k) => res.headers.get(k) || '';
const csp = h('content-security-policy');
check('serves a Content-Security-Policy', !!csp, csp.slice(0, 80));
check('CSP default-src is self', /default-src 'self'/.test(csp));
check('CSP forbids framing (frame-ancestors none)', /frame-ancestors 'none'/.test(csp));
check("CSP script-src has no 'unsafe-inline'", /script-src/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), csp.match(/script-src[^;]*/)?.[0]);
check('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff');
check('X-Frame-Options DENY', /DENY/i.test(h('x-frame-options')));
check('Strict-Transport-Security present', /max-age=\d+/.test(h('strict-transport-security')));
const html = await res.text();
const inline = [...html.matchAll(/<script(\s[^>]*)?>/gi)].filter((m) => !/\ssrc=/.test(m[1] || ''));
check('entry HTML has no inline <script>', inline.length === 0, 'inline scripts: ' + inline.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
