// Colour level (1.7): "Calm" (the standard look) or "Vivid" (solid colour tiles, coloured row buttons). It is
// independent of the theme and the surface style, and each device keeps its own choice. In Vivid every colour has one
// meaning everywhere (tiles, buttons, chart lines):
//   teal = money in · orange = money out · violet = profit · blue = counts and information
//   amber = stock and expiry warnings · red = urgent (expired, out of stock, a loss) · green = good / done
// Tiles use a dark-to-darker gradient of each colour so white text keeps WCAG AA (4.5:1) on every part of it
// (tests/contrast-test.mjs checks these exact values).
export const VIVID = {
  teal: ['#115e59', '#0f766e'],
  orange: ['#9a3412', '#c2410c'],
  violet: ['#5b21b6', '#6d28d9'],
  blue: ['#1e40af', '#1d4ed8'],
  amber: ['#854d0e', '#a16207'],
  red: ['#9f1239', '#be123c'],
  green: ['#065f46', '#047857'],
};
export const VIVID_TEXT = '#ffffff';

export const LEVELS = [
  { id: 'calm', name: 'Calm', hint: 'Soft colour accents (standard)' },
  { id: 'vivid', name: 'Vivid', hint: 'Solid colour tiles and buttons' },
];
const KEY = 'rxpos-colour';
export const savedLevel = () => { try { return localStorage.getItem(KEY) === 'vivid' ? 'vivid' : 'calm'; } catch { return 'calm'; } };
export const saveLevel = (id) => { try { id === 'vivid' ? localStorage.setItem(KEY, 'vivid') : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

/** Apply the colour level: a data attribute on <html> plus the palette as CSS variables (styles.css does the rest) */
export function applyLevel(id) {
  const root = document.documentElement;
  root.dataset.colour = id === 'vivid' ? 'vivid' : 'calm';
  for (const [k, [a, b]] of Object.entries(VIVID)) { root.style.setProperty(`--v-${k}-a`, a); root.style.setProperty(`--v-${k}-b`, b); }
}
