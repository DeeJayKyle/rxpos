// toCSV (src/store.jsx): a cell that starts with = + - @, a tab or a carriage return must never open as a formula in a
// spreadsheet (CSV injection), the same rule as worker/reports.js. Numbers stay numbers.   node unit-csv.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  ' + String(x) : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// store.jsx is JSX: bundle what is needed for node
const entry = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rxpos-csv-')), 'entry.js');
fs.writeFileSync(entry, `export { toCSV } from ${JSON.stringify(path.join(root, 'src/store.jsx'))};`);
const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' }, logLevel: 'error' });
const file = entry.replace(/entry\.js$/, 'b.mjs');
fs.writeFileSync(file, out.outputFiles[0].text);
const { toCSV } = await import(pathToFileURL(file).href);

const cell = (v) => toCSV([{ a: v }]).split('\n')[1];
check('a plain value is quoted as it is', cell('Paracetamol 500mg') === '"Paracetamol 500mg"', cell('Paracetamol 500mg'));
check('= is prefixed', cell('=HYPERLINK("x")') === '"\'=HYPERLINK(""x"")"', cell('=HYPERLINK("x")'));
check('+ is prefixed', cell('+1+2') === '"\'+1+2"', cell('+1+2'));
check('- in text is prefixed', cell('-2+3') === '"\'-2+3"', cell('-2+3'));
check('@ is prefixed', cell('@SUM(A1)') === '"\'@SUM(A1)"', cell('@SUM(A1)'));
check('a leading tab is prefixed', cell('\t=1') === '"\'\t=1"', JSON.stringify(cell('\t=1')));
check('a leading carriage return is prefixed', cell('\r=1') === '"\'\r=1"', JSON.stringify(cell('\r=1')));
check('a negative number stays a number', cell(-500) === '"-500"', cell(-500));
check('a value with = inside is left alone', cell('a=b') === '"a=b"', cell('a=b'));
check('empty and missing values are empty', cell('') === '""' && cell(null) === '""' && cell(undefined) === '""');
check('the header row is the column names', toCSV([{ name: 'x', qty: 1 }]).split('\n')[0] === 'name,qty');
check('no rows is an empty file', toCSV([]) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
