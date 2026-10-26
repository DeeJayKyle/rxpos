// Light / Dark / Follow system picks a palette within what the owner allows (src/themes.js → paletteFor).
import { THEMES, paletteFor, allowedThemes, themeVars } from '../src/themes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + x : ''}`); };

check('all themes allowed: light → RxPOS Hybrid Light', paletteFor('light') === 'hybrid-light');
check('all themes allowed: dark → RxPOS Hybrid Dark', paletteFor('dark') === 'hybrid-dark');
const restricted = allowedThemes({ themes: ['tokyo-night', 'mint', 'clinic-blue'] });
check('restricted: light prefers the owner\'s default when it is light', paletteFor('light', restricted, 'mint') === 'mint');
check('restricted: light falls back to the first allowed light palette', paletteFor('light', restricted) === 'clinic-blue');
check('restricted: dark → the only allowed dark palette', paletteFor('dark', restricted, 'mint') === 'tokyo-night');
check('no palette of that base: falls back to the first allowed', paletteFor('dark', allowedThemes({ themes: ['mint', 'clinic-blue', 'light'] })) === 'light');
check('the old ids still exist (saved preferences keep working)', ['light', 'dark'].every((id) => THEMES.some((t) => t.id === id)));
check('hybrid palettes are flat (no page gradient)', ['hybrid-light', 'hybrid-dark'].every((id) => themeVars(THEMES.find((t) => t.id === id))['--bg-grad'] === 'none'));
check('other palettes keep their gradient', themeVars(THEMES.find((t) => t.id === 'light'))['--bg-grad'] !== 'none');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
