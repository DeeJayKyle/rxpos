// Drafts (1.7): held sales and unfinished deliveries, kept as synced records in the `drafts` table so they belong to a
// person and a branch rather than to one computer: they follow the person to another device and survive a reload, a
// power cut or a closed browser tab (the web version keeps them in the cloud, nothing on the computer). A draft never
// changes stock or the books; only completing it does (as a normal sale or delivery).
//   { id, kind: 'sale' | 'delivery', branchId, mode?, userId, userName, order, startedAt, title, count, total, data }
export const OLD_DRAFT_HOURS = { sale: 4, delivery: 24 };

/** Who may see and take over everyone's drafts (not only their own) */
export const seesAllDrafts = (user) => !!user && user.role !== 'cashier';

export const isMine = (d, user) => !!user && d.userId === user.id;
export const ageHours = (d, at = Date.now()) => (at - Date.parse(d.startedAt || d.updatedAt || 0)) / 36e5;
export const isOld = (d, at) => ageHours(d, at) >= (OLD_DRAFT_HOURS[d.kind] || 24);
export function ageText(d, at = Date.now()) {
  const m = Math.max(0, Math.round((at - Date.parse(d.startedAt || d.updatedAt || 0)) / 6e4));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** The drafts a person sees for a branch (their own, or everyone's for a supervisor when `all`), oldest first */
export function draftsFor(db, { user, branchId, kind, all = false, mode }) {
  return (db.drafts || [])
    .filter((d) => (!kind || d.kind === kind) && (!branchId || d.branchId === branchId) && (!mode || (d.mode || 'retail') === mode))
    .filter((d) => (all && seesAllDrafts(user)) || isMine(d, user))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** A held sale (the POS snapshot) as a draft record */
export function saleDraft(snap, { user, branchId, mode, customerName, order }) {
  const total = snap.cart.reduce((a, l) => a + l.price * l.qty, 0) - (Number(snap.discount) || 0);
  return {
    id: snap.id, kind: 'sale', branchId, mode, userId: user.id, userName: user.name, order: order ?? Date.now(), startedAt: snap.at,
    title: customerName && customerName !== 'Walk-in Customer' ? customerName : snap.cart[0]?.name || 'Sale', count: snap.cart.length, total, data: snap,
  };
}

/** An unfinished delivery (the Add Stock form) as a draft record. Scanned invoice pictures stay on the device. */
export function deliveryDraft(form, { id, user, branchId, supplierName, total, startedAt }) {
  const lines = form.lines.filter((l) => l.productId || l.newName);
  return {
    id, kind: 'delivery', branchId, userId: user.id, userName: user.name, order: Date.now(), startedAt: startedAt || new Date().toISOString(),
    title: supplierName || 'Delivery', invoice: form.invoice || '', count: lines.length, total, data: { ...form, lines },
  };
}
