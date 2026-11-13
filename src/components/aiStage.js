// Medicines staged for the till from elsewhere (the AI omnibar: "add 2 strips of paracetamol"): kept here until the
// till is open, then taken once. Nothing is stored; a reload forgets them.
let pending = [];
const EVENT = 'rxpos:stage-items';
/** Queue [{ name, qty, unit }] (and optional prescription details) for the till and tell an open till */
export function stageForTill(items, meta = null) {
  pending.push({ items, meta });
  window.dispatchEvent(new Event(EVENT));
}
/** Take everything waiting (the till calls this when it opens and on the event) */
export const takeStaged = () => { const x = pending; pending = []; return x; };
export const onStaged = (fn) => { window.addEventListener(EVENT, fn); return () => window.removeEventListener(EVENT, fn); };
