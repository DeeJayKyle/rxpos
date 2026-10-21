// Every colour theme must stay readable (WCAG AA 4.5:1): body and muted text, links, text on buttons, badges.
// The theme engine adjusts colours when a theme is applied (src/themes.js → themeVars); this checks the result.
import { THEMES, themeVars, contrast } from '../src/themes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; if (!ok) console.log(`FAIL  ${n}  ${x}`); };
for (const t of THEMES) {
  const v = themeVars(t);
  const [a, b] = v['--accent-grad'].match(/#[0-9a-f]{6}/gi);
  const pairs = [['text', v['--text'], v['--surface']], ['muted on surface', v['--muted'], v['--surface']], ['muted on page', v['--muted'], v['--bg']],
    ['muted on surface-2', v['--muted'], v['--surface-2']], ['link', v['--primary-text'], v['--surface']], ['button text (start)', v['--on-accent'], a], ['button text (end)', v['--on-accent'], b]];
  if (v['--primary-soft'].startsWith('#')) pairs.push(['badge', v['--primary-ink'], v['--primary-soft']]);
  for (const [n, x, y] of pairs) { const r = contrast(x, y); check(`${t.name}: ${n}`, r >= 4.5, r.toFixed(2)); }
}
console.log(`PASS  ${THEMES.length} themes checked`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
