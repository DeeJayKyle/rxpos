// Inventory value (pure, so it can be unit-tested): what stock is worth at cost. Re-exported from store.jsx, so
// `import { batchValue, stockValue } from './store.jsx'` keeps working. The Daily stock sheet (worker/dailystock.js)
// uses the same rule, so its stock values match the app's.
import { daysUntil } from './dates.js';

/** Stock value of one medicine: its physical stock × the medicine's current cost, so changing the cost changes the value at
 * once (a batch's own cost is used only if the medicine has none); expired stock kept apart */
export function batchValue(p, batchesOf, br) {
  let value = 0, expired = 0;
  for (const b of batchesOf(p.id, br)) {
    if (!(b.qty > 0)) continue;
    const v = b.qty * (Number(p.cost) || Number(b.cost) || 0);
    if (b.expiry && daysUntil(b.expiry) < 0) expired += v; else value += v;
  }
  return { value, expired };
}
/** Inventory value of many medicines: { value (not expired), expired } */
export const stockValue = (products, batchesOf, br) => products.reduce((a, p) => {
  const v = batchValue(p, batchesOf, br);
  return { value: a.value + v.value, expired: a.expired + v.expired };
}, { value: 0, expired: 0 });
