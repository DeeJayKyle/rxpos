// Light / Dark / Follow system picks a palette within what the owner allows (src/themes.js → paletteFor).
import { THEMES, THEME_GROUPS, RETIRED, themeById, paletteFor, allowedThemes, themeVars, ACCENTS, withAccent, contrast } from '../src/themes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

check('all themes allowed: light → Mint Teal', paletteFor('light') === 'mint-teal');
check('all themes allowed: dark → RxPOS Navy Teal', paletteFor('dark') === 'navy-teal');
check('without the defaults: the first palette of that base', paletteFor('light', THEMES.filter((t) => t.id !== 'mint-teal')) === 'electric-blue' && paletteFor('dark', THEMES.filter((t) => t.id !== 'navy-teal')) === 'electric-blue');
check('Navy Teal: the navy page, teal actions; Mint Teal: white cards on the mint page', (() => { const o = themeVars(THEMES.find((t) => t.id === 'navy-teal')), d = themeVars(THEMES.find((t) => t.id === 'mint-teal')); return o['--bg'] === '#0a2233' && o['--primary'] === '#14b8a6' && d['--bg'] === '#cfe6e6' && d['--surface'] === '#ffffff' && d['--primary'] === '#0f8a8a'; })());
const restricted = allowedThemes({ themes: ['tokyo-night', 'mint', 'clinic-blue'] }); // retired ids: navy-teal, forest-green, electric-blue
check('restricted: light prefers the owner\'s default when it is light (a retired id counts as its replacement)', paletteFor('light', restricted, 'mint') === 'forest-green');
check('restricted: light falls back to the first allowed light palette', paletteFor('light', restricted) === 'electric-blue');
check('restricted: dark → the only allowed dark palette', paletteFor('dark', restricted, 'mint') === 'navy-teal');
check('no palette of that base: falls back to the first allowed', paletteFor('dark', allowedThemes({ themes: ['mint', 'clinic-blue', 'sunrise'] })) === 'electric-blue');
check('the 10 two-colour themes in 3 groups, each one in a group', THEMES.length === 10 && THEMES.every((t) => THEME_GROUPS.includes(t.group)));
check('every retired id resolves to a kept theme (saved preferences keep working)', Object.entries(RETIRED).every(([o, n]) => !THEMES.some((t) => t.id === o) && themeById(o).id === n) && themeById('daylight-clinical').id === 'mint-teal' && themeById('midnight-pro').id === 'navy-teal' && themeById('oled').id === 'navy-teal');
check('every theme is flat (no page gradient)', THEMES.every((t) => themeVars(t)['--bg-grad'] === 'none'));

// Accent presets: only the brand colour changes, and every palette stays AA readable with every preset
let worst = Infinity, where = '';
for (const t of THEMES) for (const a of ACCENTS) {
  const v = themeVars(withAccent(t, a.id));
  const [g1, g2] = v['--accent-grad'].match(/#[0-9a-f]{6}/gi);
  for (const [x, y] of [[v['--primary-text'], v['--surface']], [v['--on-accent'], g1], [v['--on-accent'], g2], [v['--muted'], v['--surface']]]) {
    const r = contrast(x, y); if (r < worst) { worst = r; where = `${t.id} + ${a.id}`; }
  }
}
check(`every theme × accent preset keeps links, button text and muted text at AA (worst ${worst.toFixed(2)}, ${where})`, worst >= 4.5);
const hl = THEMES.find((t) => t.id === 'mint-teal');
check('an accent changes only the brand colours', JSON.stringify({ ...withAccent(hl, 'violet').c, primary: 0, primary2: 0 }) === JSON.stringify({ ...hl.c, primary: 0, primary2: 0 }));
check('an unknown accent leaves the palette as it is', withAccent(hl, 'nope') === hl);

// two colours (the owner's choice, 17 Nov 2026): every colour a page shows is a shade of the strong colour or the menu
// colour (or white / near black); warnings and the table colours included, each readable on the page
const hue = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.08) return null;
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
const near = (h, list) => hue(h) === null || list.some((x) => hue(x) !== null && Math.abs(((hue(h) - hue(x) + 540) % 360) - 180) <= 22);
const keys = ['--ok', '--warn', '--danger', '--violet', '--info', '--blue', ...Array.from({ length: 8 }, (_, i) => `--hue-${i}`), '--viz-1', '--viz-2', '--m-in', '--m-purch', '--m-exp', '--m-profit', '--pos-action', '--pos-halt'];
const off = [];
for (const t of THEMES) { const v = themeVars(t); for (const k of keys) if (!near(v[k], [t.c.primary, t.c.sidebar])) off.push(`${t.id} ${k} ${v[k]}`); }
check('every theme: warnings, table, chart and till colours are shades of its two colours', off.length === 0, off.slice(0, 6).join(', '));
let low = [];
for (const t of THEMES) { const v = themeVars(t); for (const k of ['--ok', '--warn', '--danger']) for (const bg of [v['--surface'], v['--bg']]) if (contrast(v[k], bg) < 4.5) low.push(`${t.id} ${k} on ${bg} ${contrast(v[k], bg).toFixed(2)}`); }
check('every theme: warning text reads at AA on the page and on cards', low.length === 0, low.slice(0, 4).join(', '));
low = [];
for (const t of THEMES) { const v = themeVars(t); for (let i = 0; i < 8; i++) if (contrast('#ffffff', v[`--hue-${i}`]) < 4.5) low.push(`${t.id} hue-${i}`); }
check('every theme: white numbers read on every table colour (Add Stock badges)', low.length === 0, low.join(', '));
check('every menu reads (its text on the menu colour ≥ 4.5:1)', THEMES.every((t) => contrast(t.c.sidebarText || '#aab6ca', t.c.sidebar) >= 4.5));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
