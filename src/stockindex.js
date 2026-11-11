// Stock balances per branch and batch (review 2.4, workplan step 13).
//
// Stock is the sum of movements. Before, every change (a sale, a delivery, a pulled change) re-added every movement
// ever recorded, so the till slowed down as the history grew. Movements are append-only, and the store only ever
// adds them at one end of the list: a change made here puts the new ones first (store.jsx put), a change from the
// cloud adds them last (mergeRemote) or replaces one in place with the same content. So when the previous list is
// still there, untouched at both ends, only the new movements are added to the running balances. Anything else (a
// deletion, a re-ordered list, new movements at both ends at once) re-counts everything, which also happens at
// start-up. Every SELF_CHECK incremental steps the balances are re-counted from scratch and compared; the full count
// wins if they ever differ. The numbers are always exactly the sum of movements.
const MAIN_BRANCH_ID = 'main'; // store.jsx MAIN_BRANCH (kept here so this module has no React in it)

export const SELF_CHECK = 300;

// Faster sync, stage 4 (docs/SYNC-HISTORY-WINDOW.md): a device keeping recent history only starts from the cloud's
// brought-forward balances at its window start W (win = { W, stock: [{ branch, batch, product, qty }] }) and adds the
// movements dated from W. Without a window, everything is as before.
function add(idx, list, W) {
  for (const mv of list) {
    if (W && String(mv.date || '') < W) continue; // already in the brought-forward balance
    const br = mv.branchId || MAIN_BRANCH_ID;
    const bk = br + '|' + (mv.batchId || 'lb-' + mv.productId);
    const pk = br + '|' + mv.productId;
    idx.batch.set(bk, (idx.batch.get(bk) || 0) + mv.qty);
    idx.product.set(pk, (idx.product.get(pk) || 0) + mv.qty);
    idx.total.set(mv.productId, (idx.total.get(mv.productId) || 0) + mv.qty);
  }
}

/** The balances from scratch: { batch: `${branch}|${batchId}` → qty, product: `${branch}|${productId}` → qty, total } */
export function countAll(movements, win) {
  const idx = { batch: new Map(), product: new Map(), total: new Map() };
  for (const b of win?.stock || []) {
    const bk = b.branch + '|' + b.batch, pk = b.branch + '|' + b.product;
    idx.batch.set(bk, (idx.batch.get(bk) || 0) + b.qty);
    idx.product.set(pk, (idx.product.get(pk) || 0) + b.qty);
    idx.total.set(b.product, (idx.total.get(b.product) || 0) + b.qty);
  }
  add(idx, movements || [], win?.W);
  return idx;
}

const same = (a, b) => {
  for (const k of ['batch', 'product', 'total']) {
    if (a[k].size !== b[k].size) {
      // a balance that went back to exactly 0 may exist in one and not the other: compare values, not entries
      for (const [key, v] of a[k]) if (Math.abs(v - (b[k].get(key) || 0)) > 1e-9) return false;
      for (const [key, v] of b[k]) if (Math.abs(v - (a[k].get(key) || 0)) > 1e-9) return false;
      continue;
    }
    for (const [key, v] of a[k]) if (Math.abs(v - (b[k].get(key) || 0)) > 1e-9) return false;
  }
  return true;
};

/**
 * A stock counter that remembers the list it last counted. Call it with each new movements array; it returns
 * { batch, product, total, how } — how: 'same' | 'front' | 'back' | 'full' | 'checked' (for tests and the benchmark).
 */
export function createStockIndexer({ selfCheck = SELF_CHECK, onMismatch = () => {} } = {}) {
  let prev = null, idx = null, steps = 0, prevWin = null;
  return function index(movements, win = null) {
    const m = movements || [];
    if (m === prev && win === prevWin && idx) return { ...idx, how: 'same' }; // asked twice for the same list (React may do that)
    let how = 'full', added = null;
    if (prev && idx && win === prevWin && m.length >= prev.length && prev.length > 0) {
      const k = m.length - prev.length;
      if (m[k] === prev[0] && m[m.length - 1] === prev[prev.length - 1]) { how = 'front'; added = m.slice(0, k); }
      else if (m[0] === prev[0] && m[prev.length - 1] === prev[prev.length - 1]) { how = 'back'; added = m.slice(prev.length); }
    }
    if (added) {
      add(idx, added, win?.W);
      if (++steps >= selfCheck) {
        steps = 0;
        const full = countAll(m, win);
        if (!same(full, idx)) { onMismatch(); idx = full; }
        how = 'checked';
      }
    } else { idx = countAll(m, win); steps = 0; }
    prev = m; prevWin = win;
    return { batch: idx.batch, product: idx.product, total: idx.total, how };
  };
}
