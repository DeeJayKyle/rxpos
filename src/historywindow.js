// Which records a device keeping recent history holds (faster sync, stage 4: docs/SYNC-HISTORY-WINDOW.md). The same
// rule decides what the cloud sends with a window and what a device drops when its window moves forward, so the two
// can never disagree. Pure: used by the worker, the React app and (as Dart) the Flutter app.
//
// A record of a windowed table is kept when it is dated from the window start W, when it makes a balance entry
// dated from W (an old sale refunded since), when it is an open item (an unpaid sale or purchase, an advance not yet
// deducted, a transfer on its way, a shift still open), or when it has no date at all. Every other table is kept
// whole: medicines, batches, clients, suppliers, staff, roles, branches, banks, insurers, settings, prescriptions,
// purchase orders, stock counts, drafts, day closes…
import { hasEntryFrom } from './balances.js';
import { clientOwes } from './insurance.js';

/** The tables that only keep their recent part on a device with a window: the ones that grow every day */
export const WINDOWED = new Set(['sales', 'movements', 'payments', 'purchases', 'expenses', 'bankTx', 'supplierReturns', 'transfers',
  'audit', 'messages', 'events', 'tempLogs', 'quizResults', 'anomalies', 'attendance', 'payrolls', 'salaryAdvances', 'proformas', 'shifts']);

/** The date a record belongs to (its own date, or when it was made) */
export const recordDate = (r) => String(r?.date || r?.at || r?.startedAt || r?.createdAt || '');

/** Still open: needed on the device whatever its age */
export function isOpenItem(t, r) {
  switch (t) {
    case 'sales': return r.status !== 'refunded' && clientOwes(r) > 0.5;
    case 'purchases': return (Number(r.total) || 0) - (Number(r.paid ?? r.total) || 0) > 0.5;
    case 'salaryAdvances': return !r.payrollId;
    case 'transfers': return /transit|pending|draft/i.test(String(r.status || ''));
    case 'shifts': return !r.closedAt && !/closed/i.test(String(r.status || ''));
    default: return false;
  }
}

/** Does a device with window start W keep this record? (W empty: no window, everything is kept) */
export function keeps(t, r, W) {
  if (!W || !WINDOWED.has(t) || !r || r.deleted) return true;
  const d = recordDate(r);
  return !d || d >= W || hasEntryFrom(t, r, W) || isOpenItem(t, r);
}

/**
 * What a device drops when its window moves forward to W: { tables: { t: kept list } (only the tables that change),
 * dels: [{ t, id }] }. A record with a change still waiting to be sent (`waiting`: Set of 't|id') stays until it has
 * gone, or the change would be lost. Only on this device: the cloud keeps everything.
 */
export function pruneOf(db, W, waiting = new Set()) {
  const stays = (t, r) => keeps(t, r, W) || waiting.has(t + '|' + String(r.id));
  const tables = {}, dels = [];
  for (const t of WINDOWED) {
    const list = db?.[t] || [];
    const kept = list.filter((r) => stays(t, r));
    if (kept.length === list.length) continue;
    tables[t] = kept;
    for (const r of list) if (!stays(t, r)) dels.push({ t, id: String(r.id) });
  }
  return { tables, dels };
}
