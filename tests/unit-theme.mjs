// Light / Dark / Follow system picks a palette within what the owner allows (src/themes.js → paletteFor).
import { THEMES, THEME_GROUPS, RETIRED, themeById, paletteFor, allowedThemes, themeVars, ACCENTS, withAccent, contrast } from '../src/themes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

check('all themes allowed: light → RxPOS Daylight Clinical', paletteFor('light') === 'daylight-clinical');
check('all themes allowed: dark → RxPOS OLED Black', paletteFor('dark') === 'oled');
check('without the defaults: the first palette of that base', paletteFor('light', THEMES.filter((t) => t.id !== 'daylight-clinical')) === 'cobalt' && paletteFor('dark', THEMES.filter((t) => t.id !== 'oled')) === 'midnight-pro');
check('OLED Black is pure black with raised cards; Daylight has white cards', (() => { const o = themeVars(THEMES.find((t) => t.id === 'oled')), d = themeVars(THEMES.find((t) => t.id === 'daylight-clinical')); return o['--bg'] === '#000000' && o['--surface'] === '#0b0e14' && o['--primary'] === '#2dd4bf' && d['--bg'] === '#f5f7fa' && d['--surface'] === '#ffffff' && d['--primary'] === '#0d9488'; })());
const restricted = allowedThemes({ themes: ['tokyo-night', 'mint', 'clinic-blue'] }); // retired ids: midnight-pro, forest-green, cobalt
check('restricted: light prefers the owner\'s default when it is light (a retired id counts as its replacement)', paletteFor('light', restricted, 'mint') === 'forest-green');
check('restricted: light falls back to the first allowed light palette', paletteFor('light', restricted) === 'cobalt');
check('restricted: dark → the only allowed dark palette', paletteFor('dark', restricted, 'mint') === 'midnight-pro');
check('no palette of that base: falls back to the first allowed', paletteFor('dark', allowedThemes({ themes: ['mint', 'clinic-blue', 'sunrise'] })) === 'cobalt');
check('the top 10 themes in 3 groups, each one in a group', THEMES.length === 10 && THEMES.every((t) => THEME_GROUPS.includes(t.group)));
check('every retired id resolves to a kept theme (saved preferences keep working)', Object.entries(RETIRED).every(([o, n]) => !THEMES.some((t) => t.id === o) && themeById(o).id === n) && themeById('light').id === 'daylight-clinical' && themeById('dark').id === 'midnight-pro');
check('the dashboard looks are flat (no page gradient)', ['charcoal-sky', 'lime-studio', 'aqua-navy', 'forest-green'].every((id) => themeVars(THEMES.find((t) => t.id === id))['--bg-grad'] === 'none'));
check('other palettes keep their gradient', themeVars(THEMES.find((t) => t.id === 'sunrise'))['--bg-grad'] !== 'none');

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
const hl = THEMES.find((t) => t.id === 'daylight-clinical');
check('an accent changes only the brand colours', JSON.stringify({ ...withAccent(hl, 'violet').c, primary: 0, primary2: 0 }) === JSON.stringify({ ...hl.c, primary: 0, primary2: 0 }));
check('an unknown accent leaves the palette as it is', withAccent(hl, 'nope') === hl);

// three colours at most: a neutral base, the menu colour, one brand colour (its second tone the same hue)
const hue = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null;
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
check('every theme: the two brand tones are one colour (hues within 25°)', THEMES.every((t) => Math.abs(((hue(t.c.primary) - hue(t.c.primary2) + 540) % 360) - 180) <= 25), THEMES.map((t) => `${t.id} ${Math.round(hue(t.c.primary))}/${Math.round(hue(t.c.primary2))}`).join(' '));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
