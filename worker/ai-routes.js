// AI copilot and vision (Cloudflare Workers AI, open models), mounted under /api/ai/ by worker/index.js → ai(), which
// has already checked the sign-in, that this cloud has AI (env.AI; a self-hosted hub has none and answers 503) and
// that the owner hasn't switched AI off for the pharmacy. Here: each mode's permission, the input limits, and a strict
// shape for every answer: whatever a model writes, only the fields below, of the right type and range, reach a device.
//
//   POST /api/ai/copilot  { mode: 'command', text }                 → { action: 'ADD_ITEMS', items } | { action: 'NAVIGATE', to } | { action: 'NONE', reply }
//                         { mode: 'ask', text, facts }              → { answer, reorder: [{ name, qty }] }   (facts: worked out on the device)
//                         { mode: 'diagnose', text?, telemetry }    → { summary, causes: [], actions: [] }  (telemetry is scrubbed here)
//   POST /api/ai/vision   { mode: 'invoice', image }                → { lines: [{ name, batch, expiry, boxes, unitsPerBox, unitCostUGX }] }
//                         { mode: 'prescription', image }           → { patient, prescriber, items: [{ name, qty, unit }] }

export const COPILOT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
// When the first choice is busy or unavailable, the cloud's proven reader (also used for /api/ai/prescription)
export const FALLBACK_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

/** The pages a command may open (the app's routes; anything else is refused) */
export const NAV_ROUTES = {
  '/pos': 'Till (retail)', '/pos/wholesale': 'Till (wholesale)', '/add-stock': 'Add Stock', '/sales': 'Sales History',
  '/inventory': 'Inventory', '/': 'Dashboard', '/customers': 'Customers', '/suppliers': 'Suppliers', '/medicines': 'Medicine List',
  '/purchases': 'Purchase History', '/expiry': 'Expiring / Expired', '/shifts': 'Shifts & Cash-up', '/expenses': 'Expenses',
  '/reports': 'Reports', '/reorder': 'Reorder', '/settings': 'Settings', '/device': 'This device',
};
export const UNITS = ['tablet', 'strip', 'box'];
/** The repairs a diagnosis may suggest; each is a button on the device that asks before it does anything */
export const REPAIRS = ['compact-snapshots', 'reset-sync-cursor', 'test-connection', 'reload-app'];

/** The first JSON object or array in a model's answer (some models already return parsed JSON) */
export const firstJson = (text, open = '{') => {
  if (text && typeof text === 'object') {
    if (open === '[' && !Array.isArray(text)) return Object.values(text).find(Array.isArray) || [];
    return text;
  }
  text = String(text || '');
  const close = open === '{' ? '}' : ']';
  const a = text.indexOf(open), b = text.lastIndexOf(close);
  if (a < 0 || b < a) throw new Error('The AI answer could not be read. Try again.');
  return JSON.parse(text.slice(a, b + 1));
};

export async function runAi(env, model, input) {
  try { return await env.AI.run(model, input); }
  catch (e) {
    // Meta's licence for Llama 3.2 Vision has to be accepted once per account
    if (/agree/i.test(e.message)) { await env.AI.run(model, { prompt: 'agree' }).catch(() => {}); return env.AI.run(model, input); }
    throw e;
  }
}

/** Run with the first model; on an error, once more with the fallback. Returns { out, model } */
async function runWithFallback(env, first, input, fallbackInput = input) {
  try { return { out: await runAi(env, first, input), model: first }; }
  catch { return { out: await runAi(env, FALLBACK_MODEL, fallbackInput), model: FALLBACK_MODEL }; }
}

// ---- small, strict cleaners ----
// eslint-disable-next-line no-control-regex -- control characters out of model text on purpose
const str = (v, n = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, ''))); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const money = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const unitOf = (v) => {
  const u = String(v || '').toLowerCase();
  if (/box|pack|carton|bottle/.test(u)) return 'box';
  if (/strip|blister|card/.test(u)) return 'strip';
  return 'tablet';
};
/** An expiry as YYYY-MM-DD; month-and-year (06/2028, 2028-06, Jun 2028) is the last day of that month; '' when unreadable */
export function isoExpiry(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // day first, the Ugandan way
  if (m) return valid(+m[3], +m[2], +m[1]);
  const monthEnd = (y, mo) => valid(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate());
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); // 06/2028
  if (m) return monthEnd(+m[2], +m[1]);
  m = /^(\d{4})[/.-](\d{1,2})$/.exec(s); // 2028-06
  if (m) return monthEnd(+m[1], +m[2]);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = /^([a-z]{3})[a-z]*[\s/.-]*(\d{4})$/i.exec(s);
  if (m) { const mo = months.indexOf(m[1].toLowerCase()) + 1; if (mo) return monthEnd(+m[2], mo); }
  return '';
}
function valid(y, m, d) {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return '';
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? t.toISOString().slice(0, 10) : '';
}

/** Telemetry leaves the device already without personal data; this removes anything that still looks like it */
export const scrubText = (s, n = 400) => String(s ?? '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
  .replace(/\b(?:eyJ|Bearer\s+)[\w.-]{10,}/g, '[token]')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[key]')
  .replace(/\d[\d\s-]{7,}\d/g, '[n]')
  .replace(/\b\d{6,}\b/g, '[n]')
  .slice(0, n);
export function scrubTelemetry(v, depth = 0) {
  if (depth > 4) return null;
  if (v == null || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return scrubText(v);
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrubTelemetry(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 40)) {
      if (/pass|token|secret|key|pin|phone|email|name|address|patient/i.test(k)) continue; // never send these fields
      out[scrubText(k, 40)] = scrubTelemetry(x, depth + 1);
    }
    return out;
  }
  return null;
}

/** A model's command answer, reduced to what the till can act on */
export function cleanCommand(raw) {
  const a = String(raw?.action || '').toUpperCase();
  if (a === 'ADD_ITEMS') {
    const items = (Array.isArray(raw.items) ? raw.items : []).map((x) => ({ name: str(x?.name), qty: int(x?.qty, 1, 1000, 1), unit: unitOf(x?.unit) })).filter((x) => x.name).slice(0, 20);
    if (items.length) return { action: 'ADD_ITEMS', items };
  }
  if (a === 'NAVIGATE') {
    const to = String(raw.to || raw.route || '').trim();
    if (Object.hasOwn(NAV_ROUTES, to)) return { action: 'NAVIGATE', to, label: NAV_ROUTES[to] };
  }
  return { action: 'NONE', reply: str(raw?.reply || 'I could not turn that into an action. Try "add 2 strips of paracetamol".', 300) };
}
export function cleanAnswer(raw) {
  return {
    answer: str(raw?.answer, 1500),
    reorder: (Array.isArray(raw?.reorder) ? raw.reorder : []).map((x) => ({ name: str(x?.name), qty: int(x?.qty, 1, 100000, 1) })).filter((x) => x.name).slice(0, 30),
  };
}
export function cleanDiagnosis(raw) {
  return {
    summary: str(raw?.summary, 600),
    causes: (Array.isArray(raw?.causes) ? raw.causes : []).map((x) => str(x, 240)).filter(Boolean).slice(0, 5),
    actions: [...new Set((Array.isArray(raw?.actions) ? raw.actions : []).map(String).filter((x) => REPAIRS.includes(x)))],
  };
}
export function cleanInvoiceLines(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.lines) ? raw.lines : Array.isArray(raw?.items) ? raw.items : [];
  return list.map((x) => ({
    name: str(x?.name, 120), batch: str(x?.batch, 40), expiry: isoExpiry(x?.expiry),
    boxes: int(x?.boxes, 0, 100000, 0), unitsPerBox: int(x?.unitsPerBox, 1, 10000, 1), unitCostUGX: money(x?.unitCostUGX),
  })).filter((x) => x.name).slice(0, 80);
}
export function cleanPrescription(raw) {
  return {
    patient: str(raw?.patient), prescriber: str(raw?.prescriber),
    items: (Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.medicines) ? raw.medicines : []).map((x) => ({ name: str(x?.name, 120), qty: int(x?.qty ?? x?.quantity, 1, 1000, 1), unit: unitOf(x?.unit) })).filter((x) => x.name).slice(0, 20),
  };
}

// ---- prompts ----
const COMMAND_PROMPT = 'You turn a pharmacy cashier\'s short instruction (English, Luganda or Swahili words may appear) into ONE JSON object for a point of sale in Uganda. ' +
  'Reply with ONLY JSON, no other text. Either {"action":"ADD_ITEMS","items":[{"name":"medicine as said","qty":1,"unit":"strip|box|tablet"}]} ' +
  'or {"action":"NAVIGATE","to":"<one of: ' + Object.keys(NAV_ROUTES).join(', ') + '>"} ' +
  'or {"action":"NONE","reply":"one short sentence"} when it is neither. Do not invent medicines that were not mentioned.';
const ASK_PROMPT = 'You are an assistant for a pharmacy owner in Uganda. Answer ONLY from the facts given (JSON worked out from the pharmacy\'s own records); ' +
  'if the facts do not cover the question, say so. Amounts are Uganda shillings (UGX). Be brief and concrete: name the medicines, batches and dates. ' +
  'Reply with ONLY JSON: {"answer":"plain English, at most 8 short lines","reorder":[{"name":"","qty":0}]} — "reorder" only when asked to draft an order, else [].';
const DIAGNOSE_PROMPT = 'You are a support engineer for an offline-first pharmacy app (a web app that keeps data in the browser and syncs to a cloud, or to a local hub on the pharmacy network). ' +
  'From the device telemetry, explain in plain English for a non-technical pharmacist what is wrong and what to do. ' +
  'Reply with ONLY JSON: {"summary":"two or three sentences","causes":["most likely cause first"],"actions":[]} where "actions" lists only from: ' + REPAIRS.join(', ') +
  ' (compact-snapshots: free space on the device; reset-sync-cursor: download changes again from the start, nothing local is lost; test-connection: check the cloud or hub; reload-app: restart the app).';
const INVOICE_VISION_PROMPT = 'Read this supplier invoice or delivery note from a pharmacy wholesaler in Uganda. Reply with ONLY a JSON array, no other text: ' +
  '[{"name":"medicine with strength and form","batch":"","expiry":"YYYY-MM-DD","boxes":1,"unitsPerBox":10,"unitCostUGX":0}]. ' +
  '"boxes" is the quantity of packs delivered, "unitsPerBox" the units in one pack (e.g. 10x10 = 100), "unitCostUGX" the price of ONE unit in Uganda shillings (pack price divided by unitsPerBox). Leave a field empty or 0 when it is not printed.';
const RX_VISION_PROMPT = 'Read this medical prescription (typed or handwritten) for a pharmacist in Uganda. Reply with ONLY JSON, no other text: ' +
  '{"patient":"","prescriber":"","items":[{"name":"medicine with strength","qty":1,"unit":"strip|box|tablet"}]}. Expand abbreviations; leave unknown fields empty.';

const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const bytesOf = (b64) => { const s = atob(b64); const a = new Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };

/**
 * The copilot and vision routes. Returns a Response, or null for any other path.
 * can(perm) → Promise<boolean>: the signed-in person's permission (worker/index.js roleCan, or true for the sync key).
 */
export async function aiRoutes(env, path, body, can, json) {
  if (path === '/api/ai/copilot') {
    const mode = String(body?.mode || 'command');
    const text = str(body?.text, 600);
    if (mode === 'command') {
      if (!text) return json({ error: 'Type what you want to do.' }, 400);
      if (!(await can('pos.sell'))) return json({ error: 'Only staff who sell can use till commands.' }, 403);
      const { out, model } = await runWithFallback(env, COPILOT_MODEL, { messages: [{ role: 'system', content: COMMAND_PROMPT }, { role: 'user', content: text }], max_tokens: 500, temperature: 0.1 });
      return json({ ...cleanCommand(firstJson(out.response ?? out)), model });
    }
    if (mode === 'ask') {
      if (!text) return json({ error: 'Type a question.' }, 400);
      if (!(await can('reports')) && !(await can('inventory.view'))) return json({ error: 'Only staff who see reports or stock can ask about them.' }, 403);
      const facts = JSON.stringify(body?.facts ?? {});
      if (facts.length > 16000) return json({ error: 'Too much data in one question.' }, 413);
      const { out, model } = await runWithFallback(env, COPILOT_MODEL, { messages: [{ role: 'system', content: ASK_PROMPT }, { role: 'user', content: `Facts: ${facts}\n\nQuestion: ${text}` }], max_tokens: 900, temperature: 0.2 });
      return json({ ...cleanAnswer(firstJson(out.response ?? out)), model });
    }
    if (mode === 'diagnose') {
      const telemetry = JSON.stringify(scrubTelemetry(body?.telemetry ?? {}));
      if (telemetry.length > 12000) return json({ error: 'Too much telemetry in one request.' }, 413);
      const { out, model } = await runWithFallback(env, COPILOT_MODEL, { messages: [{ role: 'system', content: DIAGNOSE_PROMPT }, { role: 'user', content: `Telemetry: ${telemetry}${text ? `\n\nWhat the person sees: ${scrubText(text, 300)}` : ''}` }], max_tokens: 700, temperature: 0.2 });
      return json({ ...cleanDiagnosis(firstJson(out.response ?? out)), model });
    }
    return json({ error: 'Unknown copilot mode.' }, 400);
  }
  if (path === '/api/ai/vision') {
    const mode = String(body?.mode || '');
    if (mode !== 'invoice' && mode !== 'prescription') return json({ error: 'mode must be "invoice" or "prescription".' }, 400);
    if (mode === 'invoice' ? !(await can('stock.receive')) : !((await can('pos.sell')) || (await can('prescriptions')))) return json({ error: mode === 'invoice' ? 'Only staff who receive stock can read invoices.' : 'Only staff who sell or dispense can read prescriptions.' }, 403);
    const m = IMAGE.exec(String(body?.image || ''));
    if (!m || m[2].length > 2_800_000) return json({ error: 'Send a JPG, PNG or WebP image under 2 MB.' }, 400);
    const prompt = mode === 'invoice' ? INVOICE_VISION_PROMPT : RX_VISION_PROMPT;
    const { out, model } = await runWithFallback(env, VISION_MODEL,
      { messages: [{ role: 'user', content: prompt }], image: bytesOf(m[2]), max_tokens: mode === 'invoice' ? 3000 : 900, temperature: 0.1 },
      { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: body.image } }] }], max_tokens: mode === 'invoice' ? 3000 : 900, temperature: 0.1 });
    const answer = out.response ?? out;
    if (mode === 'invoice') return json({ lines: cleanInvoiceLines(firstJson(answer, typeof answer === 'string' && answer.trim().startsWith('{') ? '{' : '[')), model });
    return json({ ...cleanPrescription(firstJson(answer)), model });
  }
  return null;
}
