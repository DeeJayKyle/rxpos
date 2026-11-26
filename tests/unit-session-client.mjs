// The app's side of renewable sign-ins (src/session.js), with a pretend cloud: a pass close to running out is renewed
// once (two calls at the same moment share the renewal), saved with the device's link, kept as it is offline, and an
// ended sign-in drops its key so the next call says "sign in again".
//   node unit-session-client.mjs
import { freshCfg, passExpiry, registerSession, resetSessionForTests } from '../src/session.js';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' && !ok ? '  ' + String(x) : ''}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const passFor = (ms, sid = 's1') => 'u.' + b64({ sub: 'u1', sid, exp: Date.now() + ms }) + '.sig';

let calls = 0, reply = null;
globalThis.fetch = async (url, init) => { calls++; const r = typeof reply === 'function' ? reply(url, init) : reply; if (r instanceof Error) throw r; return { ok: r.status === 200, status: r.status, json: async () => r.body }; };
let stored = null;
const link = (cfg) => { stored = cfg; registerSession({ get: () => stored, save: async (c) => { stored = c; } }); return cfg; };

check('the expiry is read from the pass', Math.abs(passExpiry(passFor(60000)) - Date.now() - 60000) < 1000 && passExpiry('sync-key') === 0);

// a pass with plenty of time left: nothing is asked
let cfg = link({ url: 'https://cloud', key: passFor(10 * 60000), refresh: 'r.s1.a', sid: 's1' });
calls = 0;
check('a pass with time left is used as it is', (await freshCfg(cfg)).key === cfg.key && calls === 0);

// about to run out: renewed once, even when asked twice at the same moment, and saved
cfg = link({ url: 'https://cloud', key: passFor(30000), refresh: 'r.s1.a', sid: 's1', cursor: 7 });
const fresh = passFor(15 * 60000);
reply = { status: 200, body: { token: fresh, refresh: 'r.s1.b', sid: 's1' } }; calls = 0;
const [x, y] = await Promise.all([freshCfg(cfg), freshCfg(cfg)]);
check('a pass about to run out is renewed', x.key === fresh && x.refresh === 'r.s1.b');
check('…once for two calls at the same moment', calls === 1 && y.key === fresh, calls);
check('…and saved with the device\'s link, the rest kept', stored.key === fresh && stored.refresh === 'r.s1.b' && stored.cursor === 7);
check('a call holding the old pass of the same sign-in gets the new one without asking', (calls = 0, (await freshCfg(cfg)).key === fresh) && calls === 0);

// offline or the cloud is down: kept as it is (the till never waits)
cfg = link({ url: 'https://cloud', key: passFor(1000), refresh: 'r.s1.c', sid: 's1' });
reply = new TypeError('fetch failed');
check('the cloud can\'t be reached: the device keeps its pass and key', (await freshCfg(cfg)).refresh === 'r.s1.c' && stored.refresh === 'r.s1.c');
reply = { status: 500, body: {} };
check('a cloud error: tried again next time, nothing dropped', (await freshCfg(cfg)).refresh === 'r.s1.c');

// another window renewed it a moment ago (409): take what it saved
cfg = link({ url: 'https://cloud', key: passFor(1000), refresh: 'r.s1.d', sid: 's1' });
reply = () => { stored = { ...stored, key: fresh, refresh: 'r.s1.e' }; return { status: 409, body: { renewed: true } }; };
check('"already renewed": the pass the other window saved is used', (await freshCfg(cfg)).refresh === 'r.s1.e');

// the sign-in ended in the cloud
cfg = link({ url: 'https://cloud', key: passFor(1000), refresh: 'r.s1.f', sid: 's1' });
reply = { status: 401, body: { error: 'This sign-in has ended. Sign in again.' } };
const ended = await freshCfg(cfg);
check('an ended sign-in drops its renewal key', !ended.refresh && !stored.refresh);
calls = 0;
check('…and is not asked again', (await freshCfg(ended)).key === ended.key && calls === 0);

// relinked while a renewal was on its way: the new link is not overwritten
cfg = link({ url: 'https://cloud', key: passFor(1000), refresh: 'r.s1.g', sid: 's1' });
reply = () => { stored = { url: 'https://cloud', key: 'u.other.sig', refresh: 'r.s9.z', sid: 's9' }; return { status: 200, body: { token: fresh, refresh: 'r.s1.h', sid: 's1' } }; };
await freshCfg(cfg);
check('a renewal never overwrites a newer sign-in on the device', stored.sid === 's9' && stored.refresh === 'r.s9.z');

// an app from before: its long pass is swapped once
resetSessionForTests();
cfg = link({ url: 'https://cloud', key: passFor(20 * 864e5, undefined) });
let sent = null;
reply = (url, init) => { sent = init; return { status: 200, body: { token: fresh, refresh: 'r.s2.a', sid: 's2' } }; };
const swapped = await freshCfg(cfg);
check('a long pass from before is swapped for a renewable sign-in', swapped.refresh === 'r.s2.a' && /Bearer u\./.test(sent.headers.Authorization || '') && stored.sid === 's2');
cfg = link({ url: 'https://cloud', key: passFor(20 * 864e5, undefined) });
reply = { status: 404, body: {} }; calls = 0;
await freshCfg(cfg);
check('an older cloud without renewal: asked once, the long pass kept', stored.swapTried === true && !stored.refresh && (calls = 0, await freshCfg(stored), calls === 0));

// a pharmacy sync key never runs out
calls = 0;
check('a pharmacy sync key is never renewed', (await freshCfg(link({ url: 'https://cloud', key: 'pharmacy-sync-key-123' }))).key === 'pharmacy-sync-key-123' && calls === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
