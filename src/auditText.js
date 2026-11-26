// The audit log in plain sentences (UI batch 3, F6), and what was last changed on a record (F5). The Flutter app has
// the same rules in rxpos_flutter/lib/core/rules/audit_text.dart.

const VERBS = {
  'Refund': 'refunded', 'Signed in': 'signed in', 'Price changed': 'changed a price:', 'Expired write-off': 'wrote off expired stock:',
  'Settings changed': 'changed a setting:', 'Sale edited': 'edited a sale:', 'Sale check reviewed': 'checked a sale:', 'Inventory edited': 'edited stock:',
  'Stock adjusted': 'adjusted stock:', 'Unit of issue changed': 'changed the unit stock is counted in:', 'Selling units changed': 'set the units a medicine is sold in:', 'Shelf assigned': 'put medicines on a shelf:', 'Medicines changed': 'changed medicines:', 'Draft discarded': 'discarded a draft:',
  'Purchase orders created': 'created purchase orders:', 'Purchase order marked sent': 'sent a purchase order:', 'Invoices scanned': 'scanned invoices:',
};
/** "Amina refunded R102, UGX 5,000 · reason: wrong item" */
export function auditSentence(a) {
  const who = a.user || 'Someone';
  const d = String(a.details || '');
  if (a.action === 'Refund') {
    const [num, amount, why, ...rest] = d.split(' · ');
    return `${who} refunded ${num}${amount ? ', ' + amount : ''}${why ? ' · reason: ' + why : ''}${rest.length ? ' · ' + rest.join(' · ') : ''}`;
  }
  if (a.action === 'Signed in') return `${who} signed in${d ? ' on ' + d : ''}`;
  const verb = VERBS[a.action] || a.action.charAt(0).toLowerCase() + a.action.slice(1) + (d ? ':' : '');
  return `${who} ${verb}${d ? ' ' + d : ''}`;
}

/** The kind of an entry, for the filter chips */
export const AUDIT_KINDS = [['sales', 'Sales & refunds'], ['stock', 'Stock & prices'], ['people', 'Staff & sign-ins'], ['settings', 'Settings'], ['other', 'Other']];
export function auditKind(a) {
  const x = a.action.toLowerCase();
  if (/refund|sale|discount|proforma|day/.test(x)) return 'sales';
  if (/stock|price|write-off|batch|medicine|shelf|purchase|invoice|transfer|count|inventory|kit/.test(x)) return 'stock';
  if (/sign|user|role|password|pin|two-step/.test(x)) return 'people';
  if (/setting/.test(x)) return 'settings';
  return 'other';
}

/** F5: the latest audit entry about a record (its name or number in the details): { user, date } or null */
export function lastChangeOf(audit, key) {
  const k = String(key || '').trim();
  if (k.length < 2) return null;
  let best = null;
  for (const a of audit || []) if (a.action !== 'Signed in' && String(a.details || '').includes(k) && (!best || a.date > best.date)) best = a;
  return best;
}

/** "2 h ago", "just now", "3 days ago" */
export function ago(iso, now = Date.now()) {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (!(m >= 0)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
