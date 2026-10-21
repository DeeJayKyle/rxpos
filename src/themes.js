// Colour themes. Each theme is a light or dark base plus its own palette, applied as CSS variables.
// Inspired by well-known open palettes (Nord, Dracula, Catppuccin, Gruvbox, Solarized, Tokyo Night, Rosé Pine,
// One Dark, GitHub Primer) and by pharmacy / clinic brand colours. The owner chooses which themes each pharmacy may use.

const T = (id, name, base, c, inspired = '') => ({ id, name, base, c, inspired });
export const THEMES = [
  // light
  T('light', 'RxPOS Teal', 'light', { bg: '#f3f6f9', surface: '#ffffff', surface2: '#f7f9fb', border: '#e4e9ef', borderStrong: '#cfd8e3', text: '#0e1726', muted: '#64748b', primary: '#0d9488', primary2: '#0891b2', sidebar: '#0b1220', sidebar2: '#111a2e' }),
  T('clinic-blue', 'Clinic Blue', 'light', { bg: '#f2f6fc', surface: '#ffffff', surface2: '#f5f8fd', border: '#dfe7f3', borderStrong: '#c6d3e6', text: '#0c1a33', muted: '#5b6b86', primary: '#1d64d8', primary2: '#0ea5e9', sidebar: '#0b1a36', sidebar2: '#12264b' }),
  T('mint', 'Fresh Mint', 'light', { bg: '#f1f8f5', surface: '#ffffff', surface2: '#f4faf7', border: '#dcebe4', borderStrong: '#c2dbcf', text: '#0f231b', muted: '#5a7468', primary: '#059669', primary2: '#65a30d', sidebar: '#062419', sidebar2: '#0b3324' }),
  T('sunrise', 'Sunrise', 'light', { bg: '#fbf6f1', surface: '#ffffff', surface2: '#fdf9f5', border: '#efe3d6', borderStrong: '#e2cfbb', text: '#2a1a0e', muted: '#7c6553', primary: '#d97706', primary2: '#e11d48', sidebar: '#2a160a', sidebar2: '#3b2010' }),
  T('lavender', 'Lavender', 'light', { bg: '#eff1f5', surface: '#ffffff', surface2: '#f4f5f9', border: '#dce0e8', borderStrong: '#ccd0da', text: '#4c4f69', muted: '#6c6f85', primary: '#8839ef', primary2: '#1e66f5', sidebar: '#1e1e2e', sidebar2: '#292a3e' }, 'Catppuccin Latte'),
  T('rose-dawn', 'Rose Dawn', 'light', { bg: '#faf4ed', surface: '#fffaf3', surface2: '#f8efe6', border: '#ebdfd3', borderStrong: '#dfdad9', text: '#575279', muted: '#797593', primary: '#b4637a', primary2: '#d7827e', sidebar: '#191724', sidebar2: '#1f1d2e' }, 'Rosé Pine Dawn'),
  T('solarized-light', 'Solarized Light', 'light', { bg: '#fdf6e3', surface: '#fffbef', surface2: '#f6efdc', border: '#e8dfc6', borderStrong: '#d9cfb3', text: '#073642', muted: '#657b83', primary: '#268bd2', primary2: '#2aa198', sidebar: '#002b36', sidebar2: '#073642' }, 'Solarized'),
  T('github-light', 'Clean Grey', 'light', { bg: '#f6f8fa', surface: '#ffffff', surface2: '#f6f8fa', border: '#d0d7de', borderStrong: '#afb8c1', text: '#1f2328', muted: '#59636e', primary: '#0969da', primary2: '#8250df', sidebar: '#24292f', sidebar2: '#32383f' }, 'GitHub Primer'),
  T('nord-snow', 'Nord Snow', 'light', { bg: '#eceff4', surface: '#ffffff', surface2: '#f2f4f8', border: '#d8dee9', borderStrong: '#c5ccda', text: '#2e3440', muted: '#4c566a', primary: '#5e81ac', primary2: '#88c0d0', sidebar: '#2e3440', sidebar2: '#3b4252' }, 'Nord'),
  T('sand', 'Savanna Sand', 'light', { bg: '#f9f5d7', surface: '#fbf1c7', surface2: '#f2e5bc', border: '#e5d5a8', borderStrong: '#d5c4a1', text: '#3c3836', muted: '#665c54', primary: '#af3a03', primary2: '#79740e', sidebar: '#282828', sidebar2: '#32302f' }, 'Gruvbox Light'),
  T('coral', 'Coral Care', 'light', { bg: '#fff5f4', surface: '#ffffff', surface2: '#fff8f7', border: '#f5dedb', borderStrong: '#ecc7c2', text: '#2b1412', muted: '#80605c', primary: '#e8505b', primary2: '#f59e0b', sidebar: '#2b1215', sidebar2: '#3a1a1e' }),
  T('paper', 'High Contrast Light', 'light', { bg: '#ffffff', surface: '#ffffff', surface2: '#f3f3f3', border: '#9a9a9a', borderStrong: '#555555', text: '#000000', muted: '#333333', primary: '#0050b3', primary2: '#003a80', sidebar: '#000000', sidebar2: '#1a1a1a' }, 'accessibility'),
  // dark
  T('dark', 'RxPOS Night', 'dark', { bg: '#070b14', surface: '#0f1624', surface2: '#131c2d', border: '#1e293b', borderStrong: '#2b3a52', text: '#e6edf7', muted: '#8b9ab3', primary: '#2dd4bf', primary2: '#22d3ee', sidebar: '#050912', sidebar2: '#0b1220' }),
  T('tokyo-night', 'Tokyo Night', 'dark', { bg: '#16161e', surface: '#1a1b26', surface2: '#1f2335', border: '#292e42', borderStrong: '#3b4261', text: '#c0caf5', muted: '#7f88b8', primary: '#7aa2f7', primary2: '#bb9af7', sidebar: '#13131a', sidebar2: '#1a1b26' }, 'Tokyo Night'),
  T('nord', 'Nord Polar', 'dark', { bg: '#242933', surface: '#2e3440', surface2: '#343b49', border: '#3b4252', borderStrong: '#4c566a', text: '#eceff4', muted: '#a3adbf', primary: '#88c0d0', primary2: '#81a1c1', sidebar: '#1f232b', sidebar2: '#2a2f3a' }, 'Nord'),
  T('dracula', 'Dracula', 'dark', { bg: '#21222c', surface: '#282a36', surface2: '#2f3241', border: '#383a4a', borderStrong: '#44475a', text: '#f8f8f2', muted: '#a4a8c4', primary: '#bd93f9', primary2: '#ff79c6', sidebar: '#1b1c24', sidebar2: '#22232e' }, 'Dracula'),
  T('mocha', 'Mocha', 'dark', { bg: '#11111b', surface: '#1e1e2e', surface2: '#232336', border: '#313244', borderStrong: '#45475a', text: '#cdd6f4', muted: '#9399b2', primary: '#cba6f7', primary2: '#89b4fa', sidebar: '#0d0d15', sidebar2: '#181825' }, 'Catppuccin Mocha'),
  T('gruvbox', 'Gruvbox Ember', 'dark', { bg: '#1d2021', surface: '#282828', surface2: '#2f2c2a', border: '#3c3836', borderStrong: '#504945', text: '#ebdbb2', muted: '#a89984', primary: '#fabd2f', primary2: '#fe8019', sidebar: '#161819', sidebar2: '#1d2021' }, 'Gruvbox'),
  T('solarized-dark', 'Solarized Dark', 'dark', { bg: '#00212b', surface: '#002b36', surface2: '#073642', border: '#0b4352', borderStrong: '#1d5361', text: '#e3ddc8', muted: '#93a1a1', primary: '#2aa198', primary2: '#268bd2', sidebar: '#001a22', sidebar2: '#00212b' }, 'Solarized'),
  T('one-dark', 'One Dark', 'dark', { bg: '#1e2127', surface: '#282c34', surface2: '#2e333c', border: '#3a3f4b', borderStrong: '#4b5263', text: '#dcdfe4', muted: '#9da5b4', primary: '#61afef', primary2: '#c678dd', sidebar: '#191c21', sidebar2: '#21252b' }, 'Atom One Dark'),
  T('github-dark', 'Graphite', 'dark', { bg: '#0d1117', surface: '#161b22', surface2: '#1c2129', border: '#30363d', borderStrong: '#484f58', text: '#e6edf3', muted: '#9198a1', primary: '#58a6ff', primary2: '#3fb950', sidebar: '#010409', sidebar2: '#0d1117' }, 'GitHub Primer'),
  T('rose-pine', 'Rosé Night', 'dark', { bg: '#191724', surface: '#1f1d2e', surface2: '#26233a', border: '#2a273f', borderStrong: '#403d52', text: '#e0def4', muted: '#908caa', primary: '#ebbcba', primary2: '#c4a7e7', sidebar: '#141220', sidebar2: '#191724' }, 'Rosé Pine'),
  T('forest', 'Forest Pharmacy', 'dark', { bg: '#07130e', surface: '#0d1f17', surface2: '#12281e', border: '#1b3a2c', borderStrong: '#285240', text: '#e3f5ec', muted: '#89b09d', primary: '#34d399', primary2: '#a3e635', sidebar: '#050e0a', sidebar2: '#0a1912' }),
  T('ocean', 'Deep Ocean', 'dark', { bg: '#04121f', surface: '#0a1d30', surface2: '#0f263d', border: '#163452', borderStrong: '#22486e', text: '#e2eefa', muted: '#86a3c0', primary: '#38bdf8', primary2: '#2dd4bf', sidebar: '#030d17', sidebar2: '#071827' }),
  T('contrast-dark', 'High Contrast Dark', 'dark', { bg: '#000000', surface: '#0a0a0a', surface2: '#141414', border: '#7a7a7a', borderStrong: '#bdbdbd', text: '#ffffff', muted: '#d6d6d6', primary: '#ffd60a', primary2: '#4cc9f0', sidebar: '#000000', sidebar2: '#0f0f0f' }, 'accessibility'),
];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
/** Themes a pharmacy may use (set by the owner); everything when the owner hasn't restricted it */
export const allowedThemes = (branding) => {
  const ids = branding?.themes?.length ? branding.themes : THEMES.map((t) => t.id);
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
    '--bg-grad': `radial-gradient(1100px 560px at 100% -10%, ${rgba(c.primary, dark ? 0.12 : 0.13)} 0%, transparent 60%), radial-gradient(850px 500px at -10% 110%, ${rgba(c.primary2, dark ? 0.1 : 0.1)} 0%, transparent 55%)`,
    '--sidebar': c.sidebar, '--sidebar-2': c.sidebar2,
  };
}

/** Apply a theme to the page (CSS variables on <html>) */
export function applyTheme(id) {
  const t = themeById(id);
  const c = t.c, dark = t.base === 'dark';
  const root = document.documentElement;
  root.dataset.theme = t.base;
  root.dataset.palette = t.id;
  for (const [k, val] of Object.entries(themeVars(t))) root.style.setProperty(k, val);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? c.sidebar : c.primary);
}

const KEY = 'pharmapos-theme';
export const savedTheme = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const saveTheme = (id) => { try { localStorage.setItem(KEY, id); } catch {} };
