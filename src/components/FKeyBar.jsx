// The F-key legend on the till (UX review, Nov 2026): a thin bar under the till on computers with a keyboard and
// mouse, naming what each function key does there. The page keys follow this device's own key map (This device →
// Keyboard), so a changed key shows as it is now. Each key can be clicked. "Hide" keeps it hidden on this device; the
// shortcuts sheet (?) turns it back on.
import { X } from 'lucide-react';
import { keyOf, showKey } from '../keymap.js';
import { deviceSettings, setDevice } from '../device.js';

export const fkeysShown = () => deviceSettings().fkeys !== false;
export const showFkeys = (on) => setDevice({ fkeys: !!on });

/** The keys, in the order of the keyboard. go: a page (navigate); run: an action on the till. */
export function fkeyItems({ can = () => true, features = {}, wholesale = false }) {
  const page = (id, label, ok = true) => (ok ? { key: keyOf(id), label, go: id.slice(3) } : null);
  return [
    page('go:/pos', 'Retail', wholesale),
    page('go:/pos/wholesale', 'Wholesale', !wholesale && features.wholesale !== false && can('pos.wholesale')),
    page('go:/add-stock', 'Add stock', can('stock.receive')),
    page('go:/sales', 'Sales', can('sales.view')),
    page('go:/inventory', 'Inventory', can('inventory.view')),
    { key: 'F8', label: 'Search', run: 'search' },
    { key: 'F9', label: 'Charge', run: 'charge' },
    { key: 'F10', label: 'Proforma', run: 'proforma' },
    { key: '?', label: 'All keys', run: 'help' },
  ].filter((x) => x && x.key);
}

export default function FKeyBar({ items, onGo, onRun, onHide }) {
  return (
    <nav className="fkey-bar no-print" aria-label="Function keys">
      {items.map((x) => (
        <button type="button" key={x.label} className="fkey" onClick={() => (x.go ? onGo(x.go) : onRun(x.run))} title={`${x.label} (${showKey(x.key)})`}>
          <kbd>{showKey(x.key)}</kbd><span>{x.label}</span>
        </button>
      ))}
      <button type="button" className="fkey fkey-hide" onClick={onHide} title="Hide this bar (? shows it again)" aria-label="Hide the function key bar"><X size={13} /></button>
    </nav>
  );
}
