// Notes & SOP pages (src/notes.js): the "/" block menu, Markdown shortcuts, the page tree, breadcrumbs, to-do
// progress, moving blocks and numbered lists. Fictional pages.
//   node unit-notes.mjs
import { slashMatches, shortcut, newPage, block, childrenOf, branchIds, pathTo, progress, moveBlock, numberOf, TEMPLATES, BLOCKS } from '../src/notes.js';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + JSON.stringify(x) : ''}`); };

check('"/" alone lists every block', slashMatches('').length === BLOCKS.length);
check('"/todo" and "/check" find the to-do', slashMatches('todo')[0][0] === 'todo' && slashMatches('check').some(([t]) => t === 'todo'));
check('"/h2" finds Heading 2 first', slashMatches('h2')[0][0] === 'h2');
check('"/warning" finds the callout', slashMatches('warning').map(([t]) => t).includes('callout'));
check('nothing matches nonsense', slashMatches('zzqx').length === 0);
check('shortcuts: "# " "## " "[] " "- " "1. " "> " "---"', [['# ', 'h1'], ['## ', 'h2'], ['[] ', 'todo'], ['- ', 'bullet'], ['1. ', 'number'], ['> ', 'quote'], ['---', 'divider']].every(([t, want]) => shortcut(t) === want));
check('ordinary text is no shortcut', shortcut('Hello') === null && shortcut('#hashtag') === null);

const user = { id: 'u1', name: 'Test Pharmacist' };
const top = newPage({ title: 'SOPs', user });
const child = newPage({ title: 'Cold chain', parentId: top.id, user });
const grand = newPage({ title: 'Fridge log', parentId: child.id, user });
const other = newPage({ title: 'Agenda', user });
const all = [grand, other, child, top];
check('a new page starts with one empty text block and its author', top.blocks.length === 1 && top.blocks[0].type === 'text' && top.createdBy === 'Test Pharmacist');
check('top-level pages, A to Z', childrenOf(all).map((n) => n.title).join() === 'Agenda,SOPs');
check('pages inside a page', childrenOf(all, top.id).map((n) => n.title).join() === 'Cold chain');
check('deleting a page takes the pages under it', branchIds(all, top.id).sort().join() === [top.id, child.id, grand.id].sort().join());
check('breadcrumbs from the top', pathTo(all, grand.id).map((n) => n.title).join(' / ') === 'SOPs / Cold chain / Fridge log');

const page = { blocks: [block('todo', 'a', { checked: true }), block('todo', 'b'), block('text', 'x')] };
check('to-do progress', JSON.stringify(progress(page)) === JSON.stringify({ done: 1, total: 2 }));
const bs = [block('text', '1'), block('text', '2'), block('text', '3')];
check('moving a block down', moveBlock(bs, 0, 2).map((b) => b.text).join('') === '231');
check('moving out of range changes nothing', moveBlock(bs, 0, 5) === bs);
const nums = [block('number', 'a'), block('number', 'b'), block('text', '-'), block('number', 'c')];
check('numbered lists count up and start again after other blocks', [0, 1, 3].map((i) => numberOf(nums, i)).join() === '1,2,1');
check('every template makes fresh blocks with their own ids', TEMPLATES.every((t) => { const a = t.blocks(), b = t.blocks(); return a.length > 2 && a[0].id !== b[0].id; }));
check('block ids are unique', new Set(TEMPLATES.flatMap((t) => t.blocks().map((b) => b.id))).size === TEMPLATES.reduce((a, t) => a + t.blocks().length, 0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
