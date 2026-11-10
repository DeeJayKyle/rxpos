// The keyboard map (the owner's request, 2026-11-10: "map keyboard shortcuts"). Every shortcut of the app is an action
// with a default key; a person can change any of them for this device (This device → Keyboard), and the ? sheet and
// the menu show the keys as they are now. Keys are written "F2", "Ctrl+K", "Alt+ArrowLeft", or a two-key sequence
// "G S" (press G, then S), which can't clash with typing or with the browser's own shortcuts.
import { deviceSettings, setDevice } from './device.js';

/** [id, label, group, default key] */
export const ACTIONS = [
  ['go:/pos', 'Till (retail)', 'Pages', 'F2'],
  ['go:/pos/wholesale', 'Till (wholesale)', 'Pages', 'F3'],
  ['go:/add-stock', 'Add Stock', 'Pages', 'F4'],
  ['go:/sales', 'Sales History', 'Pages', 'F6'],
  ['go:/inventory', 'Inventory', 'Pages', 'F7'],
  ['go:/', 'Dashboard', 'Pages', 'G D'],
  ['go:/customers', 'Customers', 'Pages', 'G C'],
  ['go:/suppliers', 'Suppliers', 'Pages', 'G U'],
  ['go:/insurers', 'Insurers', 'Pages', 'G N'],
  ['go:/medicines', 'Medicine List', 'Pages', 'G M'],
  ['go:/purchases', 'Purchase History', 'Pages', 'G P'],
  ['go:/expiry', 'Expiring / Expired', 'Pages', 'G X'],
  ['go:/shifts', 'Shifts & Cash-up', 'Pages', 'G H'],
  ['go:/expenses', 'Expenses', 'Pages', 'G E'],
  ['go:/reports', 'Reports', 'Pages', 'G R'],
  ['go:/settings', 'Settings', 'Pages', 'G T'],
  ['palette', 'Search and commands', 'Anywhere', 'Ctrl+K'],
  ['help', 'Keyboard and mouse help', 'Anywhere', '?'],
  ['back', 'Back', 'Anywhere', 'Alt+ArrowLeft'],
  ['forward', 'Forward', 'Anywhere', 'Alt+ArrowRight'],
  ['pin', 'Pin or unpin this page in the menu', 'Anywhere', 'G G'],
  ['list:down', 'Next row', 'Lists', 'ArrowDown'],
  ['list:up', 'Previous row', 'Lists', 'ArrowUp'],
  ['list:first', 'First row', 'Lists', 'Home'],
  ['list:last', 'Last row', 'Lists', 'End'],
  ['list:open', 'Open the row', 'Lists', 'Enter'],
  ['list:edit', 'Edit the row', 'Lists', 'E'],
  ['list:delete', 'Delete the row (or the ticked rows)', 'Lists', 'Delete'],
  ['list:new', 'Add a new one', 'Lists', 'N'],
  ['list:search', 'Search the list', 'Lists', '/'],
  ['list:tick', 'Tick / untick the row', 'Lists', ' '],
  ['list:all', 'Tick all rows shown', 'Lists', 'Ctrl+A'],
  ['list:clear', 'Untick all, clear the search', 'Lists', 'Escape'],
];
const DEFAULTS = Object.fromEntries(ACTIONS.map(([id, , , k]) => [id, k]));

/** The key for an action on this device ('' = switched off) */
export const keyOf = (id) => { const m = deviceSettings().keymap || {}; return id in m ? m[id] : DEFAULTS[id] || ''; };
export const isDefault = (id) => !(id in (deviceSettings().keymap || {}));
/** Change an action's key on this device; a key another action uses is taken from it (switched off there) */
export function setKey(id, key) {
  const m = { ...(deviceSettings().keymap || {}) };
  if (key) for (const [other] of ACTIONS) if (other !== id && keyOf(other) === key && sameScope(id, other)) m[other] = '';
  if (key === DEFAULTS[id]) delete m[id]; else m[id] = key;
  setDevice({ keymap: m });
}
export const resetKeys = () => setDevice({ keymap: {} });
const scope = (id) => (id.startsWith('list:') ? 'list' : 'app');
const sameScope = (a, b) => scope(a) === scope(b);

const NAMED = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Delete: 'Del' };
/** A key as shown to people: "Alt+←", "G then S", "Space" */
export const showKey = (k) => (!k ? '—' : k.includes(' ') && k.trim().length > 1 ? k.split(' ').map((p) => NAMED[p] || p).join(' then ') : k.split('+').map((p) => NAMED[p] || p).join('+'));

/** A key press as a key name: "Ctrl+Shift+K", "Alt+ArrowLeft", "F2", "?", "E" (null for a modifier on its own) */
export function comboOf(e) {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return null;
  const key = e.key.length === 1 && e.key !== ' ' ? e.key.toUpperCase() : e.key;
  const mods = [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && key.length > 1 && key !== ' ' && 'Shift'].filter(Boolean);
  return [...mods, key === '?' ? '?' : key].join('+');
}

/** Is the person typing in a box (keys then belong to the box) */
export const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };

/**
 * A matcher for a set of actions: feed it key presses, it answers the action pressed (or null). Two-key sequences
 * ("G S") wait 1.5 s for the second key.
 */
export function keyMatcher(ids) {
  let first = '', at = 0;
  return (e) => {
    const c = comboOf(e);
    if (!c) return null;
    const now = Date.now();
    const pending = first && now - at < 1500 ? first : '';
    first = '';
    for (const id of ids) {
      const k = keyOf(id);
      if (!k) continue;
      if (k.length > 1 && k.includes(' ') && k.trim().length > 1) {
        const [a, b] = k.split(' ');
        if (pending === a && c === b) return id;
      } else if (k === c || (k === ' ' && c === ' ')) return id;
    }
    if (ids.some((id) => { const k = keyOf(id); return k.includes(' ') && k.trim().length > 1 && k.split(' ')[0] === c; })) { first = c; at = now; }
    return null;
  };
}
