// The Flutter apps' colour themes come from the web app's (src/themes.js), so both show the same colours.
//   node tools/flutter-palettes.mjs          write rxpos_flutter/lib/core/theme/themes.dart's palette list and groups
//   node tools/flutter-palettes.mjs --check  exit 1 if that file is not what src/themes.js gives (tests/unit-theme.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, THEME_GROUPS, themeVars } from '../src/themes.js';

const DART = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rxpos_flutter', 'lib', 'core', 'theme', 'themes.dart');

/** #rrggbb or rgba(r, g, b, a) → 0xAARRGGBB */
const argb = (c) => {
  const s = String(c).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return '0xFF' + m[1].toUpperCase();
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(s);
  if (m) return '0x' + [Math.round(+m[4] * 255), +m[1], +m[2], +m[3]].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  throw new Error('Not a colour: ' + s);
};
const q = (s) => "'" + s.replace(/'/g, "\\'") + "'";

/** A Pharmacy theme's glossy colours (src/themes.js glossyVars): the four figure cards (a, b, words, line, icon tile,
 *  icon), the welcome banner (a, b, words) and the menu's top and bottom */
const glossy = (t, v) => !t.glossy ? '' : `, glossy: Glossy(kpi: [${[1, 2, 3, 4].flatMap((n) => ['a', 'b', 'on', 'sub', 'icon', 'glyph'].map((k) => argb(v[`--kpi-${n}-${k}`]))).join(', ')}], hero: [${argb(v['--hero-a'])}, ${argb(v['--hero-b'])}, ${argb(v['--hero-on'])}], sideTop: ${argb(v['--side-top'])}, sideBottom: ${argb(v['--side-bottom'])})`;

/** The Dart source of the palette list and the groups */
export function dartPalettes() {
  const lines = [];
  for (const t of THEMES) {
    const c = t.c, v = themeVars(t);
    const side = c.sidebarText && c.sidebarText.toLowerCase() !== '#ffffff' ? `, sidebarText: ${argb(c.sidebarText)}` : '';
    lines.push(`  Palette(${q(t.id)}, ${q(t.name)}, ${t.base === 'dark'}, bg: ${argb(c.bg)}, surface: ${argb(c.surface)}, surface2: ${argb(c.surface2)}, border: ${argb(c.border)}, borderStrong: ${argb(c.borderStrong)}, text: ${argb(c.text)}, muted: ${argb(c.muted)}, primary: ${argb(c.primary)}, primary2: ${argb(c.primary2)}, sidebar: ${argb(c.sidebar)}, sidebar2: ${argb(c.sidebar2)}, flat: true, inspired: ${q(t.inspired)}${side}, group: ${q(t.group)},`);
    lines.push(`      duo: Duo(ok: ${argb(v['--ok'])}, warn: ${argb(v['--warn'])}, danger: ${argb(v['--danger'])}, info: ${argb(v['--info'])}, violet: ${argb(v['--violet'])}, pill: ${argb(v['--pill'])}, pillOn: ${argb(v['--pill-on'])}, logo2: ${argb(v['--logo-2'])}, rowTint: ${c.rowTint}, headTint: ${c.headTint}, hues: [${Array.from({ length: 8 }, (_, i) => argb(v[`--hue-${i}`])).join(', ')}])${glossy(t, v)}),`);
  }
  return { groups: `const paletteGroups = [${THEME_GROUPS.map(q).join(', ')}];`, list: `const palettes = [\n${lines.join('\n')}\n];` };
}

/** themes.dart with its palette list and groups replaced */
export function withPalettes(src) {
  const { groups, list } = dartPalettes();
  return src.replace(/const paletteGroups = \[[^\]]*\];/, groups).replace(/const palettes = \[\n[\s\S]*?\n\];/, list);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const now = fs.readFileSync(DART, 'utf8'), want = withPalettes(now);
  if (process.argv.includes('--check')) {
    if (now !== want) { console.error('rxpos_flutter themes.dart differs from src/themes.js: run node tools/flutter-palettes.mjs'); process.exit(1); }
    console.log('Flutter palettes match src/themes.js');
  } else { fs.writeFileSync(DART, want); console.log(`Wrote ${THEMES.length} palettes to ${DART}`); }
}
