// Gradients (1.17.0, the owner's choice), kept on each device beside the theme, the style and the colour level:
//   background  off | soft | bold   a mesh of the theme's own colours behind the pages (cards stay solid, so words read)
//   accents     true | false        the main buttons, the open menu item, card headings and toggles in a two-tone sweep
//   preset      '' | sunrise | ocean | forest | berry | dusk | neon   a ready gradient for the menu and the banner
// Every colour put behind words is made readable (WCAG AA) here, as the themes are (tests/unit-theme.mjs checks it).
import { contrast, readableOn } from './themes.js';

export const GRADIENT_BACKGROUNDS = [['off', 'Off'], ['soft', 'Soft'], ['bold', 'Bold']];
/** The presets: [id, name, from, to] */
export const GRADIENT_PRESETS = [
  ['sunrise', 'Sunrise', '#ff7e5f', '#feb47b'],
  ['ocean', 'Ocean', '#2193b0', '#6dd5ed'],
  ['forest', 'Forest', '#134e5e', '#71b280'],
  ['berry', 'Berry', '#8e2de2', '#4a00e0'],
  ['dusk', 'Dusk', '#2c3e50', '#fd746c'],
  ['neon', 'Neon', '#7f00ff', '#e100ff'],
];

const KEY = 'rxpos-gradient';
const DEFAULT = { background: 'off', accents: false, preset: '' };
export const savedGradient = () => { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; } };
export const saveGradient = (g) => {
  try { g.background === 'off' && !g.accents && !g.preset ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* storage blocked */ }
};

/** A preset's colours for words on it: the two ends deepened (or lightened) until white or dark ink reads on both (AA) */
export function presetColours(id) {
  const p = GRADIENT_PRESETS.find(([k]) => k === id);
  if (!p) return null;
  const [, , from, to] = p;
  const ink = '#0b1220';
  const onWhite = Math.min(contrast('#ffffff', from), contrast('#ffffff', to)), onInk = Math.min(contrast(ink, from), contrast(ink, to));
  const on = onWhite >= onInk ? '#ffffff' : ink;
  return { a: readableOn(from, on), b: readableOn(to, on), on };
}

/** Apply the gradient choices: data attributes on <html> plus the preset's colours (styles/gradients.css does the rest) */
export function applyGradient(g = savedGradient()) {
  const root = document.documentElement;
  root.dataset.grad = g.background || 'off';
  if (g.accents) root.dataset.gradAccents = 'on'; else delete root.dataset.gradAccents;
  const c = presetColours(g.preset);
  if (c) {
    root.dataset.gradPreset = g.preset;
    root.style.setProperty('--gp-a', c.a); root.style.setProperty('--gp-b', c.b); root.style.setProperty('--gp-on', c.on);
  } else delete root.dataset.gradPreset;
}
