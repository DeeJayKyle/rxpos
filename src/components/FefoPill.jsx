// The FEFO expiry traffic light (src/fefo.js expiryLevel): green more than 6 months away, amber 3–6 months,
// stronger amber under 3 months, red when expired (blocked from sale).
const TEXT = { ok: 'Exp', soon: 'Exp', short: 'Exp', expired: 'Expired' };
const shortDate = (iso) => { const [y, m] = String(iso).split('-'); return m && y ? `${m}/${y.slice(2)}` : iso; };

export function FefoPill({ level, expiry, days }) {
  if (!level) return null;
  const label = level === 'expired' ? 'Expired · blocked' : days != null && level !== 'ok' ? `Exp ${days}d` : `${TEXT[level]} ${shortDate(expiry)}`;
  return <span className={'fefo-pill fefo-' + level} title={level === 'expired' ? `Expired ${expiry}: not sold` : `Expires ${expiry}`}>{label}</span>;
}
