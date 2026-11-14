// Notes & SOP pages (Notion-like): a page from a template, typing blocks, the "/" menu, Markdown shortcuts, ticking
// to-dos, pages inside pages with breadcrumbs, a star, and the page reaching the cloud and a second device.
// Fictional data only.   node v74-notes.mjs <base> <ownerKey>
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const [base, ownerKey] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x).slice(0, 300) : ''}`); };
const owner = (p, body) => fetch(base + '/api/owner' + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownerKey }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(250); } return false; };
const recs = async (tid, t) => ((await owner(`/tenants/${tid}/records?t=${t}`)).rows || []).map((x) => x.rec);

const T = await owner('/tenants', { name: 'Notes Pharmacy', admin: { name: 'Ari Admin', email: 'ari@notes.rx', password: 'ari-pass-1234' } });
const tid = T.tenant.id, slug = T.tenant.slug;
await owner('/tenants/' + tid, { features: { catalog: false } });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const signIn = async () => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1440, height: 900 });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/' + slug, { waitUntil: 'networkidle2' }); await wait(500);
  await p.evaluate(() => { for (const id of ['pos', 'dashboard', 'notes']) localStorage.setItem('rxpos-tip:' + id, '1'); });
  await p.type('input[autocomplete=username]', 'ari@notes.rx'); await p.type('input[type=password]', 'ari-pass-1234');
  await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /^Sign in/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('.sidebar', { timeout: 20000 });
  await until(p, () => /Synced/.test(document.querySelector('.pill.clock .clock-state')?.innerText || ''), 30000);
  return p;
};
const p = await signIn();
const click = (re, sel = 'button') => p.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find((x) => new RegExp(src).test(x.textContent.trim())); el?.click(); return !!el; }, sel, re.source);
const blocks = () => p.evaluate(() => [...document.querySelectorAll('.note-block')].map((x) => [x.className.match(/nb-(\w+)/)[1], x.querySelector('textarea')?.value ?? '']));

await p.evaluate(() => { location.hash = '#/notes'; }); await wait(1200);
check('Notes & SOPs is in the menu and opens', await p.evaluate(() => !!document.querySelector('.notes-page') && [...document.querySelectorAll('.sidebar a')].some((a) => /Notes & SOPs/.test(a.textContent))));
await click(/^Templates$/); await wait(200);
check('a template makes a page', await click(/Opening checklist/, '.notes-templates button') && await until(p, () => document.querySelector('.note-title')?.value === 'Opening checklist'));
const tpl = await blocks();
check('the template has its to-dos', tpl.filter(([t]) => t === 'todo').length === 6, JSON.stringify(tpl));
await p.click('.note-block.nb-todo .nb-check'); await wait(200);
check('ticking a to-do shows progress', /1\/6 done/.test(await p.evaluate(() => document.querySelector('.note-progress')?.innerText || '')));

// a blank page: title, then blocks typed with the "/" menu and Markdown shortcuts
await click(/^New page$/); await wait(500);
await p.click('.note-title'); await p.keyboard.type('Fridge procedure'); await p.keyboard.press('Enter');
await p.keyboard.type('/head'); await wait(200);
check('typing "/" opens the block menu, filtered', await p.evaluate(() => [...document.querySelectorAll('.note-pop.slash [role=option]')].map((x) => x.textContent).join('|').includes('Heading 1')));
await p.keyboard.press('Enter'); await p.keyboard.type('Morning checks'); await p.keyboard.press('Enter');
await p.keyboard.type('[] '); await p.keyboard.type('Read the thermometer'); await p.keyboard.press('Enter');
await p.keyboard.type('Write it in Storage'); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); // Enter on an empty to-do ends the list
await p.keyboard.type('1. '); await p.keyboard.type('Close the door'); await p.keyboard.press('Enter'); await p.keyboard.type('Check the seal');
await wait(300);
const typed = await blocks();
check('blocks typed with "/" and shortcuts', JSON.stringify(typed) === JSON.stringify([['h1', 'Morning checks'], ['todo', 'Read the thermometer'], ['todo', 'Write it in Storage'], ['number', 'Close the door'], ['number', 'Check the seal']]), JSON.stringify(typed));
check('a numbered list counts 1, 2', await p.evaluate(() => [...document.querySelectorAll('.nb-num')].map((x) => x.textContent).join() === '1.,2.'));
// Backspace on an empty line removes it
await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await wait(150); // a new numbered line, emptied into text
check('Enter on an empty list line turns it into text', JSON.stringify((await blocks())[5]) === '["text",""]', JSON.stringify(await blocks()));
await p.keyboard.press('Backspace'); await wait(200);
check('Backspace on an empty block removes it', (await blocks()).length === 5);
// the ⋯ block menu: turn the heading into a callout
await p.evaluate(() => document.querySelector('.note-block .nb-tool').click()); await wait(150);
await click(/^Callout$/, '.note-turn button'); await wait(200);
check('the block menu turns a block into another type', (await blocks())[0][0] === 'callout');
// a page inside, with breadcrumbs
await p.evaluate(() => document.querySelector('[aria-label="Page actions"]').click()); await wait(100);
await click(/Add a page inside/); await wait(400);
await p.click('.note-title'); await p.keyboard.type('Backup cooler'); await wait(700);
check('breadcrumbs show the parent page', /Fridge procedure/.test(await p.evaluate(() => document.querySelector('.note-crumbs')?.innerText || '')));
await p.click('[aria-label="Star this page"]'); await wait(150);
check('a starred page is listed under Starred', /Starred[\s\S]*Backup cooler/i.test(await p.evaluate(() => document.querySelector('.notes-side').innerText)));
await p.evaluate(() => [...document.querySelectorAll('.note-crumbs button')].find((x) => /Fridge procedure/.test(x.textContent)).click()); await wait(1500);

await p.screenshot({ path: '.output/notes-page.png' }).catch(() => {});
// saved to the cloud, and on a second device
check('the pages reach the cloud', await (async () => { for (let i = 0; i < 40; i++) { const r = await recs(tid, 'notes'); if (r.some((n) => n.title === 'Fridge procedure' && n.blocks?.length === 5) && r.some((n) => n.title === 'Backup cooler')) return true; await wait(500); } return false; })());
const cloud = (await recs(tid, 'notes')).find((n) => n.title === 'Fridge procedure');
check('the cloud copy keeps the block types', cloud?.blocks.map((x) => x.type).join() === 'callout,todo,todo,number,number', cloud?.blocks.map((x) => x.type).join());
const p2 = await signIn();
await p2.evaluate(() => { location.hash = '#/notes'; }); await wait(1000);
check('a second device lists the same pages', await until(p2, () => ['Opening checklist', 'Fridge procedure'].every((t) => document.querySelector('.notes-side').innerText.includes(t)), 20000));
// search
await p2.type('.notes-search input', 'thermometer'); await wait(300);
check('search finds pages by what is written in them', await p2.evaluate(() => /Found 2[\s\S]*Fridge procedure/i.test(document.querySelector('.notes-side').innerText)));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
await owner('/tenants/' + tid + '/delete', { confirm: slug });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
