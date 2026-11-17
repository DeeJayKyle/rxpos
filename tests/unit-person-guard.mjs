// Audit P2-7, option 1 (src/cloud.js): a device holding another person's sign-in token still syncs, but a call that acts
// as a person (two-step sign-in, sessions, links, sending reports) asks the person signed in to confirm first.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'node' }, configurable: true });
const { borrowedToken, setPersonGuard, twoStep, endOtherSessions, cloudConfig, daySummary } = await import('../src/cloud.js');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };
const sent = [];
globalThis.fetch = async (url, o) => { sent.push([url, o.headers.Authorization]); return new Response('{}', { status: 200 }); };
const cfg = { url: 'https://cloud.test', key: 'u.ann-token', keyUser: 'ann', tenant: 't1' };

check('the token is the signed-in person\'s own', !borrowedToken(cfg, 'ann'));
check('someone else unlocked the device: borrowed', borrowedToken(cfg, 'bob'));
check('a device from before (no owner kept): borrowed, so each person confirms once', borrowedToken({ ...cfg, keyUser: undefined }, 'ann'));
check('a pharmacy sync key belongs to no one: never borrowed', !borrowedToken({ ...cfg, key: 's.pharmacy-key' }, 'bob'));

let asked = 0;
setPersonGuard(async (c) => { asked++; if (!borrowedToken(c, 'bob')) return c; return { ...c, key: 'u.bob-token', keyUser: 'bob' }; });
await twoStep(cfg);
check('a personal call asks first, then goes with the person\'s own token', asked === 1 && sent.at(-1)[1] === 'Bearer u.bob-token', JSON.stringify(sent.at(-1)));
await cloudConfig(cfg);
check('a till call (settings, payments, sync) is not held up', asked === 1 && sent.at(-1)[1] === 'Bearer u.ann-token');
await daySummary(cfg, false);
check('previewing the day summary needs no confirmation; sending it does', asked === 1 && (await daySummary(cfg, true), asked === 2));
setPersonGuard(async () => { throw new Error('Not done: it needs your own password on this device.'); });
const n = sent.length;
const err = await endOtherSessions(cfg).then(() => '', (e) => e.message);
check('without the password nothing is sent', sent.length === n && /own password/.test(err), err);
setPersonGuard(null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
