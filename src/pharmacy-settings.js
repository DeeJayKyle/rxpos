// Shared pharmacy defaults belong to the Owner console. Device overrides never
// enter the synced settings record, backup, or outbox.
export const PHARMACY_FIELDS = [
  ['name', 'Pharmacy name (shown on receipts)', 'text', 'My Pharmacy'],
  ['phone', 'Phone', 'text', ''], ['address', 'Address', 'text', ''],
  ['license', 'NDA licence / registration no.', 'text', ''], ['tin', 'TIN', 'text', ''],
  ['currency', 'Currency (e.g. UGX, KES, $)', 'text', 'UGX'], ['decimals', 'Decimal places', 'number', 0],
  ['taxRate', 'Tax / VAT rate (%)', 'number', 0], ['retailMarkup', 'Default retail markup (%)', 'number', 50],
  ['wholesaleMarkup', 'Default wholesale markup (%)', 'number', 25], ['minMargin', 'Target margin (%)', 'number', 20],
  ['priceRound', 'Round worked-out prices', 'number', 0], ['nonCashBankId', 'Non-cash sales go to', 'text', 'cash-drawer'],
];
export const pharmacyDefaults = (settings = {}) => Object.fromEntries(PHARMACY_FIELDS.map(([key,,, fallback]) => [key, settings[key] ?? fallback]));
export const pharmacyChanged = (before, after) => JSON.stringify(pharmacyDefaults(before)) !== JSON.stringify(pharmacyDefaults(after));
export const overrideKey = (url, tenant) => 'rxpos-pharmacy-overrides:' + JSON.stringify([url || '', tenant || 'unlinked']);
export function editOverrides(shared, current, next, existing = {}) {
  const out = { ...existing }, base = pharmacyDefaults(shared), prev = pharmacyDefaults(current), values = pharmacyDefaults(next);
  for (const [key] of PHARMACY_FIELDS) {
    if (values[key] === prev[key]) continue; // saving another field never pins an unchanged Owner value
    if (values[key] === base[key]) delete out[key]; else out[key] = values[key];
  }
  return out;
}
export function readOverrides(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return Object.fromEntries(PHARMACY_FIELDS.filter(([k]) => Object.hasOwn(value || {}, k)).map(([k]) => [k, value[k]])); }
  catch { return {}; }
}
export function writeOverrides(key, values) {
  if (Object.keys(values).length) localStorage.setItem(key, JSON.stringify(values)); else localStorage.removeItem(key);
}
export function validatePharmacyDefaults(settings) {
  const out = pharmacyDefaults(settings);
  for (const [key,, type] of PHARMACY_FIELDS) {
    if (type === 'number') {
      const n = Number(out[key]);
      if (!Number.isFinite(n) || n < 0 || (key === 'decimals' && (!Number.isInteger(n) || n > 6)) || (['taxRate', 'minMargin'].includes(key) && n > 100)) throw new Error('Invalid ' + key);
      out[key] = n;
    } else out[key] = String(out[key]).trim().slice(0, key === 'address' ? 500 : 100);
  }
  if (!out.name || !out.currency || ![0, 10, 50, 100, 500].includes(out.priceRound)) throw new Error('Invalid pharmacy name, currency or rounding');
  return out;
}

export const settingsEqual = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
