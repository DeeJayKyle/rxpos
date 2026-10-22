// What may appear on the customer-facing idle "shop window". Prescription-only and controlled medicines are never
// featured to customers, and only in-stock, priced items qualify. (security review 0.8)
export const isFeaturable = (p) => !!p && p.stock > 0 && p.price > 0 && !p.rx && !p.controlled;
