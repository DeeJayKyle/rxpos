// Notes & SOP pages (2026-11-14, the owner's "add Notion UI features"): pages made of blocks (headings, text, to-dos,
// bullets, toggles, callouts, quotes, dividers), nested under each other, with an emoji icon and a cover colour.
// Synced like any other record (table `notes`); the Flutter app keeps every record type, so it gets them too.
// Pure helpers here (tests/unit-notes.mjs); the editor is src/pages/Notes.jsx.
import { uid } from './ids.js';

/** Block types, in the order the "/" menu lists them: [type, name, what it is, words that find it] */
export const BLOCKS = [
  ['text', 'Text', 'Plain writing', 'paragraph plain'],
  ['h1', 'Heading 1', 'Big section title', 'title heading h1'],
  ['h2', 'Heading 2', 'Medium section title', 'subtitle heading h2'],
  ['h3', 'Heading 3', 'Small section title', 'heading h3'],
  ['todo', 'To-do', 'A box to tick', 'checkbox task check todo'],
  ['bullet', 'Bulleted list', 'A simple list', 'list bullet ul'],
  ['number', 'Numbered list', 'Steps in order', 'list numbered ol steps'],
  ['toggle', 'Toggle', 'Hide the detail under a line', 'collapse expand toggle'],
  ['callout', 'Callout', 'Make a warning or tip stand out', 'warning note tip info callout'],
  ['quote', 'Quote', 'Quoted words', 'quote citation'],
  ['divider', 'Divider', 'A line between sections', 'line rule separator divider hr'],
];
export const BLOCK_NAME = Object.fromEntries(BLOCKS.map(([t, n]) => [t, n]));
export const COVERS = ['', 'teal', 'sky', 'violet', 'rose', 'amber', 'lime', 'slate', 'gold'];

export const block = (type = 'text', text = '', extra = {}) => ({ id: uid(), type, text, ...(type === 'todo' ? { checked: false } : {}), ...extra });

/** The "/" menu's choices for what was typed after the slash */
export function slashMatches(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return BLOCKS;
  return BLOCKS.filter(([t, n, , w]) => (t + ' ' + n + ' ' + w).toLowerCase().includes(s));
}

/** Markdown-style shortcuts typed at the start of a block ("# ", "[] ", "- ", "1. ", "> ", "---") */
export function shortcut(text) {
  const rules = [[/^# $/, 'h1'], [/^## $/, 'h2'], [/^### $/, 'h3'], [/^\[\]\s$|^\[ \]\s$/, 'todo'], [/^[-*] $/, 'bullet'], [/^1[.)] $/, 'number'], [/^> $/, 'quote'], [/^>> $/, 'toggle'], [/^! $/, 'callout'], [/^---$/, 'divider']];
  for (const [re, type] of rules) if (re.test(text)) return type;
  return null;
}

/** A new page (blank or from a template) */
export function newPage({ title = '', icon = '📄', parentId = null, blocks, user } = {}) {
  return { id: uid(), title, icon, cover: '', parentId, blocks: blocks?.length ? blocks : [block('text')], createdBy: user?.name || '', createdById: user?.id || '' };
}

/** Ready-made pages a pharmacy commonly keeps */
export const TEMPLATES = [
  { id: 'opening', title: 'Opening checklist', icon: '🌅', blocks: () => [
    block('callout', 'Do these before the first customer. Tick each one; untick them all at closing.'),
    block('todo', 'Switch on the till and check it says Synced'), block('todo', 'Read the fridge thermometer and log it (Storage)'),
    block('todo', 'Count the opening float and open the shift'), block('todo', 'Check expiring stock on the Dashboard'),
    block('todo', 'Clean the counter and dispensing area'), block('todo', 'Read the handover notes from yesterday'),
  ] },
  { id: 'cold-chain', title: 'Cold chain SOP', icon: '❄️', blocks: () => [
    block('h2', 'Purpose'), block('text', 'Keep vaccines, insulin and other fridge items between 2 °C and 8 °C from delivery to sale.'),
    block('h2', 'Steps'), block('number', 'Put fridge items away first, within 15 minutes of delivery.'),
    block('number', 'Record the fridge temperature twice a day in Storage.'), block('number', 'Keep the door shut; do not store food or drinks in it.'),
    block('callout', 'Out of range? Move the stock to the backup cooler, note the time and the reading, and call the supervisor.'),
    block('toggle', 'Who to call', { children: 'Supervisor, then the supplier\'s cold-chain line.' }),
  ] },
  { id: 'handover', title: 'Shift handover', icon: '🔁', blocks: () => [
    block('h2', 'Today'), block('bullet', 'Cash-up done and banked: '), block('bullet', 'Items out of stock: '), block('bullet', 'Customers waiting for an order: '),
    block('h2', 'For the next shift'), block('todo', ''),
  ] },
  { id: 'dispensing', title: 'Dispensing SOP', icon: '💊', blocks: () => [
    block('h2', 'Before handing over'), block('number', 'Check the prescription: patient, medicine, strength, dose, duration.'),
    block('number', 'Check allergies and other medicines on the customer\'s record.'), block('number', 'Pick from the batch that expires first.'),
    block('number', 'Label with the dose and counsel the patient.'), block('quote', 'Right patient, right medicine, right dose, right route, right time.'),
  ] },
  { id: 'meeting', title: 'Staff meeting', icon: '🗓️', blocks: () => [
    block('h2', 'Agenda'), block('bullet', ''), block('h2', 'Decisions'), block('bullet', ''), block('h2', 'Actions'), block('todo', ''),
  ] },
];

/** Pages as a tree: children of `parentId`, newest first by title order */
export function childrenOf(notes, parentId = null) {
  return notes.filter((n) => (n.parentId || null) === parentId).sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
}

/** A page and every page under it (for deleting a branch of the tree) */
export function branchIds(notes, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const n of notes) if (n.parentId === out[i] && !out.includes(n.id)) out.push(n.id);
  return out;
}

/** The path from the top to a page, for breadcrumbs */
export function pathTo(notes, id) {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const out = [];
  for (let n = byId.get(id), guard = 0; n && guard < 50; n = byId.get(n.parentId), guard++) out.unshift(n);
  return out;
}

/** Plain text of a page (search, previews) */
export const pageText = (n) => [n.title, ...(n.blocks || []).map((b) => b.text + ' ' + (b.children || ''))].join(' ');

/** To-dos done / total */
export function progress(n) {
  const todos = (n.blocks || []).filter((b) => b.type === 'todo');
  return { done: todos.filter((b) => b.checked).length, total: todos.length };
}

/** Move a block from one index to another */
export function moveBlock(blocks, from, to) {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks;
  const out = blocks.slice();
  const [b] = out.splice(from, 1);
  out.splice(to, 0, b);
  return out;
}

/** The number shown before a numbered-list block (counts up through a run of numbered blocks) */
export function numberOf(blocks, i) {
  let n = 0;
  for (let j = i; j >= 0 && blocks[j].type === 'number'; j--) n++;
  return n;
}
