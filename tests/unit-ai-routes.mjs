// The AI copilot and vision routes (worker/ai-routes.js) with a mocked Workers AI (env.AI): no Cloudflare account,
// no network. Two parts:
//   1. the module: answers cleaned to a strict shape whatever a model writes, permissions per mode, input limits,
//      telemetry scrubbed before it reaches a model, the fallback model when the first one fails;
//   2. through the whole cloud (worker/index.js in Node on a throw-away libSQL file, as worker/test-harness.mjs does):
//      sign-in required, 503 when the cloud has no AI (a self-hosted hub), 403 when the owner switched AI off.
// Fictional pharmacy and medicines only.   node unit-ai-routes.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { createClient } from '@libsql/client';
import { CLAUDE_MODEL, claudeOn, textLayer } from '../worker/claude-reader.js';
import { aiRoutes, idleRoutes, cleanIdleCards, IDLE_SUBJECTS, IMAGE_MODEL, cleanCommand, cleanInvoiceLines, cleanPrescription, cleanDiagnosis, scrubTelemetry, isoExpiry, COPILOT_MODEL, VISION_MODEL, FALLBACK_MODEL } from '../worker/ai-routes.js';

crypto.subtle.timingSafeEqual ??= (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let passed = 0, failed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log('PASS ', name); }
  catch (e) { failed++; console.log('FAIL ', name, ' ', String(e?.message || e).slice(0, 300)); }
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
/** A fake Workers AI: answers by model, records every call */
const fakeAi = (answers) => {
  const calls = [];
  return { calls, run: async (model, input) => { calls.push({ model, input }); const a = answers[model]; if (a instanceof Error) throw a; return { response: typeof a === 'function' ? a(input) : a }; } };
};
const all = async () => true;
const none = async () => false;
const only = (...perms) => async (p) => perms.includes(p);
const call = async (env, p, body, can = all, opts) => { const r = await aiRoutes(env, p, body, can, json, opts); return { status: r.status, j: await r.json() }; };
/** A fake Anthropic client (env.CLAUDE): answers in order, records every request */
const fakeClaude = (...answers) => {
  const calls = [];
  return { calls, beta: { messages: { create: async (req) => {
    calls.push(req);
    const a = answers[Math.min(calls.length, answers.length) - 1];
    if (a instanceof Error) throw a;
    return typeof a === 'object' ? a : { stop_reason: 'end_turn', content: [{ type: 'text', text: a }] };
  } } } };
};
const PNG = 'data:image/png;base64,' + Buffer.from('fake image bytes').toString('base64');

// ---------------- 1. the module ----------------
await ok('a till command becomes ADD_ITEMS with clean names, quantities and units', async () => {
  const env = { AI: fakeAi({ [COPILOT_MODEL]: 'Sure! {"action":"ADD_ITEMS","items":[{"name":"Paracetamol 500mg","qty":"2","unit":"Strips"},{"name":"ORS","qty":0,"unit":"sachet"},{"name":""}]}' }) };
  const { status, j } = await call(env, '/api/ai/copilot', { mode: 'command', text: 'add 2 strips of paracetamol and one ORS' });
  assert.equal(status, 200);
  assert.equal(j.action, 'ADD_ITEMS');
  assert.deepEqual(j.items, [{ name: 'Paracetamol 500mg', qty: 2, unit: 'strip' }, { name: 'ORS', qty: 1, unit: 'tablet' }]);
  assert.equal(j.model, COPILOT_MODEL);
  assert.equal(env.AI.calls[0].input.messages[1].content, 'add 2 strips of paracetamol and one ORS');
});
await ok('NAVIGATE only to a page of the app; anything else is NONE', async () => {
  assert.deepEqual(cleanCommand({ action: 'navigate', to: '/inventory' }), { action: 'NAVIGATE', to: '/inventory', label: 'Inventory' });
  assert.equal(cleanCommand({ action: 'NAVIGATE', to: 'https://evil.example/' }).action, 'NONE');
  assert.equal(cleanCommand({ action: 'DELETE_ALL' }).action, 'NONE');
  assert.equal(cleanCommand({ action: 'ADD_ITEMS', items: Array.from({ length: 50 }, (_, i) => ({ name: 'Med ' + i, qty: 99999 })) }).items.length, 20);
  assert.equal(cleanCommand({ action: 'ADD_ITEMS', items: [{ name: 'X', qty: 99999 }] }).items[0].qty, 1000);
});
await ok('a command needs permission to sell, and some text', async () => {
  const env = { AI: fakeAi({ [COPILOT_MODEL]: '{}' }) };
  assert.equal((await call(env, '/api/ai/copilot', { mode: 'command', text: 'add ORS' }, none)).status, 403);
  assert.equal((await call(env, '/api/ai/copilot', { mode: 'command', text: '   ' })).status, 400);
  assert.equal(env.AI.calls.length, 0, 'no model call for a refused request');
});
await ok('owner questions: answered from the facts sent, reorder lines cleaned; needs reports or stock permission', async () => {
  const env = { AI: fakeAi({ [COPILOT_MODEL]: '{"answer":"Batch AMX01 of MoxaForte expires in 40 days.","reorder":[{"name":"MoxaForte 500mg","qty":"300"},{"qty":5}]}' }) };
  const facts = { expiring: [{ name: 'MoxaForte 500mg', batch: 'AMX01', days: 40, qty: 120 }] };
  const { status, j } = await call(env, '/api/ai/copilot', { mode: 'ask', text: 'What expires soon?', facts }, only('inventory.view'));
  assert.equal(status, 200);
  assert.match(j.answer, /AMX01/);
  assert.deepEqual(j.reorder, [{ name: 'MoxaForte 500mg', qty: 300 }]);
  assert.match(env.AI.calls[0].input.messages[1].content, /AMX01/);
  assert.equal((await call(env, '/api/ai/copilot', { mode: 'ask', text: 'Profit?', facts }, only('pos.sell'))).status, 403);
  assert.equal((await call(env, '/api/ai/copilot', { mode: 'ask', text: 'x', facts: { big: 'x'.repeat(17000) } })).status, 413);
});
await ok('diagnosis: telemetry scrubbed before the model sees it; only known repairs come back', async () => {
  const env = { AI: fakeAi({ [COPILOT_MODEL]: '{"summary":"Sync is stuck on an old cursor.","causes":["Cursor older than the cloud history"],"actions":["reset-sync-cursor","rm -rf /","test-connection","reset-sync-cursor"]}' }) };
  const telemetry = { queueDepth: 42, lastError: 'Sync failed for joan@kireka.example token eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop phone 0772 123 456', password: 'hunter2', userName: 'Joan', errors: ['E1', 'E2'] };
  const { status, j } = await call(env, '/api/ai/copilot', { mode: 'diagnose', telemetry }, none);
  assert.equal(status, 200, 'any signed-in person may ask about their own device');
  assert.deepEqual(j.actions, ['reset-sync-cursor', 'test-connection']);
  assert.equal(j.causes.length, 1);
  const sent = env.AI.calls[0].input.messages[1].content;
  for (const bad of ['joan@kireka.example', 'eyJhbGci', '0772 123 456', 'hunter2', 'Joan']) assert.ok(!sent.includes(bad), 'leaked: ' + bad);
  assert.match(sent, /"queueDepth":42/);
});
await ok('scrubTelemetry drops secret and personal fields, keeps numbers and code locations', () => {
  const s = scrubTelemetry({ pin: '1234', apiKey: 'k', stack: 'at sync.js:120:14', n: 3, nested: { email: 'a@b.co', depth: 7 } });
  assert.deepEqual(s, { stack: 'at sync.js:120:14', n: 3, nested: { depth: 7 } });
});
await ok('vision invoice: strict lines (ISO expiry, whole boxes and units, UGX unit cost); needs stock.receive', async () => {
  const env = { AI: fakeAi({ [VISION_MODEL]: '[{"name":"MoxaForte 500mg Caps 10x10","batch":"AMX2405","expiry":"06/2028","boxes":"10","unitsPerBox":"100","unitCostUGX":"UGX 185"},{"name":"ORS Sachets","expiry":"31/12/2027","boxes":2,"unitsPerBox":0,"unitCostUGX":-5}]' }) };
  const { status, j } = await call(env, '/api/ai/vision', { mode: 'invoice', image: PNG }, only('stock.receive'));
  assert.equal(status, 200);
  assert.deepEqual(j.lines[0], { name: 'MoxaForte 500mg Caps 10x10', batch: 'AMX2405', expiry: '2028-06-30', boxes: 10, unitsPerBox: 100, unitCostUGX: 185 });
  assert.equal(j.lines[1].expiry, '2027-12-31');
  assert.equal(j.lines[1].unitsPerBox, 1);
  assert.equal(j.lines[1].unitCostUGX, 5, 'the sign is dropped, never a negative cost');
  assert.ok(Array.isArray(env.AI.calls[0].input.image) && env.AI.calls[0].input.image.length > 0, 'the image goes to the model as bytes');
  assert.equal((await call(env, '/api/ai/vision', { mode: 'invoice', image: PNG }, only('pos.sell'))).status, 403);
});
await ok('vision prescription: patient, prescriber and items; sellers or dispensers only', async () => {
  const env = { AI: fakeAi({ [VISION_MODEL]: '{"patient":"Test Patient","prescriber":"Dr Example","items":[{"name":"Amoxicillin 500mg","qty":"15","unit":"caps"},{"name":"Paracetamol 500mg","quantity":10,"unit":"strip"}]}' }) };
  const { status, j } = await call(env, '/api/ai/vision', { mode: 'prescription', image: PNG }, only('prescriptions'));
  assert.equal(status, 200);
  assert.equal(j.patient, 'Test Patient');
  assert.deepEqual(j.items, [{ name: 'Amoxicillin 500mg', qty: 15, unit: 'tablet' }, { name: 'Paracetamol 500mg', qty: 10, unit: 'strip' }]);
  assert.equal((await call(env, '/api/ai/vision', { mode: 'prescription', image: PNG }, only('reports'))).status, 403);
});
await ok('vision refuses a bad mode, a non-image and an oversized image before any model call', async () => {
  const env = { AI: fakeAi({}) };
  assert.equal((await call(env, '/api/ai/vision', { mode: 'selfie', image: PNG })).status, 400);
  assert.equal((await call(env, '/api/ai/vision', { mode: 'invoice', image: 'data:text/html;base64,PHNjcmlwdD4=' })).status, 400);
  assert.equal((await call(env, '/api/ai/vision', { mode: 'invoice', image: 'data:image/png;base64,' + 'A'.repeat(2_900_000) })).status, 400);
  assert.equal(env.AI.calls.length, 0);
});
await ok('when the first model fails, the fallback model answers', async () => {
  const env = { AI: fakeAi({ [VISION_MODEL]: new Error('capacity exceeded'), [FALLBACK_MODEL]: '{"patient":"","prescriber":"","items":[{"name":"ORS","qty":2}]}' }) };
  const { status, j } = await call(env, '/api/ai/vision', { mode: 'prescription', image: PNG });
  assert.equal(status, 200);
  assert.equal(j.model, FALLBACK_MODEL);
  assert.equal(env.AI.calls[1].input.messages[0].content[1].type, 'image_url', 'the fallback gets the image the way it reads it');
});
await ok('Claude reads first when the cloud has it: the image as base64, the strict shape, Claude named as the reader', async () => {
  const env = { AI: fakeAi({}), CLAUDE: fakeClaude('Here it is: {"patient":"Test Patient","prescriber":"Dr Example","items":[{"name":"Amoxicillin 500mg","qty":"15","unit":"caps"}],"extra":"dropped"}') };
  const { status, j } = await call(env, '/api/ai/vision', { mode: 'prescription', image: PNG }, all, { claude: true });
  assert.equal(status, 200);
  assert.deepEqual(j, { patient: 'Test Patient', prescriber: 'Dr Example', items: [{ name: 'Amoxicillin 500mg', qty: 15, unit: 'tablet' }], model: CLAUDE_MODEL });
  const req = env.CLAUDE.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.messages[0].content[0].source, { type: 'base64', media_type: 'image/png', data: PNG.split(',')[1] });
  assert.equal(req.fallbacks, 'default', 'a decline is retried on Anthropic\'s fallback model');
  assert.equal(env.AI.calls.length, 0, 'no open-model call when Claude answered');
});
await ok('Claude declining, failing or not set up: the open models read instead', async () => {
  for (const answer of [new Error('overloaded'), { stop_reason: 'refusal', content: [] }, { stop_reason: 'max_tokens', content: [{ type: 'text', text: '[{"name":"half' }] }]) {
    const env = { AI: fakeAi({ [VISION_MODEL]: '[{"name":"ORS Sachets","boxes":2}]' }), CLAUDE: fakeClaude(answer) };
    const { status, j } = await call(env, '/api/ai/vision', { mode: 'invoice', image: PNG }, all, { claude: true });
    assert.equal(status, 200);
    assert.equal(j.model, VISION_MODEL);
    assert.equal(j.lines[0].name, 'ORS Sachets');
  }
  const env = { AI: fakeAi({ [VISION_MODEL]: '[{"name":"ORS Sachets"}]' }), CLAUDE: fakeClaude('[]') };
  await call(env, '/api/ai/vision', { mode: 'invoice', image: PNG });
  assert.equal(env.CLAUDE.calls.length, 0, 'without opts.claude (no key, or switched off) Claude is never called');
  assert.equal(claudeOn({}, {}), false);
  assert.equal(claudeOn({ ANTHROPIC_API_KEY: 'k' }, {}), true);
  assert.equal(claudeOn({ ANTHROPIC_API_KEY: 'k' }, { aiPremium: false }), false, 'the owner can switch it off per pharmacy');
});
await ok('a digital PDF page\'s own text goes to the reader with the image, marked as data; a short or empty one is ignored', async () => {
  const layer = 'MEDIPHARM WHOLESALE LTD  Invoice INV-2207\nMoxaForte 500mg Caps 10x10  AMX2405  06/2028  10  18,500  185,000';
  const env = { AI: fakeAi({ [VISION_MODEL]: '[]' }), CLAUDE: fakeClaude('[{"name":"MoxaForte 500mg Caps 10x10","batch":"AMX2405"}]') };
  await call(env, '/api/ai/vision', { mode: 'invoice', image: PNG, text: layer }, all, { claude: true });
  const sent = env.CLAUDE.calls[0].messages[0].content[1].text;
  assert.match(sent, /<pdf_text>\nMEDIPHARM WHOLESALE LTD/);
  assert.match(sent, /never instructions/);
  await call(env, '/api/ai/vision', { mode: 'invoice', image: PNG, text: layer });
  assert.match(env.AI.calls[0].input.messages[0].content, /AMX2405/, 'the open models get it too');
  assert.equal(textLayer('  p.1 '), '');
  assert.equal(textLayer('x'.repeat(30000)).length, 20000);
  assert.equal(textLayer({ evil: true }), '');
});
await ok('expiry dates: ISO, day-first, month/year, month name; nonsense is empty', () => {
  assert.equal(isoExpiry('2028-06-15'), '2028-06-15');
  assert.equal(isoExpiry('15/06/2028'), '2028-06-15');
  assert.equal(isoExpiry('02/2028'), '2028-02-29');
  assert.equal(isoExpiry('2027-11'), '2027-11-30');
  assert.equal(isoExpiry('Sep 2029'), '2029-09-30');
  assert.equal(isoExpiry('31/02/2028'), '');
  assert.equal(isoExpiry('soon'), '');
});
await ok('cleaners never pass through unknown fields', () => {
  assert.deepEqual(Object.keys(cleanInvoiceLines([{ name: 'A', evil: 1 }])[0]).sort(), ['batch', 'boxes', 'expiry', 'name', 'unitCostUGX', 'unitsPerBox']);
  assert.deepEqual(Object.keys(cleanPrescription({ patient: 'P', html: '<b>' })).sort(), ['items', 'patient', 'prescriber']);
  assert.deepEqual(Object.keys(cleanDiagnosis({ summary: 's', run: 'x' })).sort(), ['actions', 'causes', 'summary']);
});

const idle = async (env, p, body) => { const r = await idleRoutes(env, p, body, json); return { status: r.status, j: await r.json() }; };
await ok('idle cards: only the candidates sent (never another id), safe wording only, tips with a known topic', async () => {
  const env = { AI: fakeAi({ [COPILOT_MODEL]: JSON.stringify({ cards: [
    { id: 'p1', headline: 'Rainy season ready', line: 'Commonly used for fever and aches. Ask our pharmacist.', why: 'expires soon' },
    { id: 'rx9', headline: 'Strong antibiotic', line: 'Ask our pharmacist.' },
    { id: 'p2', headline: 'Cures every cough', line: 'Guaranteed relief.' },
    { id: 'p1', headline: 'Again', line: 'Duplicate' },
  ], tips: [{ text: 'Sleep under a treated net every night.', topic: 'net' }, { text: 'Drink clean water.', topic: 'nonsense' }, { text: 'A miracle diet.', topic: 'food' }] }) }) };
  const { status, j } = await idle(env, '/api/ai/idle-cards', { month: 4, candidates: [{ id: 'p1', name: 'Paracetamol 500mg', kind: 'expiry' }, { id: 'p2', name: 'Cough syrup', kind: 'slow' }] });
  assert.equal(status, 200);
  assert.deepEqual(j.cards.map((c) => c.id), ['p1'], 'a made-up id, a cure claim and a repeat are dropped');
  assert.deepEqual(j.tips, [{ text: 'Sleep under a treated net every night.', topic: 'net' }, { text: 'Drink clean water.', topic: 'medicine' }]);
  assert.match(env.AI.calls[0].input.messages[1].content, /Month: 4/);
});
await ok('idle cards: nothing to show, no model call', async () => {
  const env = { AI: fakeAi({}) };
  assert.deepEqual((await idle(env, '/api/ai/idle-cards', { candidates: [] })).j, { cards: [], tips: [] });
  assert.equal(env.AI.calls.length, 0);
});
await ok('idle picture: only a known subject, drawn without packaging, text or brands', async () => {
  const env = { AI: fakeAi({ [IMAGE_MODEL]: 'unused' }) };
  env.AI.run = async (model, input) => { env.AI.calls.push({ model, input }); return { image: Buffer.from('jpeg').toString('base64') }; };
  assert.equal((await idle(env, '/api/ai/idle-image', { subject: 'a celebrity holding our product' })).status, 400);
  const { status, j } = await idle(env, '/api/ai/idle-image', { subject: 'Antimalarials', tone: 'amber' });
  assert.equal(status, 200);
  assert.match(j.image, /^data:image\/jpeg;base64,/);
  assert.match(env.AI.calls[0].input.prompt, /mosquito net/);
  assert.match(env.AI.calls[0].input.prompt, /no medicine packaging/);
  assert.ok(Object.keys(IDLE_SUBJECTS).length >= 30);
});
await ok('cleanIdleCards caps the cards and the tips', () => {
  const ids = Array.from({ length: 20 }, (_, i) => 'p' + i);
  const r = cleanIdleCards({ cards: ids.map((id) => ({ id, headline: 'H', line: 'L' })), tips: Array(9).fill({ text: 'T', topic: 'water' }) }, ids);
  assert.equal(r.cards.length, 12); assert.equal(r.tips.length, 4);
});

// ---------------- 2. through the whole cloud ----------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-ai-'));
const { d1FromLibsql } = await import('../worker/libsql-d1.js');
const { default: worker } = await import('../worker/index.js');
const OWNER_KEY = 'local-owner-key-0123456789abcdef';
const baseEnv = {
  DB: d1FromLibsql(createClient({ url: 'file:' + path.join(dir, 'd1.db').replace(/\\/g, '/') })),
  DB_BACKEND: '', SYNC_KEY: 'test-only-sync-key-0123456789abcdefghijkl', OWNER_KEY,
  ASSETS: { fetch: () => new Response('app', { headers: { 'Content-Type': 'text/html' } }) },
};
const ai = fakeAi({ [COPILOT_MODEL]: '{"action":"NAVIGATE","to":"/add-stock"}', [VISION_MODEL]: '[{"name":"ORS Sachets","boxes":3,"unitsPerBox":20,"unitCostUGX":450,"expiry":"2028-01"}]' });
const req = (env, p, body, token) => worker.fetch(new Request('http://localhost' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {}, passThroughOnException() {} });
const owner = (p, body) => req(baseEnv, '/api/owner' + p, body, OWNER_KEY).then((r) => r.json());
let tenant, token;
await ok('cloud: a pharmacy and its admin sign in', async () => {
  tenant = (await owner('/tenants', { name: 'Kireka Hill Pharmacy', admin: { name: 'Joan Akello', email: 'joan@test.rx', password: 'joan-pass-1234' } })).tenant;
  assert.ok(tenant?.id, 'tenant created');
  const r = await (await req(baseEnv, '/api/login', { email: 'joan@test.rx', password: 'joan-pass-1234', tenant: tenant.slug })).json();
  token = r.token;
  assert.ok(token, JSON.stringify(r).slice(0, 200));
});
await ok('cloud: no sign-in, no AI', async () => {
  const r = await req({ ...baseEnv, AI: ai }, '/api/ai/copilot', { mode: 'command', text: 'open add stock' });
  assert.equal(r.status, 401);
});
await ok('cloud: the copilot and vision answer through the worker for a signed-in admin', async () => {
  const c = await req({ ...baseEnv, AI: ai }, '/api/ai/copilot', { mode: 'command', text: 'open add stock' }, token);
  assert.equal(c.status, 200);
  assert.deepEqual(await c.json(), { action: 'NAVIGATE', to: '/add-stock', label: 'Add Stock', model: COPILOT_MODEL });
  const v = await req({ ...baseEnv, AI: ai }, '/api/ai/vision', { mode: 'invoice', image: PNG }, token);
  assert.equal(v.status, 200);
  assert.equal((await v.json()).lines[0].expiry, '2028-01-31');
});
await ok('cloud: without AI (a self-hosted hub) the routes say so with 503, nothing crashes', async () => {
  const r = await req(baseEnv, '/api/ai/copilot', { mode: 'command', text: 'open add stock' }, token);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /AI is not set up/);
});
await ok('cloud: with Claude set up, an invoice page is read by Claude and Mistral and cross-checked; a prescription by Claude', async () => {
  const MISTRAL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
  const open = fakeAi({ [MISTRAL]: '{"supplier":"Medipharm","items":[{"name":"MoxaForte 500mg Caps","qty":10,"unitCost":18500,"lineTotal":185000,"batch":"AMX2405"}],"total":185000}' });
  const claude = fakeClaude('{"supplier":"Medipharm Wholesale","invoiceNo":"INV-2207","items":[{"name":"MoxaForte 500mg Caps","qty":10,"unitCost":18500,"lineTotal":185000,"batch":"AMX2405"}],"total":185000}');
  const env = { ...baseEnv, AI: open, CLAUDE: claude };
  const r = await (await req(env, '/api/ai/invoice', { image: PNG, text: 'MEDIPHARM WHOLESALE LTD Invoice INV-2207 MoxaForte' }, token)).json();
  assert.deepEqual(r.models, [CLAUDE_MODEL, MISTRAL]);
  assert.equal(r.readings, 2);
  assert.equal(r.items[0].check.length, 0, 'both readings agree: nothing to check');
  assert.match(claude.calls[0].messages[0].content[1].text, /INV-2207/);
  assert.equal(open.calls.length, 1, 'Llama is not needed when Claude reads');
  const claudeRx = fakeClaude('{"patient":"Test Patient","medicines":[{"name":"Amoxicillin","strength":"500mg","frequency":"three times a day","unclear":false}]}');
  const p = await (await req({ ...baseEnv, AI: open, CLAUDE: claudeRx }, '/api/ai/prescription', { image: PNG }, token)).json();
  assert.equal(p.model, CLAUDE_MODEL);
  assert.equal(p.medicines[0].name, 'Amoxicillin');
});
await ok('cloud: the owner switching Claude off for a pharmacy leaves it on the open models', async () => {
  await owner('/tenants/' + tenant.id, { features: { aiPremium: false } });
  const MISTRAL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
  const claude = fakeClaude('{"medicines":[{"name":"X"}]}');
  const p = await (await req({ ...baseEnv, AI: fakeAi({ [MISTRAL]: '{"medicines":[{"name":"ORS"}]}' }), CLAUDE: claude }, '/api/ai/prescription', { image: PNG }, token)).json();
  assert.equal(p.model, MISTRAL);
  assert.equal(claude.calls.length, 0);
});
await ok('cloud: the owner switching AI off for the pharmacy stops the routes', async () => {
  await owner('/tenants/' + tenant.id, { features: { ai: false } });
  const r = await req({ ...baseEnv, AI: ai }, '/api/ai/vision', { mode: 'prescription', image: PNG }, token);
  assert.equal(r.status, 403);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
