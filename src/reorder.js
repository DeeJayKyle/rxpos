// Automatic reorder levels from real consumption:
//   reorder level = average daily sales over the period × (supplier lead time + safety days)
// Only medicines that sold in the period are changed. Runs weekly (Settings → Receipts & stock) or on demand (Reorder page).
import { useEffect } from 'react';
import { useStore, put, audit, now, MAIN_BRANCH } from './store.jsx';

export const reorderSettings = (s = {}) => ({
  days: Number(s.autoReorderDays) || 30,
  lead: Number(s.leadDays) || 7,
  safety: Number(s.safetyDays ?? 7),
  on: s.autoReorder !== false,
});

/** → [{ p, sold, perDay, level }] for medicines whose level should change */
export function computeReorderLevels(db, products, settings, branchId = MAIN_BRANCH) {
  const { days, lead, safety } = reorderSettings(settings);
  const since = Date.now() - days * 864e5;
  const sold = new Map();
  for (const s of db.sales) {
    if (s.status === 'refunded' || (s.branchId || MAIN_BRANCH) !== branchId || new Date(s.date).getTime() < since) continue;
    for (const i of s.items) sold.set(i.id, (sold.get(i.id) || 0) + Number(i.qty || 0));
  }
  const out = [];
  for (const p of products) {
    const n = sold.get(p.id);
    if (!n) continue;
    const perDay = n / days;
    const level = Math.max(1, Math.ceil(perDay * (lead + safety)));
    if (level !== Number(p.reorder || 0)) out.push({ p, sold: n, perDay, level });
  }
  return out.sort((a, b) => b.perDay - a.perDay);
}

export function applyReorderLevels(update, user, branchId, changes, auto = false) {
  if (!changes.length) return;
  update((d) => {
    for (const c of changes) { const cur = d.products.find((x) => x.id === c.p.id); if (cur) put(d, 'products', { ...cur, reorder: c.level }); }
    d.settings = { ...d.settings, autoReorderAt: now(), updatedAt: now() };
    audit(d, user, auto ? 'Reorder levels updated automatically' : 'Reorder levels updated from sales', `${changes.length} medicines`, branchId);
  });
}

/** Once a week, on a device used by someone allowed to manage medicines */
export function AutoReorder() {
  const { db, products, update, user, branchId, can } = useStore();
  useEffect(() => {
    const cfg = reorderSettings(db.settings);
    if (!cfg.on || !can('medicines.manage')) return;
    const last = db.settings.autoReorderAt ? new Date(db.settings.autoReorderAt).getTime() : 0;
    if (Date.now() - last < 7 * 864e5) return;
    const t = setTimeout(() => {
      const changes = computeReorderLevels(db, products, db.settings, branchId);
      if (changes.length) applyReorderLevels(update, user, branchId, changes, true);
      else update((d) => { d.settings = { ...d.settings, autoReorderAt: now(), updatedAt: now() }; });
    }, 20000); // after the first sync has settled
    return () => clearTimeout(t);
  }, [db.settings.autoReorderAt, db.settings.autoReorder]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
