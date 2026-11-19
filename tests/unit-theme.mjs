// Light / Dark / Follow system picks a palette within what the owner allows (src/themes.js → paletteFor).
import { THEMES, THEME_GROUPS, RETIRED, themeById, paletteFor, allowedThemes, themeVars, ACCENTS, withAccent, contrast } from '../src/themes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

check('all themes allowed: light → Mint Teal', paletteFor('light') === 'mint-teal');
check('all themes allowed: dark → RxPOS Navy Teal', paletteFor('dark') === 'navy-teal');
check('without the defaults: the first palette of that base', paletteFor('light', THEMES.filter((t) => t.id !== 'mint-teal')) === 'electric-blue' && paletteFor('dark', THEMES.filter((t) => t.id !== 'navy-teal')) === 'midnight-blue');
check('Navy Teal: the navy page, teal actions; Mint Teal: white cards on the mint page', (() => { const o = themeVars(THEMES.find((t) => t.id === 'navy-teal')), d = themeVars(THEMES.find((t) => t.id === 'mint-teal')); return o['--bg'] === '#0a2233' && o['--primary'] === '#14b8a6' && d['--bg'] === '#cfe6e6' && d['--surface'] === '#ffffff' && d['--primary'] === '#0f8a8a'; })());
const restricted = allowedThemes({ themes: ['tokyo-night', 'mint', 'clinic-blue'] }); // retired ids: navy-teal, emerald-mint, sky-blue
check('restricted: light prefers the owner\'s default when it is light (a retired id counts as its replacement)', paletteFor('light', restricted, 'mint') === 'emerald-mint');
check('restricted: light falls back to the first allowed light palette', paletteFor('light', restricted) === 'sky-blue');
check('restricted: dark → the only allowed dark palette', paletteFor('dark', restricted, 'mint') === 'navy-teal');
check('no palette of that base: falls back to the first allowed', paletteFor('dark', allowedThemes({ themes: ['mint', 'clinic-blue', 'sunrise'] })) === 'sky-blue');
check('the 18 two-colour themes in 5 sets of 3 or 4, each one in a group; the Dark set is all dark (1.14.0)', THEMES.length === 18 && THEME_GROUPS.length === 5 && THEME_GROUPS.every((g) => [3, 4].includes(THEMES.filter((t) => t.group === g).length)) && THEMES.every((t) => THEME_GROUPS.includes(t.group)) && THEMES.filter((t) => t.group === 'Dark').every((t) => t.base === 'dark') && THEMES.filter((t) => t.base === 'dark').length === 4);
check('every retired id resolves to a kept theme (saved preferences keep working)', Object.entries(RETIRED).every(([o, n]) => !THEMES.some((t) => t.id === o) && themeById(o).id === n) && themeById('daylight-clinical').id === 'mint-teal' && themeById('midnight-pro').id === 'navy-teal' && themeById('oled').id === 'navy-teal');
check('every theme is flat (no page gradient)', THEMES.every((t) => themeVars(t)['--bg-grad'] === 'none'));

// only the 15 themes (the owner's choice, 17 Nov 2026): no accent presets; a saved one changes nothing
check('no accent presets: only the themes\' own colours', ACCENTS.length === 0 && withAccent(THEMES[0], 'violet') === THEMES[0]);
let worst = Infinity, where = '';
for (const t of THEMES) { const v = themeVars(t); const [g1, g2] = v['--accent-grad'].match(/#[0-9a-f]{6}/gi);
  for (const [x, y] of [[v['--primary-text'], v['--surface']], [v['--on-accent'], g1], [v['--on-accent'], g2], [v['--muted'], v['--surface']]]) { const r = contrast(x, y); if (r < worst) { worst = r; where = t.id; } } }
check(`every theme keeps links, button text and muted text at AA (worst ${worst.toFixed(2)}, ${where})`, worst >= 4.5);

// two colours (the owner's choice, 17 Nov 2026): every colour a page shows is a shade of the strong colour or the menu
// colour (or white / near black); warnings and the table colours included, each readable on the page
const hue = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.08) return null;
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
const near = (h, list) => hue(h) === null || list.some((x) => hue(x) !== null && Math.abs(((hue(h) - hue(x) + 540) % 360) - 180) <= 22);
const keys = ['--violet', '--info', '--blue', ...Array.from({ length: 8 }, (_, i) => `--hue-${i}`), '--viz-1', '--viz-2', '--m-in', '--m-purch', '--m-profit', '--pos-action'];
const off = [];
for (const t of THEMES) { const v = themeVars(t); for (const k of keys) if (!near(v[k], [t.c.primary, t.c.sidebar])) off.push(`${t.id} ${k} ${v[k]}`); }
check('every theme: table, chart and till colours are shades of its two colours', off.length === 0, off.slice(0, 6).join(', '));
// 1.14.0 (the owner's review, 19 Nov 2026): status keeps its meaning in every theme: OK is green, warnings amber, danger
// (expired, out of stock, errors, the till's stop) red; each reads on its own soft pill too
const inRange = (h, a, b) => hue(h) !== null && (a <= b ? hue(h) >= a && hue(h) <= b : hue(h) >= a || hue(h) <= b);
const wrong = [];
for (const t of THEMES) {
  const v = themeVars(t);
  for (const [k, a, b] of [['--ok', 130, 175], ['--warn', 22, 50], ['--danger', 335, 12], ['--m-exp', 335, 12], ['--pos-halt', 335, 12]]) if (!inRange(v[k], a, b)) wrong.push(`${t.id} ${k} ${v[k]}`);
  if (t.base !== 'dark') for (const k of ['ok', 'warn', 'danger']) if (contrast(v[`--${k}`], v[`--${k}-soft`]) < 4.5) wrong.push(`${t.id} --${k} on its pill ${contrast(v[`--${k}`], v[`--${k}-soft`]).toFixed(2)}`);
}
check('every theme: OK is green, warnings amber, danger red, each readable on its pill', wrong.length === 0, wrong.slice(0, 6).join(', '));
let low = [];
for (const t of THEMES) { const v = themeVars(t); for (const k of ['--ok', '--warn', '--danger']) for (const bg of [v['--surface'], v['--bg']]) if (contrast(v[k], bg) < 4.5) low.push(`${t.id} ${k} on ${bg} ${contrast(v[k], bg).toFixed(2)}`); }
check('every theme: warning text reads at AA on the page and on cards', low.length === 0, low.slice(0, 4).join(', '));
low = [];
for (const t of THEMES) { const v = themeVars(t); for (let i = 0; i < 8; i++) if (contrast('#ffffff', v[`--hue-${i}`]) < 4.5) low.push(`${t.id} hue-${i}`); }
check('every theme: white numbers read on every table colour (Add Stock badges)', low.length === 0, low.join(', '));
check('every theme: the open page\'s pill stands out from the menu (3:1) and its words read on it (4.5:1)', THEMES.every((t) => { const v = themeVars(t); return contrast(v['--pill'], t.c.sidebar) >= 3 && contrast(v['--pill-on'], v['--pill']) >= 4.5; }), THEMES.map((t) => { const v = themeVars(t); return `${t.id} ${contrast(v['--pill'], t.c.sidebar).toFixed(1)}/${contrast(v['--pill-on'], v['--pill']).toFixed(1)}`; }).join(' '));
check('every menu reads (its text on the menu colour ≥ 4.5:1)', THEMES.every((t) => contrast(t.c.sidebarText || '#aab6ca', t.c.sidebar) >= 4.5));
// both apps show the same themes (1.14.0): the Flutter palette list is generated from src/themes.js
{
  const fs = await import('node:fs');
  const { withPalettes } = await import('../tools/flutter-palettes.mjs');
  const dart = fs.readFileSync(new URL('../rxpos_flutter/lib/core/theme/themes.dart', import.meta.url), 'utf8');
  check('the Flutter apps have exactly the web app\'s themes (node tools/flutter-palettes.mjs)', withPalettes(dart) === dart);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
