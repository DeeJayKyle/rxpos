import { LOGO_SVG } from './logomark.js';
// Colour themes. Each theme is a light or dark base plus its own palette, applied as CSS variables. Since 17 Nov 2026
// (the owner's references and review), 15 two-colour themes in five sets: colour 1 is strong (the menu, buttons, the active tab, headings),
// colour 2 is soft (the page, cards, table headings and row stripes); text is near black or white. Warnings, tables and
// pills use shades of the same two colours (themeVars), with their words and icons, so every page keeps to two colours.
// Older themes map to the closest new one (RETIRED). The owner chooses which themes each pharmacy may use.

const T = (id, name, base, c, inspired = '', group = '', glossy = null) => ({ id, name, base, c, inspired, group, ...(glossy ? { glossy } : {}) });
/** The groups of the theme menu, in order */
// 1.17.0 (the owner's choice): look-alike themes merged and the sets regrouped; every dark theme in Dark (each light
// theme has its own dark twin too)
// 1.22.1 (the owner's request, 26 Nov 2026): some themes back, clustered by how alike they look (light or dark page,
// contrast, how many colours) so look-alikes sit together; near-duplicates in a group stay retired
export const THEME_GROUPS = ['Light', 'Dark', 'High contrast', 'Colourful'];

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
/** A colour moved towards black or white until [on] reads on it (4.5:1): for backgrounds behind words (gradients.js) */
export const readableOn = (bg, on) => readable(bg, [on], on === '#ffffff' ? '#000000' : '#ffffff');
/** A menu colour that takes dark text (orange, sage) rather than white: the one that reads better */
export const lightMenu = (side) => lum(side) > 0.22;

/** A two-colour theme: [c1] strong (buttons, active, headings), [c2] the soft page tint, [side] the menu (c1 by default) */
/** [c3] a second accent (the second chart series), [series] chart colours (the Multi-colour set), [pill] the open page's
 *  colour on the menu, [card] / [ink] / [soft] / [line] the palette's own card, text, soft tint and border (19 Nov 2026) */
const duo = (id, name, group, opts) => {
  let { c1, c2, side = c1, sideText, base = 'light', inspired = '', glossy = null, c3, series, pill, card, ink, soft, line } = opts;
  const dark = base === 'dark';
  const lightSide = lightMenu(side);
  // a coloured menu with white text: deepened just enough for AA
  if (!lightSide) side = readable(side, ['#ffffff'], '#000000');
  const text = ink || (dark ? mix(c2, '#ffffff', 0.9) : mix(c1, '#000000', 0.84));
  // every theme takes the glossy dashboard (the owner's reference, 19 Nov 2026): bright figure cards in four colours
  glossy = glossy || neonCards(c1);
  return { ...T(id, name, base, {
    c1, c2,
    // 1.16.0 (the owner's clean-up, fewer colours): light themes sit on a near-white page with only a breath of colour 2;
    // the colour is kept for the menu, headings, the main button, status and the figure cards
    bg: dark ? c2 : mix(c2, '#ffffff', 0.6),
    // dark cards a clearer step above the page, with a hairline (2026-11-18)
    surface: card || (dark ? mix(c2, '#ffffff', 0.08) : '#ffffff'),
    surface2: soft || (dark ? mix(card || mix(c2, '#ffffff', 0.08), '#ffffff', 0.06) : mix(c2, '#ffffff', 0.5)),
    border: line || (dark ? 'rgba(255, 255, 255, 0.14)' : rgba(mix(c1, '#000000', 0.4), 0.12)),
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
    // 1.16.0: quieter tables: a faint row stripe, a light heading tint
    rowTint: 3, headTint: 10,
    flat: true,
    ...(series || c3 ? { series: series || [c1, c3] } : {}), ...(pill ? { pill } : {}),
  }, inspired, group, glossy), args: opts };
};

// The Pharmacy themes (the owner's references, 19 Nov 2026): one per set, a glossy dashboard look (styles/glossy.css):
// a gradient menu, a welcome banner, and the four figure cards each in its own colour (sales in the theme's colour first)
const K = { green: '#16a34a', blue: '#2563eb', purple: '#7c3aed', amber: '#f59e0b' };
const kpis = (...ks) => ({ kpi: ks.map((k) => K[k] || k) });
const hueOf = (h) => { const [r, g, b] = hexToRgb(h).map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return null; const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
const hueGap = (a, b) => (a === null || b === null ? 180 : Math.abs(((a - b + 540) % 360) - 180));
// the neon reference's card colours: indigo, teal, magenta, pink, then amber and green
const NEON = ['#4f46e5', '#0fa5b5', '#a21caf', '#ec4899', '#f59e0b', '#16a34a', '#2563eb'];
/** A theme's four figure cards: its own colour first, then the three neon colours furthest from it and each other */
function neonCards(c1) {
  const out = [c1];
  for (const n of NEON) if (out.length < 4 && out.every((x) => hueGap(hueOf(x), hueOf(n)) >= 35)) out.push(n);
  for (const n of NEON) if (out.length < 4 && !out.includes(n)) out.push(n);
  return { kpi: out, vivid: true };
}

// 1.22.0 (the owner's clean-up, 26 Nov 2026): Light, Dark, High contrast and the pharmacy's Brand colour (Settings →
// Receipts & stock); 1.22.1 brought back 13 more, one per look in each group. Every other theme opens as the closest
// kept one (RETIRED), so a saved choice keeps working.
const BRAND_DEFAULT = '#16a34a';
const brandTheme = (c1) => duo('brand', 'Brand colour', 'Colourful', { c1, c2: mix(c1, '#ffffff', 0.88), side: mix(c1, '#000000', 0.6), strong: true, inspired: 'The pharmacy\'s own colour (Settings → Receipts & stock)' });
export const THEMES = [
  // Light: a pale page, one strong colour (one per hue)
  duo('mint-teal', 'Light', 'Light', { c1: '#0f8a8a', c2: '#cfe6e6', side: '#0f2222', strong: true, inspired: 'Teal on a near-white page, the RxPOS colour' }),
  duo('pharmacy-blue', 'Pharmacy Blue', 'Light', { c1: '#2563eb', c2: '#eaf1fc', side: '#0b2a5c', strong: true, glossy: kpis('blue', 'green', 'purple', 'amber'), inspired: 'Deep blue menu, four-colour figure cards' }),
  duo('pharmacy-green', 'Pharmacy Green', 'Light', { c1: '#16a34a', c2: '#eef6f0', side: '#0b3d24', strong: true, glossy: kpis('green', 'blue', 'purple', 'amber'), inspired: 'Deep green menu, four-colour figure cards' }),
  duo('royal-purple', 'Royal Purple', 'Light', { c1: '#6d4ae8', c2: '#f4f1fd', side: '#1e1433', inspired: 'Deep purple menu, violet pills' }),
  duo('sandstone-terracotta', 'Sandstone & Terracotta', 'Light', { c1: '#ea580c', c2: '#f5f3ef', side: '#292524', ink: '#292524', strong: true, inspired: 'Sandstone page, espresso menu, terracotta accents' }),
  // Dark: a dark page, one bright colour (one per hue)
  duo('navy-teal', 'Dark', 'Dark', { c1: '#14b8a6', c2: '#0a2233', side: '#0f2a44', base: 'dark', strong: true, inspired: 'Navy and teal, easy on the eyes at night' }),
  duo('midnight-blue', 'Midnight Blue', 'Dark', { c1: '#60a5fa', c2: '#0b1324', side: '#0a1a33', base: 'dark', strong: true, inspired: 'Night-blue page, bright blue pills' }),
  duo('pharmacy-night', 'Pharmacy Night', 'Dark', { c1: '#22c55e', c2: '#06130d', side: '#0a2a1a', base: 'dark', strong: true, glossy: kpis('green', 'blue', 'purple', 'amber'), inspired: 'Deep green at night, four-colour figure cards' }),
  duo('twilight-violet', 'Twilight Violet', 'Dark', { c1: '#8b5cf6', c2: '#13111c', card: '#1e1b2e', side: '#0e0c16', c3: '#ec4899', base: 'dark', strong: true, inspired: 'Twilight page, soft violet, pink series' }),
  duo('graphite-amber', 'Graphite Amber', 'Dark', { c1: '#fbbf24', c2: '#16161b', side: '#24242c', base: 'dark', strong: true, inspired: 'Graphite page, amber pills with dark words' }),
  // High contrast: black, white and one loud colour, for bright shops and tired eyes
  duo('high-contrast', 'High contrast', 'High contrast', { c1: '#0036a8', c2: '#ffffff', side: '#000000', ink: '#000000', line: '#3a3a3a', strong: true, inspired: 'Black words on white with strong borders: easiest to read in bright light' }),
  duo('mono-scarlet', 'Monochrome & Scarlet', 'High contrast', { c1: '#18181b', c2: '#fafafa', side: '#18181b', c3: '#ef4444', strong: true, inspired: 'Black and white, a scarlet second series' }),
  duo('graphite-lime', 'Graphite & Lime', 'High contrast', { c1: '#b6ff2e', c2: '#1a1d24', card: '#23262f', ink: '#f8fafc', side: '#14161c', base: 'dark', strong: true, inspired: 'Dark graphite page, high-visibility lime' }),
  // Colourful: several colours at once, and the pharmacy's own
  brandTheme(BRAND_DEFAULT),
  duo('cool-crisp', 'Cool & Crisp', 'Colourful', { c1: '#3b82f6', c2: '#f8fafc', side: '#0f172a', strong: true, series: ['#3b82f6', '#14b8a6', '#6366f1', '#f59e0b', '#f43f5e'], glossy: kpis('#3b82f6', '#14b8a6', '#6366f1', '#f59e0b'), inspired: 'Light shell, blue, teal, indigo, amber and rose charts' }),
  duo('royal-iris-butter', 'Royal Iris & Butter', 'Colourful', { c1: '#3a0ca3', c2: '#ffffff', side: '#3a0ca3', pill: '#fff275', c3: '#e0c400', ink: '#111827', line: '#e5e7eb', strong: true, inspired: 'Royal iris menu, butter-yellow badges' }),
  duo('vibrant-neon', 'Vibrant Neon', 'Colourful', { c1: '#22d3ee', c2: '#0f172a', side: '#0b1222', base: 'dark', strong: true, series: ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fde047'], glossy: { ...kpis('#22d3ee', '#a78bfa', '#34d399', '#f472b6'), vivid: true }, inspired: 'Dark shell, cyan, violet, emerald, pink and yellow charts' }),
];
/** Themes retired → Light or Dark (or the theme an older one was merged into), so a saved choice or an owner's list
 *  keeps working */
export const RETIRED = {
  // 1.22.1: near-duplicates → the closest theme kept in the same group
  'electric-blue': 'pharmacy-blue', 'sky-blue': 'pharmacy-blue', 'ocean-cyan': 'pharmacy-blue', 'steel-blue': 'pharmacy-blue', 'navy-sky': 'pharmacy-blue',
  'emerald-mint': 'pharmacy-green', 'sage': 'pharmacy-green', 'mist-teal-lilac': 'mint-teal',
  'pharmacy-purple': 'royal-purple', 'alabaster-indigo-coral': 'royal-purple',
  'pharmacy-amber': 'sandstone-terracotta', 'ubuntu-yaru': 'sandstone-terracotta',
  'night-lime': 'mono-scarlet', 'charcoal-lime': 'mono-scarlet',
  'terminal': 'pharmacy-night', 'neon-indigo': 'vibrant-neon',
  // older retirements (1.14.0 to 1.17.0), now resolved through the list above
  // 1.17.0: look-alikes merged into the closest kept theme (the owner's choice)
  'cobalt-amber': 'pharmacy-blue', 'porcelain-signal': 'electric-blue', 'deep-ocean-cyan': 'vibrant-neon', 'lavender': 'royal-purple', 'midnight-indigo': 'royal-purple', 'obsidian-purple-mint': 'twilight-violet', 'sage-emerald': 'emerald-mint', 'mint-coral': 'mint-teal', 'forest-green': 'pharmacy-green', 'amber-gold': 'pharmacy-amber', 'charcoal-gold': 'graphite-amber', 'dark-forest': 'pharmacy-night',
  'daylight-clinical': 'mint-teal', cobalt: 'electric-blue', 'royal-violet': 'royal-purple', sunrise: 'pharmacy-amber', 'charcoal-sky': 'steel-blue',
  'lime-studio': 'charcoal-lime', 'aqua-navy': 'ocean-cyan', 'cobalt-blue': 'electric-blue', 'sunny-orange': 'pharmacy-amber', oled: 'navy-teal', 'midnight-pro': 'navy-teal',
  light: 'mint-teal', 'hybrid-light': 'mint-teal', 'solarized-light': 'mint-teal', 'clinic-blue': 'sky-blue', mint: 'emerald-mint',
  'rose-dawn': 'pharmacy-amber', sand: 'pharmacy-amber', coral: 'pharmacy-amber', 'github-light': 'steel-blue', 'nord-snow': 'electric-blue',
  'soft-grey': 'steel-blue', 'teal-glass': 'mint-teal', paper: 'mint-teal',
  dark: 'navy-teal', 'hybrid-dark': 'navy-teal', 'tokyo-night': 'navy-teal', nord: 'navy-teal', dracula: 'navy-teal', mocha: 'navy-teal',
  'solarized-dark': 'navy-teal', 'one-dark': 'navy-teal', 'rose-pine': 'navy-teal', forest: 'navy-teal', ocean: 'navy-teal',
  gruvbox: 'navy-teal', 'github-dark': 'navy-teal', 'gold-night': 'navy-teal', 'ember-forge': 'navy-teal', 'contrast-dark': 'navy-teal',
};
/** A theme id as it is now (a retired one → its replacement) */
export const currentThemeId = (id) => {
  let x = id;
  for (let i = 0; i < 3 && RETIRED[x]; i++) x = RETIRED[x];
  // a retired theme's dark twin: Dark's own colours, or the twin of the light theme it became
  const base = x?.endsWith?.('-dark') && RETIRED[x.slice(0, -5)] ? currentThemeId(x.slice(0, -5)) : '';
  return base ? (base === 'navy-teal' ? base : base + '-dark') : x;
};
/** 1.17.0 (the owner's choice): every light theme has a dark twin made from its own colours, so Dark keeps the
 *  pharmacy's colours (Pharmacy Green stays green at night) instead of jumping to Navy Teal. The twins are not in the
 *  theme list: Light / Dark / System move between a theme and its twin. Id: the light theme's id + "-dark". */
const darkTwin = (t) => {
  const a = t.args;
  const c1 = lum(a.c1) < 0.05 ? mix(a.c1, '#ffffff', 0.55) : a.c1; // a near-black brand colour lightens to read at night
  const side0 = a.side || a.c1;
  return duo(t.id + '-dark', t.name + ' (dark)', t.group, {
    ...a, c1, c2: mix(c1, '#000000', 0.88), base: 'dark', card: undefined, soft: undefined, line: undefined, ink: undefined,
    side: lightMenu(side0) ? side0 : mix(side0, '#000000', 0.3),
    inspired: 'The dark twin of ' + t.name,
  });
};
export const THEME_TWINS = THEMES.filter((t) => t.base === 'light' && t.args).map((t) => ({ ...darkTwin(t), twinOf: t.id }));
const ALL_THEMES = [...THEMES, ...THEME_TWINS];
/** The Brand colour theme (and its dark twin) in the pharmacy's colour (Settings → Pharmacy → Brand colour) */
export function setBrandColor(hex) {
  const c = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex.toLowerCase() : BRAND_DEFAULT;
  const t = brandTheme(c), twin = { ...darkTwin(t), twinOf: 'brand' };
  for (const [list, id, v] of [[THEMES, 'brand', t], [THEME_TWINS, 'brand-dark', twin], [ALL_THEMES, 'brand', t], [ALL_THEMES, 'brand-dark', twin]]) list[list.findIndex((x) => x.id === id)] = v;
}
/** The same theme in the other base: a light theme's dark twin, a twin's light theme ('' when it has none) */
export const twinFor = (id, base) => {
  const t = ALL_THEMES.find((x) => x.id === currentThemeId(id));
  if (!t || t.base === base) return t?.id || '';
  if (base === 'dark') return THEME_TWINS.find((x) => x.twinOf === t.id)?.id || '';
  return t.twinOf || '';
};
export const themeById = (id) => ALL_THEMES.find((t) => t.id === currentThemeId(id)) || THEMES[0];
/** Themes a pharmacy may use (set by the owner); everything when the owner hasn't restricted it */
export const allowedThemes = (branding) => {
  const ids = branding?.themes?.length ? branding.themes.map(currentThemeId) : THEMES.map((t) => t.id);
  return [...THEMES.filter((t) => ids.includes(t.id)), ...THEME_TWINS.filter((t) => ids.includes(t.twinOf))];
};

/** Button gradient and its text colour: white or dark ink, whichever reads better; the colours deepen until it passes */
function accent(p1, p2) {
  const score = (on, a, b) => Math.min(contrast(on, a), contrast(on, b));
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
  const btn = accent(c.primary, c.primary2);
  return {
    '--bg': c.bg, '--surface': c.surface, '--surface-2': c.surface2, '--border': c.border, '--border-strong': c.borderStrong,
    '--text': c.text, '--muted': readable(c.muted, [c.bg, c.surface, c.surface2], dark ? '#ffffff' : '#000000'), '--primary': c.primary, '--primary-2': c.primary2,
    // links and brand text: readable on cards and on the tinted page itself (links sit on it)
    // …and on the soft colour 2 itself (totals and headings sit on it; 1.16.0: the page is lighter than colour 2 now)
    '--primary-text': readable(c.primary, [c.surface, c.surface2, c.bg, c.c2 || c.bg], dark ? '#ffffff' : '#000000'),
    '--on-accent': btn.on, '--primary-solid': btn.a, '--accent-grad': `linear-gradient(135deg, ${btn.a} 0%, ${btn.b} 100%)`,
    '--primary-dark': dark ? mix(c.primary, '#000000', 0.12) : mix(c.primary, '#000000', 0.18),
    '--primary-soft': dark ? rgba(c.primary, 0.14) : mix(c.primary, '#ffffff', 0.84),
    '--primary-ink': dark ? mix(c.primary, '#ffffff', 0.25) : readable(mix(c.primary, '#000000', 0.35), [mix(c.primary, '#ffffff', 0.84), c.surface], '#000000'),
    '--bg-grad': c.flat ? 'none' : `radial-gradient(1100px 560px at 100% -10%, ${rgba(c.primary, dark ? 0.12 : 0.13)} 0%, transparent 60%), radial-gradient(850px 500px at -10% 110%, ${rgba(c.primary2, dark ? 0.1 : 0.1)} 0%, transparent 55%)`,
    '--sidebar': c.sidebar, '--sidebar-2': c.sidebar2, ...(c.sidebarText ? { '--sidebar-text': c.sidebarText } : {}),
    ...duoVars(c, dark),
    ...(t.glossy ? glossyVars(t.glossy, c, dark) : {}),
  };
}

/** The Pharmacy themes' extra colours (styles/glossy.css), each readable (AA): the four figure cards (the first solid,
 *  the others soft in light themes; all four deep at night), the welcome banner and the menu's gradient */
function glossyVars(g, c, dark) {
  const v = {};
  g.kpi.forEach((h, i) => {
    const n = i + 1;
    if (g.vivid || dark || i === 0) {
      // vivid (the neon themes): bright cards as the references; otherwise deep at night
      const btn = dark && !g.vivid ? accent(mix(h, '#000000', 0.3), mix(h, '#000000', 0.58)) : accent(h, mix(h, '#000000', 0.28));
      Object.assign(v, { [`--kpi-${n}-a`]: btn.a, [`--kpi-${n}-b`]: btn.b, [`--kpi-${n}-on`]: btn.on, [`--kpi-${n}-sub`]: btn.on, [`--kpi-${n}-icon`]: rgba(btn.on === '#ffffff' ? '#ffffff' : '#000000', 0.18), [`--kpi-${n}-glyph`]: btn.on });
    } else {
      const a = mix(h, '#ffffff', 0.88), b = mix(h, '#ffffff', 0.76);
      const ink = readable(mix(h, '#000000', 0.62), [a, b], '#000000', 7);
      const sub = readable(mix(h, '#000000', 0.42), [a, b], '#000000');
      const glyph = readable(h, ['#ffffff'], '#000000', 3);
      Object.assign(v, { [`--kpi-${n}-a`]: a, [`--kpi-${n}-b`]: b, [`--kpi-${n}-on`]: ink, [`--kpi-${n}-sub`]: sub, [`--kpi-${n}-icon`]: glyph, [`--kpi-${n}-glyph`]: '#ffffff' });
    }
  });
  // the welcome banner: the menu colour into the theme's colour, deepened until white words read on both ends
  const hero = accent(c.sidebar, mix(c.primary, c.sidebar, dark ? 0.35 : 0.15));
  // the menu: a glow of the theme's colour at the top, deepening down; white words read on its lightest part
  const top = readable(mix(c.sidebar, c.primary, 0.28), [c.sidebarText || '#ffffff'], '#000000');
  // the daily chart's line (the number of sales): the fourth card's colour, readable (AA) on the cards; its badges' words
  // are the card colour on it
  const line = readable(g.kpi[3], [c.surface, c.surface2], dark ? '#ffffff' : '#000000');
  return { ...v, '--hero-a': hero.a, '--hero-b': hero.b, '--hero-on': hero.on, '--side-top': top, '--side-bottom': mix(c.sidebar, '#000000', 0.35), '--chart-line': line };
}

/** The open page's pill on the menu: the brand colour, brightened (or deepened on a light menu) until it stands out from
 *  the menu (3:1), with white or dark words, whichever reads better (at least 4.5:1) */
const menuPill = (c) => {
  const pill = c.pill || readable(c.primary, [c.sidebar], lightMenu(c.sidebar) ? '#000000' : '#ffffff', 3);
  const on = contrast('#ffffff', pill) >= contrast(INK, pill) ? '#ffffff' : INK;
  return { '--pill': readable(pill, [on], on === '#ffffff' ? '#000000' : '#ffffff'), '--pill-on': on };
};

/** The logo's second colour (the capsule's lower half): the menu colour when it differs from the brand colour, else a
 *  deeper shade of it */
const logo2 = (c) => (c.sidebar.toLowerCase() !== c.primary.toLowerCase() && !lightMenu(c.sidebar) ? c.sidebar : mix(c.primary, '#000000', 0.35));

/** The RxPOS mark in a theme's colours (the browser tab's icon follows the theme too) */
export const themedLogo = (c) => LOGO_SVG.replace(/#0f766e|#0d9488|#10b981/g, c.primary).replace('#f59e0b', logo2(c));

/** Two colours (the owner's choice, 17 Nov 2026): pills, tables and charts are shades of the theme's strong colour,
 *  each readable (AA) on the page. Status is the exception since 1.14.0: OK, warning and danger are green, amber and red. */
function duoVars(c, dark) {
  const toward = dark ? '#ffffff' : '#000000';
  // readable on the page, on cards and on the soft tinted pills they sit in (status pills, badges)
  const on = [c.surface, c.surface2, c.bg, dark ? mix(c.surface, c.primary, 0.26) : mix(c.primary, '#ffffff', 0.74)];
  const shade = (t) => readable(dark ? mix(c.primary, '#ffffff', t) : mix(c.primary, '#000000', t), on, toward);
  const soft = (t) => (dark ? rgba(c.primary, t) : mix(c.primary, '#ffffff', 1 - t));
  // 1.14.0 (the owner's review, 19 Nov 2026): status keeps its meaning in every theme: OK green, warnings amber,
  // danger red (expired, out of stock, errors), each made readable on the page, the cards and its own soft pill
  const status = (light, night, a) => {
    const soft = dark ? rgba(night, a) : mix(light, '#ffffff', 1 - a);
    return [readable(dark ? night : light, dark ? on : [...on, soft], toward), soft];
  };
  const [ok, okSoft] = status('#047857', '#34d399', 0.14), [warn, warnSoft] = status('#b45309', '#fbbf24', 0.18), [danger, dangerSoft] = status('#be123c', '#f87171', 0.16);
  // eight table colours, all from the theme: the strong colour, the menu colour and shades between
  // (deep enough for the white numbers on Add Stock's line badges)
  const hues = [c.primary, c.sidebar, mix(c.primary, '#000000', 0.3), mix(c.sidebar, c.primary, 0.5), mix(c.primary, '#000000', 0.15), mix(c.sidebar, '#000000', 0.2), mix(c.primary, '#000000', 0.45), mix(c.primary, c.sidebar, 0.3)]
    .map((h) => readable(h, ['#ffffff'], '#000000'));
  return {
    '--ok': ok, '--ok-soft': okSoft, '--warn': warn, '--warn-soft': warnSoft, '--danger': danger, '--danger-soft': dangerSoft,
    '--violet': shade(0.2), '--violet-soft': soft(0.16), '--info': shade(0.12), '--info-soft': soft(0.14), '--blue': shade(0.1), '--blue-soft': soft(0.14),
    // the one exception to two colours (2026-11-18): a real red, only for what blocks a sale (expired stock)
    '--block': readable(dark ? '#f87171' : '#c62828', on, toward), '--block-soft': dark ? 'rgba(248, 113, 113, 0.16)' : '#fdecec',
    '--c2': c.c2 || c.bg, '--c1-deep': shade(0.25), '--logo-2': logo2(c), '--menu-lit': readable(c.primary, ['#ffffff'], '#000000'), ...menuPill(c), '--menu-ink': readable(mix(lightMenu(c.sidebar) || c.sidebar === c.primary ? c.primary : c.sidebar, '#000000', 0.62), ['#ffffff', '#f1f4f8'], '#000000', 7), '--row-tint': `${c.rowTint ?? 7}%`, '--row-hover': `${(c.rowTint ?? 7) + 4}%`, '--head-tint': `${c.headTint ?? 16}%`,
    // charts, the till's actions and the Vivid tiles: the same two colours
    '--viz-1': c.primary, '--viz-2': c.sidebar === c.primary ? mix(c.primary, toward, 0.45) : c.sidebar,
    '--m-in': c.primary, '--m-purch': mix(c.primary, toward, 0.35), '--m-exp': danger, '--m-profit': c.sidebar === c.primary ? warn : c.sidebar,
    '--pos-action': c.primary, '--pos-action-2': mix(c.primary, toward, 0.25), '--pos-halt': danger,
    ...Object.fromEntries(['teal', 'blue', 'violet', 'orange', 'amber', 'red', 'green'].flatMap((k, i) => {
      const a = readable(mix(c.primary, '#000000', 0.18 + i * 0.05), ['#ffffff'], '#000000'), b = readable(mix(c.primary, '#000000', 0.05 + i * 0.05), ['#ffffff'], '#000000');
      return [[`--v-${k}-a`, a], [`--v-${k}-b`, b]];
    })),
    ...Object.fromEntries(hues.map((h, i) => [`--hue-${i}`, h])),
    ...seriesVars(c, toward),
  };
}

/** A palette's own chart colours (a second accent, or the Multi-colour set's five): the charts' lines and the table
 *  colours take them, each table colour deep enough for white numbers */
function seriesVars(c, toward) {
  const s = c.series;
  if (!s) return {};
  const at = (i) => s[i % s.length];
  return {
    '--viz-1': at(0), '--viz-2': at(1), '--m-in': at(0), '--m-profit': at(1), '--m-purch': s.length > 2 ? at(2) : mix(at(0), toward, 0.35),
    ...Object.fromEntries(s.slice(0, 8).map((h, i) => [`--hue-${i}`, readable(h, ['#ffffff'], '#000000')])),
  };
}

// Accent presets: change only the brand / action colour of a palette (buttons, links, highlights). Status colours
// (ok / warn / danger) are separate tokens and never follow the accent. Each pair is [primary, primary-2] per base;
// themeVars() still makes the result readable (AA), as for any palette.
// Accent presets were retired with the two-colour themes (the owner's choice, 17 Nov 2026: only the 15 themes' own
// colours); a saved accent is ignored.
export const ACCENTS = [];
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
  if (t.glossy) root.dataset.look = 'glossy'; else delete root.dataset.look; // the Pharmacy themes (styles/glossy.css)
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
export const startupTheme = () => {
  if (!savedTheme()) return paletteFor(systemDark() ? 'dark' : 'light');
  if (savedMode() !== 'system') return savedTheme();
  // 1.17.0: following the system keeps this device's theme in the system's light or dark (its twin), as a live switch does
  const base = systemDark() ? 'dark' : 'light';
  return twinFor(savedTheme(), base) || paletteFor(base);
};
