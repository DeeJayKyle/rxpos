// Document numbers (review 2.1, workplan step 7): R-NTD-03-000412 = kind, branch code, till, count.
//
// Before, a number was the clock in base 36 plus one random character: it repeated about every 25 days and said
// nothing about order. Now each device has a till number in its pharmacy (given by the cloud, /api/till) and counts
// each kind of document itself, in a `counters` record saved in the SAME commit as the document, so numbers never
// repeat, even offline, and go up one by one per till. The counter record syncs like any other, so a device that
// downloads its pharmacy again carries on from where it was. Until a device has a till number (an older install
// that has not synced since, a hub without /api/till) the old style is used, so a sale is never held up.
// Same rules in the Flutter app: rxpos_flutter/lib/core/rules/doc_numbers.dart.

/** The kinds: receipts, proformas, deliveries, purchase orders, transfers, stock counts, returns to supplier */
export const DOC_KINDS = ['R', 'PF', 'GRN', 'PO', 'TR', 'SC', 'RT'];

/** A branch's code: its own `code` (set in the owner console), else the first three letters/digits of its name */
export function branchCode(branch) {
  const own = String(branch?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (own) return own;
  const fromName = String(branch?.name || '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return fromName || 'BR';
}

/** The old clock-based number, only while a device has no till number yet */
export const legacyNumber = (kind) => kind + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

export const counterId = (till) => 'till-' + till;

/** Format: R-NTD-03-000412 (the till has at least 2 digits, the count at least 6) */
export const formatNumber = (kind, code, till, n) => `${kind}-${code}-${String(till).padStart(2, '0')}-${String(n).padStart(6, '0')}`;

/**
 * The next number for a document, counted in `d` (the store's draft inside update()), so the count and the document
 * are saved together. put: store.jsx put. till: this device's till number (or nothing). branch: the branch record.
 */
export function nextNumber(d, put, kind, { till, branch } = {}) {
  const t = Number(till);
  if (!(t > 0)) return legacyNumber(kind);
  d.counters ??= [];
  const id = counterId(t);
  const cur = d.counters.find((x) => x.id === id) || { id, till: t };
  const n = (Number(cur[kind]) || 0) + 1;
  put(d, 'counters', { ...cur, [kind]: n });
  return formatNumber(kind, branchCode(branch), t, n);
}
