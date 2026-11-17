import { LOGO_SVG } from './logomark.js';
// Colour themes. Each theme is a light or dark base plus its own palette, applied as CSS variables. Since 17 Nov 2026
// (the owner's references and review), 9 two-colour themes: colour 1 is strong (the menu, buttons, the active tab, headings),
// colour 2 is soft (the page, cards, table headings and row stripes); text is near black or white. Warnings, tables and
// pills use shades of the same two colours (themeVars), with their words and icons, so every page keeps to two colours.
// Older themes map to the closest new one (RETIRED). The owner chooses which themes each pharmacy may use.

const T = (id, name, base, c, inspired = '', group = '') => ({ id, name, base, c, inspired, group });
/** The groups of the theme menu, in order */
export const THEME_GROUPS = ['Bold sidebars', 'Dark sidebars', 'Soft tints'];

const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => `rgba(${hexToRgb(h).join(', ')}, ${a})`;
const mix = (h, w, t) => { const a = hexToRgb(h), b = hexToRgb(w); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const lum = (h) => { const [r, g, b] = hexToRgb(h).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

// ---- contrast: every theme is made readable (WCAG AA, 4.5:1 for text) when it is applied ----
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const INK = '#0b1220';
/** Move a colour towards black or white until it reads on every background given */
function readable(fg, bgs, toward, min = 4.5) {
  let c = fg;
  for (let i = 0; i < 30 && Math.min(...bgs.map((b) => contrast(c, b))) < min; i++) c = mix(c, toward, 0.06);
  return c;
}
/** A menu colour that takes dark text (orange, sage) rather than white: the one that reads better */
export const lightMenu = (side) => lum(side) > 0.22;

/** A two-colour theme: [c1] strong (buttons, active, headings), [c2] the soft page tint, [side] the menu (c1 by default) */
const duo = (id, name, group, { c1, c2, side = c1, sideText, base = 'light', inspired = '', strong = false }) => {
  const dark = base === 'dark';
  const lightSide = lightMenu(side);
  // a coloured menu with white text: deepened just enough for AA
  if (!lightSide) side = readable(side, ['#ffffff'], '#000000');
  const text = dark ? mix(c2, '#ffffff', 0.9) : mix(c1, '#000000', 0.84);
  return T(id, name, base, {
    c1, c2,
    bg: c2,
    surface: dark ? mix(c2, '#ffffff', 0.05) : '#ffffff',
    surface2: dark ? mix(c2, '#ffffff', 0.09) : mix(c2, '#ffffff', 0.5),
    border: dark ? 'rgba(255, 255, 255, 0.10)' : rgba(mix(c1, '#000000', 0.4), 0.12),
    borderStrong: dark ? 'rgba(255, 255, 255, 0.20)' : rgba(mix(c1, '#000000', 0.4), 0.24),
    text,
    muted: dark ? mix(text, c2, 0.38) : mix(text, '#ffffff', 0.4),
    primary: c1,
    primary2: mix(c1, '#000000', 0.14),
    sidebar: side,
    sidebar2: mix(side, '#000000', lightSide ? 0.06 : 0.14),
    sidebarText: sideText || (lightSide ? mix(side, '#000000', 0.78) : lum(side) > 0.03 ? '#ffffff' : undefined),
    // stronger colour (the owner's review, 17 Nov 2026): deeper table row and heading tints
    // table stripes kept light (the owner's review, 17 Nov 2026): a soft wash of the row colour, the headings stronger
    rowTint: strong ? 6 : 4, headTint: strong ? 22 : 16,
    flat: true,
  }, inspired, group);
};

export const THEMES = [
  // Bold sidebars: the menu in colour 1, the pages tinted with colour 2
  duo('electric-blue', 'Electric Blue', 'Bold sidebars', { c1: '#0a4dff', c2: '#dfe8ff', strong: true, inspired: 'Bright blue menu, blue-washed pages' }),
  duo('royal-purple', 'Royal Purple', 'Bold sidebars', { c1: '#6d4ae8', c2: '#f4f1fd', side: '#3b1a7a', inspired: 'Deep purple menu with white words, violet actions' }),
  duo('forest-green', 'Forest Green', 'Bold sidebars', { c1: '#1e8c4e', c2: '#dcefe3', strong: true, inspired: 'Green menu, green-washed pages' }),
  // Dark sidebars and the dark theme
  duo('charcoal-lime', 'Lime Charcoal', 'Dark sidebars', { c1: '#1f1f2a', c2: '#eef7d6', side: '#c8f169', sideText: '#1f1f2a', strong: true, inspired: 'Lime menu with charcoal words, charcoal actions' }),
  duo('midnight-indigo', 'Midnight Indigo', 'Dark sidebars', { c1: '#5b5bf0', c2: '#e6e6fb', side: '#1b1d2e', strong: true, inspired: 'Midnight menu, indigo actions' }),
  duo('navy-teal', 'RxPOS Navy Teal', 'Dark sidebars', { c1: '#14b8a6', c2: '#0a2233', side: '#0f2a44', base: 'dark', strong: true, inspired: 'Navy and teal: the RxPOS till' }),
  // Soft tints: the whole page washed in colour 2
  duo('lavender', 'Lavender', 'Soft tints', { c1: '#7451eb', c2: '#e4dcff', strong: true, inspired: 'Violet on lavender' }),
  duo('sage', 'Sage', 'Soft tints', { c1: '#2f6b45', c2: '#e3eee1', side: '#8fb98b', strong: true, inspired: 'Sage menu, deep green words' }),
  duo('mint-teal', 'Mint Teal', 'Soft tints', { c1: '#0f8a8a', c2: '#cfe6e6', strong: true, inspired: 'Teal on mint, the RxPOS colour' }),
];
/** Themes retired → the new theme closest to each, so a saved choice or an owner's list keeps working */
export const RETIRED = {
  'daylight-clinical': 'mint-teal', cobalt: 'electric-blue', 'royal-violet': 'royal-purple', sunrise: 'mint-teal', 'charcoal-sky': 'midnight-indigo',
  'lime-studio': 'charcoal-lime', 'aqua-navy': 'electric-blue', 'cobalt-blue': 'electric-blue', 'sunny-orange': 'mint-teal', oled: 'navy-teal', 'midnight-pro': 'navy-teal',
  light: 'mint-teal', 'hybrid-light': 'mint-teal', 'solarized-light': 'mint-teal', 'clinic-blue': 'electric-blue', mint: 'forest-green',
  'rose-dawn': 'mint-teal', sand: 'mint-teal', coral: 'mint-teal', 'github-light': 'midnight-indigo', 'nord-snow': 'electric-blue',
  'soft-grey': 'midnight-indigo', 'teal-glass': 'mint-teal', paper: 'mint-teal',
  dark: 'navy-teal', 'hybrid-dark': 'navy-teal', 'tokyo-night': 'navy-teal', nord: 'navy-teal', dracula: 'navy-teal', mocha: 'navy-teal',
  'solarized-dark': 'navy-teal', 'one-dark': 'navy-teal', 'rose-pine': 'navy-teal', forest: 'navy-teal', ocean: 'navy-teal',
  gruvbox: 'navy-teal', 'github-dark': 'navy-teal', 'gold-night': 'navy-teal', 'ember-forge': 'navy-teal', 'contrast-dark': 'navy-teal',
};
/** A theme id as it is now (a retired one → its replacement) */
export const currentThemeId = (id) => RETIRED[id] || id;
export const themeById = (id) => THEMES.find((t) => t.id === currentThemeId(id)) || THEMES[0];
/** Themes a pharmacy may use (set by the owner); everything when the owner hasn't restricted it */
export const allowedThemes = (branding) => {
  const ids = branding?.themes?.length ? branding.themes.map(currentThemeId) : THEMES.map((t) => t.id);
  return THEMES.filter((t) => ids.includes(t.id));
};

/** Button gradient and its text colour: white or dark ink, whichever reads better; the colours deepen until it passes */
function accent(p1, p2, dark) {
  const score = (on, a, b) => Math.min(contrast(on, a), contrast(on, b));
  // light themes keep the classic white-on-colour button (the colour deepens); dark themes use whichever reads better
  // whichever reads better (lime and orange buttons take dark ink, as the owner's references)
  const on = score('#ffffff', p1, p2) >= score(INK, p1, p2) ? '#ffffff' : INK;
  const toward = on === '#ffffff' ? '#000000' : '#ffffff';
  let a = p1, b = p2;
  for (let i = 0; i < 30 && score(on, a, b) < 4.5; i++) { if (contrast(on, a) < 4.5) a = mix(a, toward, 0.05); if (contrast(on, b) < 4.5) b = mix(b, toward, 0.05); }
  return { a, b, on };
}

/** The CSS variables of a theme (pure, so it can be checked) */
export function themeVars(t) {
  const c = t.c, dark = t.base === 'dark';
  const btn = accent(c.primary, c.primary2, dark);
  return {
    '--bg': c.bg, '--surface': c.surface, '--surface-2': c.surface2, '--border': c.border, '--border-strong': c.borderStrong,
    '--text': c.text, '--muted': readable(c.muted, [c.bg, c.surface, c.surface2], dark ? '#ffffff' : '#000000'), '--primary': c.primary, '--primary-2': c.primary2,
    '--primary-text': readable(c.primary, [c.surface, c.surface2], dark ? '#ffffff' : '#000000'),
    '--on-accent': btn.on, '--accent-grad': `linear-gradient(135deg, ${btn.a} 0%, ${btn.b} 100%)`,
    '--primary-dark': dark ? mix(c.primary, '#000000', 0.12) : mix(c.primary, '#000000', 0.18),
    '--primary-soft': dark ? rgba(c.primary, 0.14) : mix(c.primary, '#ffffff', 0.84),
    '--primary-ink': dark ? mix(c.primary, '#ffffff', 0.25) : readable(mix(c.primary, '#000000', 0.35), [mix(c.primary, '#ffffff', 0.84), c.surface], '#000000'),
    '--bg-grad': c.flat ? 'none' : `radial-gradient(1100px 560px at 100% -10%, ${rgba(c.primary, dark ? 0.12 : 0.13)} 0%, transparent 60%), radial-gradient(850px 500px at -10% 110%, ${rgba(c.primary2, dark ? 0.1 : 0.1)} 0%, transparent 55%)`,
    '--sidebar': c.sidebar, '--sidebar-2': c.sidebar2, ...(c.sidebarText ? { '--sidebar-text': c.sidebarText } : {}),
    ...duoVars(c, dark),
  };
}

/** The logo's second colour (the capsule's lower half): the menu colour when it differs from the brand colour, else a
 *  deeper shade of it */
const logo2 = (c) => (c.sidebar.toLowerCase() !== c.primary.toLowerCase() && !lightMenu(c.sidebar) ? c.sidebar : mix(c.primary, '#000000', 0.35));

/** The RxPOS mark in a theme's colours (the browser tab's icon follows the theme too) */
export const themedLogo = (c) => LOGO_SVG.replace(/#0f766e|#0d9488|#10b981/g, c.primary).replace('#f59e0b', logo2(c));

/** Two colours only (the owner's choice, 17 Nov 2026): warnings, pills and table colours are shades of the theme's
 *  strong colour, each readable (AA) on the page; their words and icons tell them apart. */
function duoVars(c, dark) {
  const toward = dark ? '#ffffff' : '#000000';
  const on = [c.surface, c.surface2, c.bg];
  const shade = (t) => readable(dark ? mix(c.primary, '#ffffff', t) : mix(c.primary, '#000000', t), on, toward);
  const soft = (t) => (dark ? rgba(c.primary, t) : mix(c.primary, '#ffffff', 1 - t));
  const ok = shade(0.05), warn = shade(dark ? 0.3 : 0.4), danger = shade(dark ? 0.6 : 0.7);
  // eight table colours, all from the theme: the strong colour, the menu colour and shades between
  // (deep enough for the white numbers on Add Stock's line badges)
  const hues = [c.primary, c.sidebar, mix(c.primary, '#000000', 0.3), mix(c.sidebar, c.primary, 0.5), mix(c.primary, '#000000', 0.15), mix(c.sidebar, '#000000', 0.2), mix(c.primary, '#000000', 0.45), mix(c.primary, c.sidebar, 0.3)]
    .map((h) => readable(h, ['#ffffff'], '#000000'));
  return {
    '--ok': ok, '--ok-soft': soft(0.14), '--warn': warn, '--warn-soft': soft(0.2), '--danger': danger, '--danger-soft': soft(0.26),
    '--violet': shade(0.2), '--violet-soft': soft(0.16), '--info': shade(0.12), '--info-soft': soft(0.14), '--blue': shade(0.1), '--blue-soft': soft(0.14),
    '--c2': c.c2 || c.bg, '--c1-deep': shade(0.25), '--logo-2': logo2(c), '--menu-lit': readable(c.primary, ['#ffffff'], '#000000'), '--menu-ink': readable(mix(lightMenu(c.sidebar) || c.sidebar === c.primary ? c.primary : c.sidebar, '#000000', 0.62), ['#ffffff', '#f1f4f8'], '#000000', 7), '--row-tint': `${c.rowTint ?? 7}%`, '--row-hover': `${(c.rowTint ?? 7) + 4}%`, '--head-tint': `${c.headTint ?? 16}%`,
    // charts, the till's actions and the Vivid tiles: the same two colours
    '--viz-1': c.primary, '--viz-2': c.sidebar === c.primary ? mix(c.primary, toward, 0.45) : c.sidebar,
    '--m-in': c.primary, '--m-purch': mix(c.primary, toward, 0.35), '--m-exp': danger, '--m-profit': c.sidebar === c.primary ? warn : c.sidebar,
    '--pos-action': c.primary, '--pos-action-2': mix(c.primary, toward, 0.25), '--pos-halt': danger,
    ...Object.fromEntries(['teal', 'blue', 'violet', 'orange', 'amber', 'red', 'green'].flatMap((k, i) => {
      const a = readable(mix(c.primary, '#000000', 0.18 + i * 0.05), ['#ffffff'], '#000000'), b = readable(mix(c.primary, '#000000', 0.05 + i * 0.05), ['#ffffff'], '#000000');
      return [[`--v-${k}-a`, a], [`--v-${k}-b`, b]];
    })),
    ...Object.fromEntries(hues.map((h, i) => [`--hue-${i}`, h])),
  };
}

// Accent presets: change only the brand / action colour of a palette (buttons, links, highlights). Status colours
// (ok / warn / danger) are separate tokens and never follow the accent. Each pair is [primary, primary-2] per base;
// themeVars() still makes the result readable (AA), as for any palette.
export const ACCENTS = [
  { id: 'emerald', name: 'Emerald', light: ['#008c58', '#0e9f96'], dark: ['#16a36a', '#20c9c3'] },
  { id: 'ocean', name: 'Ocean Blue', light: ['#1d64d8', '#267bff'], dark: ['#267bff', '#20c9c3'] },
  { id: 'violet', name: 'Violet', light: ['#6d43e0', '#8456f5'], dark: ['#8456f5', '#267bff'] },
  { id: 'midnight', name: 'Midnight Turquoise', light: ['#0b7f86', '#13a3a0'], dark: ['#20c9c3', '#267bff'] },
];
/** A palette with an accent preset applied (or unchanged when there is none) */
export function withAccent(t, accentId) {
  const a = ACCENTS.find((x) => x.id === accentId);
  if (!a) return t;
  const [primary, primary2] = a[t.base];
  return { ...t, c: { ...t.c, primary, primary2 } };
}
const ACCENT_KEY = 'rxpos-accent';
export const savedAccent = () => { try { const v = localStorage.getItem(ACCENT_KEY) || ''; return ACCENTS.some((a) => a.id === v) ? v : ''; } catch { return ''; } };
export const saveAccent = (id) => { try { id ? localStorage.setItem(ACCENT_KEY, id) : localStorage.removeItem(ACCENT_KEY); } catch {} };

/** Apply a theme (and optional accent preset) to the page (CSS variables on <html>) */
export function applyTheme(id, accentId = '') {
  const t = withAccent(themeById(id), accentId);
  const c = t.c, dark = t.base === 'dark';
  const root = document.documentElement;
  root.dataset.theme = t.base;
  root.dataset.palette = t.id;
  root.dataset.sidebar = lightMenu(c.sidebar) ? 'light' : 'dark'; // light sidebars use dark text (styles/themes-ref.css)
  if (!c.sidebarText) root.style.removeProperty('--sidebar-text');
  if (ACCENTS.some((a) => a.id === accentId)) root.dataset.accent = accentId; else delete root.dataset.accent;
  for (const [k, val] of Object.entries(themeVars(t))) root.style.setProperty(k, val);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? c.sidebar : c.primary);
  // the browser tab's icon in the theme's colours
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) { icon.setAttribute('type', 'image/svg+xml'); icon.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(themedLogo(c))); }
}

const KEY = 'pharmapos-theme';
export const savedTheme = () => { try { return currentThemeId(localStorage.getItem(KEY) || ''); } catch { return ''; } };
export const saveTheme = (id) => { try { localStorage.setItem(KEY, id); } catch {} };

// Light / Dark / Follow system. "system" is kept apart from the palette, so the chosen palette survives switching back.
const MODE_KEY = 'rxpos-theme-mode';
export const savedMode = () => { try { return localStorage.getItem(MODE_KEY) === 'system' ? 'system' : ''; } catch { return ''; } };
export const saveMode = (m) => { try { m === 'system' ? localStorage.setItem(MODE_KEY, m) : localStorage.removeItem(MODE_KEY); } catch {} };
export const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
/** The palette for a light or dark base among the themes a pharmacy allows: Mint Teal / RxPOS Navy Teal first, then
 *  the owner's default, then the first of that base */
export const DEFAULT_PALETTE = { light: 'mint-teal', dark: 'navy-teal' };
export const paletteFor = (base, list = THEMES, preferred) =>
  (list.find((t) => t.id === DEFAULT_PALETTE[base]) || list.find((t) => t.id === currentThemeId(preferred) && t.base === base) || list.find((t) => t.base === base) || list[0] || THEMES[0]).id;
/** The theme to paint at start-up: the saved palette, or the system's light / dark when following it (or nothing is saved yet) */
export const startupTheme = () => (savedMode() === 'system' || !savedTheme() ? paletteFor(systemDark() ? 'dark' : 'light') : savedTheme());
