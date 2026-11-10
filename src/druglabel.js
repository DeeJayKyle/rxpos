// Drug label lookup (openFDA, public domain) for the Drug Information page and the POS panel.
// Fast: one request that searches generic, substance and brand names at once (instead of up to three in a row),
// results kept in memory for the session and on the device for 30 days, a lookup already on its way is shared, and
// a medicine the database doesn't know is remembered for a day. Robust: each attempt times out after 8 s, network
// errors and busy / failing servers get one retry, and a saved copy is always shown when the network can't help.
// Storage and fetch are passed in, so the logic is checked in tests without a browser.

export const SECTIONS = [
  ['indications_and_usage', 'Uses'],
  ['dosage_and_administration', 'Dosage & administration'],
  ['contraindications', 'Do not use when'],
  ['warnings_and_cautions', 'Warnings & precautions'],
  ['warnings', 'Warnings'],
  ['boxed_warning', 'Boxed warning'],
  ['adverse_reactions', 'Side effects'],
  ['drug_interactions', 'Interactions'],
  ['pregnancy', 'Pregnancy'],
  ['pediatric_use', 'Children'],
  ['geriatric_use', 'Elderly'],
  ['overdosage', 'Overdose'],
  ['storage_and_handling', 'Storage'],
  ['how_supplied', 'How supplied'],
];
export const FRESH_MS = 30 * 864e5;   // a saved label younger than this is used without asking the network
export const MISS_MS = 864e5;         // "not in the database" is remembered this long
const TIMEOUT_MS = 8000;
const API = 'https://api.fda.gov/drug/label.json';
const FIELDS = ['openfda.generic_name', 'openfda.substance_name', 'openfda.brand_name'];

/** "Amoxicillin 500mg Capsules" → "amoxicillin" (first ingredient words, no strengths or forms) */
export function genericKey(text) {
  return String(text || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?)\b/g, ' ')
    .replace(/\b(tabs?|tablets?|caps?|capsules?|syrup|suspension|susp|inj|injection|cream|ointment|gel|drops?|eye|ear|sachet|vial|amp|ampoule|bottle|pack|strip|x\d+|forte|ds|plus)\b/g, ' ')
    .split(/[/+,&]| and /)[0]
    .replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The names worth trying for a medicine, best first: its generic, then its brand name (de-duplicated, never empty strings) */
export function lookupKeys(name, generic) {
  return [...new Set([genericKey(generic), genericKey(name)].filter((k) => k && k.length >= 3))];
}

const clip = (s, n = 900) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + ' …' : t; };
const quote = (s) => `"${encodeURIComponent(String(s).replace(/"/g, ''))}"`;

/** One URL that asks for the name as a generic, a substance OR a brand (openFDA reads "+" as OR) */
export const labelUrl = (key) => `${API}?search=${FIELDS.map((f) => `${f}:${quote(key)}`).join('+')}&limit=5`;

/** Of the labels returned, the one that matches the name best: exact generic, exact brand, generic containing it, else the first */
export function pickBest(results, key) {
  const k = key.toLowerCase();
  const names = (doc, f) => (doc.openfda?.[f] || []).map((x) => String(x).toLowerCase());
  return results.find((d) => names(d, 'generic_name').includes(k) || names(d, 'substance_name').includes(k))
    || results.find((d) => names(d, 'brand_name').includes(k))
    || results.find((d) => names(d, 'generic_name').some((g) => g.includes(k)))
    || results[0] || null;
}

/** The part of a label RxPOS keeps (short, so it stores well offline) */
export function toInfo(doc, key, fetchedAt) {
  return {
    key, fetchedAt,
    title: [doc.openfda?.generic_name?.[0], doc.openfda?.brand_name?.[0] && `(${doc.openfda.brand_name[0]})`].filter(Boolean).join(' '),
    route: doc.openfda?.route?.join(', ') || '', form: doc.openfda?.dosage_form?.[0] || '',
    sections: SECTIONS.map(([k, label]) => [label, doc[k]?.[0] ? clip(doc[k][0]) : '']).filter(([, v]) => v),
    source: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(key)}`,
  };
}

class LookupError extends Error { constructor(msg, retry) { super(msg); this.retry = retry; } }
const wait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason || new Error('aborted')); }, { once: true }); });

export function createDrugLookup({ fetchFn = (...a) => fetch(...a), get, set, now = () => Date.now(), retries = 1, backoff = 700, timeout = TIMEOUT_MS } = {}) {
  const mem = new Map();      // key → { info } | { miss: true, at }
  const inflight = new Map(); // key → Promise

  /** One request with its own timeout, also cancelled by the caller's signal */
  async function attempt(url, signal) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new LookupError('The drug database took too long to answer.', true)), timeout);
    const stop = () => ctl.abort(signal.reason);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      const r = await fetchFn(url, { signal: ctl.signal });
      if (r.status === 404) return [];
      if (r.status === 429 || r.status >= 500) throw new LookupError(`The drug database is busy (${r.status}).`, true);
      if (!r.ok) throw new LookupError(`The drug database answered ${r.status}.`, false);
      return (await r.json()).results || [];
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof LookupError) throw e;
      if (ctl.signal.aborted) throw ctl.signal.reason instanceof LookupError ? ctl.signal.reason : new LookupError('The drug database took too long to answer.', true); // older WebViews drop the reason
      throw new LookupError('Could not reach the drug database. Check the internet connection.', true);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
  }

  async function fromNetwork(key, signal) {
    for (let i = 0; ; i++) {
      try {
        const results = await attempt(labelUrl(key), signal);
        const doc = pickBest(results, key);
        return doc ? toInfo(doc, key, new Date(now()).toISOString()) : null;
      } catch (e) {
        if (signal?.aborted || !e.retry || i >= retries) throw e;
        await wait(backoff * (i + 1), signal);
      }
    }
  }

  /** What is already known without the network: { info, fresh } or { miss } or null. Never throws. */
  async function saved(key) {
    const m = mem.get(key);
    if (m) return m.miss ? (now() - m.at < MISS_MS ? { miss: true } : null) : { info: m.info, fresh: now() - Date.parse(m.info.fetchedAt) < FRESH_MS };
    const stored = await Promise.resolve(get?.('drug:' + key)).catch(() => null);
    if (stored?.sections) { mem.set(key, { info: stored }); return { info: stored, fresh: now() - Date.parse(stored.fetchedAt) < FRESH_MS }; }
    const miss = await Promise.resolve(get?.('drug-miss:' + key)).catch(() => null);
    if (miss && now() - miss < MISS_MS) { mem.set(key, { miss: true, at: miss }); return { miss: true }; }
    return null;
  }

  /** Ask the network (sharing a request already on its way), and remember the answer */
  function refresh(key, signal) {
    if (inflight.has(key)) return inflight.get(key);
    const p = fromNetwork(key, signal).then((info) => {
      if (info) { mem.set(key, { info }); Promise.resolve(set?.('drug:' + key, info)).catch(() => {}); }
      else { const at = now(); mem.set(key, { miss: true, at }); Promise.resolve(set?.('drug-miss:' + key, at)).catch(() => {}); }
      return info;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /** Instant answer from memory, if any (for a panel opened again) */
  const peek = (key) => { const m = mem.get(key); return m && !m.miss ? m.info : null; };

  return { saved, refresh, peek, _mem: mem };
}
