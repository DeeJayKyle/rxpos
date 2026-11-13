// The live clinical safety pill above the till's cart (src/clinical.js): green when nothing is found, amber for a
// caution, red for a major allergy or interaction; tap to see each finding. A prompt for the pharmacist, never a block.
import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ChevronDown } from 'lucide-react';
import { safetyCheck } from '../clinical.js';

const useCheck = (cart, products, customer) => useMemo(() => safetyCheck(cart, products, customer && customer.id !== 'walk-in' ? customer : null), [cart, products, customer]);

/** All clear: a small badge beside the sale's title, so a clean sale costs no row of cart lines */
export function SafetyBadge({ cart, products, customer }) {
  const r = useCheck(cart, products, customer);
  if (!cart.length || r.level !== 'ok') return null;
  return <span className="safety-badge" role="status" title="No allergy or interaction found"><ShieldCheck size={13} aria-hidden="true" />Safety</span>;
}

/** Something to check: the pill above the lines (nothing when all is clear: see SafetyBadge) */
export default function ClinicalSafetyPill({ cart, products, customer }) {
  const [open, setOpen] = useState(false);
  const r = useCheck(cart, products, customer);
  if (!cart.length || r.level === 'ok') return null;
  const Icon = r.level === 'major' ? ShieldX : r.level === 'caution' ? ShieldAlert : ShieldCheck;
  const label = r.level === 'ok' ? 'No allergy or interaction found' : `${r.findings.length} safety ${r.findings.length === 1 ? 'check' : 'checks'}: ${r.findings[0].text}`;
  return (
    <div className={'safety-pill lvl-' + r.level} role="status" aria-live="polite">
      <button type="button" className="safety-pill-head" aria-expanded={open} disabled={r.level === 'ok'} onClick={() => setOpen((o) => !o)}>
        <Icon size={16} aria-hidden="true" /><span className="grow">{label}</span>
        {r.level !== 'ok' && <ChevronDown size={15} className={open ? 'flip' : ''} aria-hidden="true" />}
      </button>
      {open && r.level !== 'ok' && (
        <ul className="safety-list">
          {r.findings.map((f) => <li key={f.text} className={'lvl-' + f.level}><span className="micro">{f.level === 'major' ? 'Major' : 'Caution'} · {f.kind}</span>{f.text}</li>)}
        </ul>
      )}
    </div>
  );
}
