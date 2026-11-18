// Colours for the Add Stock / Edit purchase lines (1.10.0): every line has its own colour (stripe, number badge and a
// light tint across the row) and every column heading its own band. The colour belongs to the line (its `hue`), not
// to its place, so removing a line does not reshuffle the others. White text reads on every hue (tests/contrast-test.mjs).

/** 8 line colours: teal, blue, violet, pink, orange, amber, green, cyan (700-level, white text ≥ 4.5:1) */
export const LINE_HUES = ['#0f766e', '#1d4ed8', '#6d28d9', '#be185d', '#c2410c', '#b45309', '#15803d', '#0e7490'];

/** one colour per Add Stock column (keys of COL_LABEL in pages/Purchases.jsx); it moves with the column */
export const COL_HUES = { medicine: '#0f766e', qty: '#1d4ed8', cost: '#6d28d9', total: '#be185d', price: '#c2410c', batch: '#b45309', expiry: '#15803d' };

/** The same colours as the theme gives them (src/themes.js duoVars --hue-0…7: shades of its two colours), the fixed
 *  ones above as the fallback */
export const lineVar = (i) => `var(--hue-${i}, ${LINE_HUES[i]})`;
export const COL_VARS = Object.fromEntries(Object.entries(COL_HUES).map(([k, h]) => [k, lineVar(LINE_HUES.indexOf(h))]));

/** how much of the colour is mixed into the surface: row tint and heading band (kept in step with styles.css) */
export const ROW_TINT = 0.07, HEAD_TINT = 0.16, LABEL_MIX = 0.4;

let seq = 0;
/** the next line colour (a counter, so lines added one after another differ) */
export const nextHue = () => (seq++) % LINE_HUES.length;

/** the colour index of a line: its own, or one worked out from its key (lines from older drafts have none) */
export const hueOf = (line, fallback = 0) => {
  if (Number.isInteger(line?.hue)) return ((line.hue % LINE_HUES.length) + LINE_HUES.length) % LINE_HUES.length;
  const k = String(line?.key ?? fallback);
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h % LINE_HUES.length;
};

/** inline style for a row: the line colour as a CSS variable */
export const lineStyle = (line, fallback) => ({ '--line': lineVar(hueOf(line, fallback)) });
