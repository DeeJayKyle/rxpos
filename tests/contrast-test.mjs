// Every colour theme must stay readable (WCAG AA 4.5:1): body and muted text, links, text on buttons, badges.
// The theme engine adjusts colours when a theme is applied (src/themes.js → themeVars); this checks the result.
import { THEMES, themeVars, contrast } from '../src/themes.js';
import { VIVID, VIVID_TEXT } from '../src/vivid.js';
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

// Status colours (1.10): the fixed light-theme status inks must read on white and on their soft background.
// (Values mirror src/styles.css :root — keep them in step.)
const WHITE = '#ffffff';
const STATUS = [
  ['ok on white', '#047857', WHITE], ['ok on ok-soft', '#047857', '#d1fae5'],
  ['danger on white', '#be123c', WHITE], ['danger on danger-soft', '#be123c', '#ffe4e6'],
  ['warn on white', '#c2410c', WHITE], ['warn on warn-soft', '#c2410c', '#ffedd5'],
];
for (const [n, x, y] of STATUS) { const r = contrast(x, y); check(`status: ${n}`, r >= 4.5, r.toFixed(2)); }

// Vivid colour level (1.7, src/vivid.js): white text on both ends of every tile gradient and on the solid row buttons;
// payment chips (values mirror src/styles.css .pay-chip, light theme)
for (const [k, ends] of Object.entries(VIVID)) for (const [i, c] of ends.entries()) { const r = contrast(VIVID_TEXT, c); check(`vivid ${k} tile (${i ? 'end' : 'start'})`, r >= 4.5, r.toFixed(2)); }
for (const [n, x, y] of [['cash', '#065f46', '#d1fae5'], ['momo', '#92400e', '#fef3c7'], ['card', '#1e40af', '#dbeafe'], ['credit', '#5b21b6', '#ede9fe']]) { const r = contrast(x, y); check(`payment chip ${n}`, r >= 4.5, r.toFixed(2)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
