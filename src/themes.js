// Colour themes. Each theme is a light or dark base plus its own palette, applied as CSS variables. Since Nov 2026,
// the top 10 themes in three groups (THEME_GROUPS), three colours each; the look-alikes (Nord, Dracula,
// Catppuccin, Gruvbox, Solarized, Tokyo Night, …) were retired and map to the closest kept theme (RETIRED). The owner
// chooses which themes each pharmacy may use.

const T = (id, name, base, c, inspired = '', group = '') => ({ id, name, base, c, inspired, group });
/** The groups of the theme menu, in order (Nov 2026: 36 themes cut to the top 10) */
export const THEME_GROUPS = ['Light', 'Dashboard looks', 'Dark'];
export const THEMES = [
  // The top 10 (Nov 2026, the owner's choice): ranked for working speed (no blur or heavy effects), vivid and clear colour
  // coding on every page, readability (AA everywhere) and smooth transitions. Each uses three colours at most: a neutral
  // base, the frame (menu) colour and one brand colour (its second tone is a shade of the same colour).
  // Light
  T('daylight-clinical', 'RxPOS Daylight Clinical', 'light', { bg: '#f5f7fa', surface: '#ffffff', surface2: '#f8fafc', border: 'rgba(15, 23, 42, 0.08)', borderStrong: 'rgba(15, 23, 42, 0.16)', text: '#0f172a', muted: '#5b6678', primary: '#0d9488', primary2: '#0f766e', sidebar: '#0b1220', sidebar2: '#111a2e', flat: true }, 'Typography-led minimalism', 'Light'),
  T('cobalt', 'Cobalt Blue', 'light', { bg: '#f5f7fb', surface: '#ffffff', surface2: '#f7f9fd', border: 'rgba(15, 23, 42, 0.08)', borderStrong: 'rgba(15, 23, 42, 0.16)', text: '#0b1533', muted: '#586179', primary: '#1d4fd8', primary2: '#1e40af', sidebar: '#1d4ed8', sidebar2: '#1e40af', flat: true }, 'Blue sidebar, white cards', 'Light'),
  T('royal-violet', 'Royal Violet', 'light', { bg: '#f6f5fb', surface: '#ffffff', surface2: '#f8f7fd', border: 'rgba(46, 16, 101, 0.08)', borderStrong: 'rgba(46, 16, 101, 0.16)', text: '#1e1147', muted: '#5f5a7a', primary: '#6d3fd9', primary2: '#7c4ee4', sidebar: '#2e1065', sidebar2: '#4c1d95', flat: true }, 'Purple sidebar, white cards', 'Light'),
  T('sunrise', 'Sunrise', 'light', { bg: '#fbf6f1', surface: '#ffffff', surface2: '#fdf9f5', border: '#efe3d6', borderStrong: '#e2cfbb', text: '#2a1a0e', muted: '#7c6553', primary: '#d97706', primary2: '#b45309', sidebar: '#2a160a', sidebar2: '#3b2010' }, '', 'Light'),
  // Dashboard looks (the owner's references, 17 Nov 2026), each with its own page treatment in styles/themes-ref.css
  T('charcoal-sky', 'Charcoal & Sky', 'light', { bg: '#eceef2', surface: '#ffffff', surface2: '#f4f5f7', border: 'rgba(17, 17, 20, 0.08)', borderStrong: 'rgba(17, 17, 20, 0.16)', text: '#18181b', muted: '#62656c', primary: '#2f6fb5', primary2: '#3b82c4', sidebar: '#38383b', sidebar2: '#2b2b2e', flat: true }, 'Charcoal frame, sky-blue actions: Finance and the dashboard', 'Dashboard looks'),
  T('lime-studio', 'Lime Studio', 'light', { bg: '#f3f3ee', surface: '#ffffff', surface2: '#f7f7f2', border: 'rgba(24, 24, 32, 0.08)', borderStrong: 'rgba(24, 24, 32, 0.16)', text: '#18181f', muted: '#62626b', primary: '#3f6212', primary2: '#4d7c0f', sidebar: '#1f2029', sidebar2: '#2a2b36', flat: true }, 'Navy menu, lime highlights: schedules, calendar, quiz', 'Dashboard looks'),
  T('aqua-navy', 'Aqua Navy', 'light', { bg: '#edf2f7', surface: '#ffffff', surface2: '#f3f7fb', border: 'rgba(15, 36, 64, 0.08)', borderStrong: 'rgba(15, 36, 64, 0.16)', text: '#0f2440', muted: '#56677e', primary: '#1b4b8a', primary2: '#2563a8', sidebar: '#163a6b', sidebar2: '#1b4b8a', flat: true }, 'Navy and aqua: sales overview, reports', 'Dashboard looks'),
  T('forest-green', 'Forest Green', 'light', { bg: '#eff1f2', surface: '#ffffff', surface2: '#f5f6f7', border: 'rgba(17, 22, 20, 0.08)', borderStrong: 'rgba(17, 22, 20, 0.16)', text: '#111614', muted: '#5b6360', primary: '#15803d', primary2: '#166534', sidebar: '#ffffff', sidebar2: '#f6f7f7', sidebarText: '#323a37', flat: true }, 'White and forest green: payments, purchases, Finance', 'Dashboard looks'),
  // Dark
  T('oled', 'RxPOS OLED Black', 'dark', { bg: '#000000', surface: '#0b0e14', surface2: '#121722', border: 'rgba(255, 255, 255, 0.10)', borderStrong: 'rgba(255, 255, 255, 0.18)', text: '#f8fafc', muted: '#9aa4b2', primary: '#2dd4bf', primary2: '#14b8a6', sidebar: '#000000', sidebar2: '#0b0e14', flat: true }, 'True OLED dark', 'Dark'),
  T('midnight-pro', 'Midnight Pro', 'dark', { bg: '#0b0f19', surface: '#0f172a', surface2: '#131c31', border: '#1e293b', borderStrong: '#334155', text: '#e2e8f0', muted: '#94a3b8', primary: '#10b981', primary2: '#059669', sidebar: '#020617', sidebar2: '#0b1220', flat: true }, 'Linear / Vercel', 'Dark'),
];
/** Themes retired in Nov 2026 → the kept theme closest to each, so a saved choice or an owner's list keeps working */
export const RETIRED = {
  light: 'daylight-clinical', 'hybrid-light': 'daylight-clinical', 'solarized-light': 'daylight-clinical', 'clinic-blue': 'cobalt', mint: 'forest-green',
  lavender: 'royal-violet', 'rose-dawn': 'sunrise', sand: 'sunrise', coral: 'sunrise', 'github-light': 'daylight-clinical', 'nord-snow': 'daylight-clinical',
  'soft-grey': 'daylight-clinical', sage: 'forest-green', 'teal-glass': 'daylight-clinical', paper: 'daylight-clinical',
  dark: 'midnight-pro', 'hybrid-dark': 'midnight-pro', 'tokyo-night': 'midnight-pro', nord: 'midnight-pro', dracula: 'midnight-pro', mocha: 'midnight-pro',
  'solarized-dark': 'midnight-pro', 'one-dark': 'midnight-pro', 'rose-pine': 'midnight-pro', forest: 'midnight-pro', ocean: 'midnight-pro',
  gruvbox: 'oled', 'github-dark': 'oled', 'gold-night': 'oled', 'ember-forge': 'oled', 'contrast-dark': 'oled',
};
/** A theme id as it is now (a retired one → its replacement) */
export const currentThemeId = (id) => RETIRED[id] || id;
export const themeById = (id) => THEMES.find((t) => t.id === currentThemeId(id)) || THEMES[0];
/** Themes a pharmacy may use (set by the owner); everything when the owner hasn't restricted it */
export const allowedThemes = (branding) => {
  const ids = branding?.themes?.length ? branding.themes.map(currentThemeId) : THEMES.map((t) => t.id);
  return THEMES.filter((t) => ids.includes(t.id));
};

const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => `rgba(${hexToRgb(h).join(', ')}, ${a})`;
const mix = (h, w, t) => { const a = hexToRgb(h), b = hexToRgb(w); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

// ---- contrast: every theme is made readable (WCAG AA, 4.5:1 for text) when it is applied ----
const lum = (h) => { const [r, g, b] = hexToRgb(h).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const INK = '#0b1220';
/** Move a colour towards black or white until it reads on every background given */
function readable(fg, bgs, toward, min = 4.5) {
  let c = fg;
  for (let i = 0; i < 30 && Math.min(...bgs.map((b) => contrast(c, b))) < min; i++) c = mix(c, toward, 0.06);
  return c;
}
/** Button gradient and its text colour: white or dark ink, whichever reads better; the colours deepen until it passes */
function accent(p1, p2, dark) {
  const score = (on, a, b) => Math.min(contrast(on, a), contrast(on, b));
  // light themes keep the classic white-on-colour button (the colour deepens); dark themes use whichever reads better
  const on = !dark || score('#ffffff', p1, p2) >= score(INK, p1, p2) ? '#ffffff' : INK;
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
    '--primary-ink': dark ? mix(c.primary, '#ffffff', 0.25) : mix(c.primary, '#000000', 0.35),
    '--bg-grad': c.flat ? 'none' : `radial-gradient(1100px 560px at 100% -10%, ${rgba(c.primary, dark ? 0.12 : 0.13)} 0%, transparent 60%), radial-gradient(850px 500px at -10% 110%, ${rgba(c.primary2, dark ? 0.1 : 0.1)} 0%, transparent 55%)`,
    '--sidebar': c.sidebar, '--sidebar-2': c.sidebar2, ...(c.sidebarText ? { '--sidebar-text': c.sidebarText } : {}),
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
  root.dataset.sidebar = lum(c.sidebar) > 0.4 ? 'light' : 'dark'; // light sidebars use dark text (styles/themes-ref.css)
  if (!c.sidebarText) root.style.removeProperty('--sidebar-text');
  if (ACCENTS.some((a) => a.id === accentId)) root.dataset.accent = accentId; else delete root.dataset.accent;
  for (const [k, val] of Object.entries(themeVars(t))) root.style.setProperty(k, val);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? c.sidebar : c.primary);
}

const KEY = 'pharmapos-theme';
export const savedTheme = () => { try { return currentThemeId(localStorage.getItem(KEY) || ''); } catch { return ''; } };
export const saveTheme = (id) => { try { localStorage.setItem(KEY, id); } catch {} };

// Light / Dark / Follow system. "system" is kept apart from the palette, so the chosen palette survives switching back.
const MODE_KEY = 'rxpos-theme-mode';
export const savedMode = () => { try { return localStorage.getItem(MODE_KEY) === 'system' ? 'system' : ''; } catch { return ''; } };
export const saveMode = (m) => { try { m === 'system' ? localStorage.setItem(MODE_KEY, m) : localStorage.removeItem(MODE_KEY); } catch {} };
export const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
/** The palette for a light or dark base among the themes a pharmacy allows: Daylight Clinical / OLED Black first, then
 *  the owner's default, then the first of that base */
export const DEFAULT_PALETTE = { light: 'daylight-clinical', dark: 'oled' };
export const paletteFor = (base, list = THEMES, preferred) =>
  (list.find((t) => t.id === DEFAULT_PALETTE[base]) || list.find((t) => t.id === currentThemeId(preferred) && t.base === base) || list.find((t) => t.base === base) || list[0] || THEMES[0]).id;
/** The theme to paint at start-up: the saved palette, or the system's light / dark when following it (or nothing is saved yet) */
export const startupTheme = () => (savedMode() === 'system' || !savedTheme() ? paletteFor(systemDark() ? 'dark' : 'light') : savedTheme());
