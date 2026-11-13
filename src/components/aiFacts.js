// What the AI copilot is told when the owner asks about stock (POST /api/ai/copilot mode "ask"): facts worked out on
// this device from the pharmacy's own records, so the answer can't invent numbers. Medicine names, batches, dates and
// quantities only: no customers, staff or money received.
import { daysUntil } from '../dates.js';

export function ownerFacts({ db, products, batchesOf }) {
  const value = (qty, cost) => Math.round((Number(qty) || 0) * (Number(cost) || 0));
  const expiring = [];
  for (const p of products) {
    for (const b of batchesOf(p.id)) {
      if (!(b.qty > 0) || !b.expiry) continue;
      const days = daysUntil(b.expiry);
      if (days <= 180) expiring.push({ name: p.name, batch: b.batch || '', expiry: b.expiry, days, qty: b.qty, valueUGX: value(b.qty, b.cost ?? p.cost) });
    }
  }
  expiring.sort((a, b) => a.days - b.days);
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const sold = new Set();
  for (const s of db.sales || []) if (String(s.date || '') >= since && s.status !== 'refunded') for (const it of s.items || []) sold.add(it.id);
  const deadStock90d = products.filter((p) => p.stock > 0 && !sold.has(p.id)).map((p) => ({ name: p.name, qty: p.stock, valueUGX: value(p.stock, p.cost) }))
    .sort((a, b) => b.valueUGX - a.valueUGX).slice(0, 25);
  const lowStock = products.filter((p) => Number(p.reorder) > 0 && p.stock <= Number(p.reorder)).map((p) => ({ name: p.name, stock: p.stock, reorderLevel: Number(p.reorder) })).slice(0, 30);
  return { today: new Date().toISOString().slice(0, 10), currency: 'UGX', medicines: products.length, expiringWithin180d: expiring.slice(0, 25), deadStock90d, lowStock };
}
