// Receipts as ESC/POS bytes for thermal receipt printers (Epson TM, Xprinter, Rongta, most 58 / 80 mm printers), sent
// straight to the printer by src/printer.js: no print dialog, and the cash drawer opens through the printer's drawer port.
// Pure: no browser, no store, so the same bytes are tested in Node (tests/unit-escpos.mjs).
import { kitContents } from './kits.js';
import { isSplit } from './tenders.js';

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** Characters per line in the printer's normal font (Font A, 12×24): 58 mm paper 32, 80 mm paper 48 */
export const columnsFor = (paper) => (Number(paper) === 58 ? 32 : 48);

/** Drawer kick: ESC p m t1 t2, a 50 ms on / 500 ms off pulse on drawer pin 2 (m = 0) or pin 5 (m = 1) */
export function drawerKick(pin = 2) {
  return Uint8Array.from([ESC, 0x70, Number(pin) === 5 ? 1 : 0, 0x19, 0xfa]);
}

// Thermal printers print one 8-bit code page; most start on PC437. Anything outside plain ASCII is written in ASCII so
// a name never comes out as garbage (× → x, · → -, é → e).
const SWAP = { '×': 'x', '·': '-', '—': '-', '–': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '✓': 'v', '•': '*', '\u00a0': ' ', '\u202f': ' ' };
export function ascii(text) {
  return String(text ?? '')
    .replace(/[×·—–‘’“”…✓•\u00a0\u202f]/g, (c) => SWAP[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '?');
}

/** Words wrapped to the line width; a word longer than a line is cut */
export function wrap(text, width) {
  const out = [];
  for (const para of ascii(text).split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > width) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, width)); word = word.slice(width); }
      if (!word) continue;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/** Left text and right amount on one line; the left side wraps above when both don't fit */
export function twoCols(left, right, width) {
  const r = ascii(right);
  const room = width - r.length - 1;
  const lines = wrap(left, Math.max(1, room));
  const last = lines.pop() || '';
  return [...lines, last + ' '.repeat(Math.max(1, width - last.length - r.length)) + r];
}

/** A small builder of ESC/POS commands */
export class Esc {
  constructor() { this.parts = [ESC, 0x40]; } // ESC @ : start from the printer's defaults
  raw(bytes) { for (const b of bytes) this.parts.push(b); return this; }
  text(s) { for (const ch of ascii(s)) this.parts.push(ch.charCodeAt(0)); return this; }
  line(s = '') { return this.text(s).raw([LF]); }
  align(a) { return this.raw([ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); }
  bold(on) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  big(on) { return this.raw([GS, 0x21, on ? 0x11 : 0]); } // double width and height
  feed(n = 1) { return this.raw([ESC, 0x64, n]); }
  /** CODE128 barcode of the receipt number (code set B), the same number the screen receipt's barcode carries */
  barcode(value) {
    const v = ascii(value).slice(0, 40);
    if (!v) return this;
    const data = [0x7b, 0x42, ...[...v].map((c) => c.charCodeAt(0))]; // {B then the text
    return this.raw([GS, 0x68, 50, GS, 0x77, 2, GS, 0x48, 0, GS, 0x6b, 73, data.length, ...data, LF]);
  }
  cut() { return this.feed(3).raw([GS, 0x56, 66, 0]); } // feed to the cutter, then a partial cut
  kick(pin) { return this.raw(drawerKick(pin)); }
  bytes() { return Uint8Array.from(this.parts); }
}

const billed = (s) => (s.insurance ? Math.max(0, Number(s.insurance.share) || 0) : 0);
const unpaid = (s) => s.total - (s.paid ?? s.total) - billed(s);

/**
 * The receipt as ESC/POS bytes: the same lines as the screen receipt (src/pages/Sales.jsx Receipt).
 * opts: settings (the pharmacy's), branchName, address, fmt (money), when (the date and time, already formatted),
 * paper (58 / 80), kick (open the drawer: false, or the pin 2 / 5), cut (default true)
 */
export function receiptBytes(sale, { settings: s = {}, branchName = '', address = '', fmt = String, when = '', paper = 80, kick = false, cut = true } = {}) {
  const W = columnsFor(paper);
  const e = new Esc();
  const rule = '-'.repeat(W);
  const isProforma = sale.proforma || String(sale.number).startsWith('PF');
  // the drawer opens first: the cashier counts change while the receipt prints
  if (kick) e.kick(kick);
  e.align('center').bold(true).big(true);
  for (const l of wrap(s.name || 'Pharmacy', Math.floor(W / 2))) e.line(l);
  e.big(false).bold(false);
  if (branchName) e.line(branchName);
  for (const l of address ? wrap(address, W) : []) e.line(l);
  if (s.phone) e.line('Tel: ' + s.phone);
  if (s.tin) e.line('TIN: ' + s.tin);
  if (isProforma) e.bold(true).line('PROFORMA INVOICE').bold(false);
  if (sale.training) e.bold(true).line('TRAINING - NOT A SALE').bold(false);
  e.line(`${sale.number}${when ? ' - ' + when : ''}`);
  e.line(`${isProforma ? 'Prepared by' : 'Served by'}: ${sale.cashier || sale.createdBy || ''}`);
  if (sale.customerName && sale.customerName !== 'Walk-in Customer') e.line('Customer: ' + sale.customerName);
  e.align('left').line(rule);
  for (const i of sale.items || []) {
    for (const l of twoCols(i.name, fmt(i.qty * i.price), W)) e.line(l);
    const how = [i.pack ? `${i.pack.count} x ${i.pack.name} (${i.pack.size}) @ ${fmt(i.pack.price)}` : `${i.qty} x ${fmt(i.price)}`];
    if (i.alloc?.length === 1 && i.alloc[0].batch) how.push(`B/N ${i.alloc[0].batch}`);
    if (i.alloc?.[0]?.expiry) how.push(`Exp ${i.alloc[0].expiry}`);
    for (const l of wrap('  ' + how.join(' - '), W)) e.line(l);
    if (i.kit) for (const l of wrap('  KIT - ' + kitContents(i), W)) e.line(l);
    if (i.directions) {
      const d = i.directions;
      const t = [d.dose, d.freq, d.days && `for ${d.days} days`].filter(Boolean).join(' ') + (d.notes?.length ? ' - ' + d.notes.join(', ') : '');
      if (t.trim()) for (const l of wrap('  ' + t, W)) e.line(l);
    }
  }
  e.line(rule);
  const row = (a, b) => { for (const l of twoCols(a, b, W)) e.line(l); };
  row('Subtotal', fmt(sale.subtotal));
  if (sale.discount > 0) row('Discount', '-' + fmt(sale.discount));
  if (sale.tax > 0) row('Tax', fmt(sale.tax));
  e.bold(true); row('TOTAL', fmt(sale.total)); e.bold(false);
  if (!isProforma) {
    if (isSplit(sale)) {
      for (const p of sale.payments) row(`Paid (${p.method})`, fmt(p.amount));
      if (sale.tendered > sale.paid) row('Change', fmt(sale.tendered - sale.paid));
    } else {
      row(`Paid (${sale.payment || ''})`, fmt(sale.payment === 'Cash' ? sale.tendered : sale.paid ?? sale.total));
      if (sale.payment === 'Cash' && sale.tendered > (sale.paid ?? sale.total)) row('Change', fmt(sale.tendered - (sale.paid ?? sale.total)));
    }
    if (sale.insurance) { row(`${sale.insurance.insurer} (${sale.insurance.scheme})`, fmt(billed(sale))); e.line('Member no. ' + sale.insurance.memberNo); }
    if (unpaid(sale) > 0.005) row('Balance on credit', fmt(unpaid(sale)));
  }
  if (sale.momo?.txid) row(`${sale.momo.provider === 'airtel' ? 'Airtel' : 'MoMo'} Ref`, sale.momo.txid);
  if (sale.momo?.confirmed) for (const l of wrap('Payment confirmed by the mobile network', W)) e.line(l);
  else if (sale.momo?.manual) for (const l of wrap('Payment recorded by staff (transaction ID from the customer; not confirmed by the network)', W)) e.line(l);
  e.align('center');
  if (sale.status === 'refunded') e.bold(true).line('REFUNDED').bold(false);
  if (sale.returnOf) e.bold(true).line('CREDIT NOTE for ' + (sale.returnOfNumber || '')).bold(false);
  e.feed(1);
  if (sale.number) e.barcode(sale.number);
  const footer = isProforma ? 'Prices valid for 7 days.' : s.receiptFooter || '';
  for (const l of footer ? wrap(footer, W) : []) e.line(l);
  e.align('left');
  if (cut) e.cut(); else e.feed(4);
  return e.bytes();
}

/** A short test page: the printer's name, the paper width and a ruler, so the width setting can be checked */
export function testPageBytes({ paper = 80, title = 'RxPOS test print', detail = '', kick = false } = {}) {
  const W = columnsFor(paper);
  const e = new Esc();
  if (kick) e.kick(kick);
  e.align('center').bold(true).line(title).bold(false);
  if (detail) for (const l of wrap(detail, W)) e.line(l);
  e.line(`${paper} mm paper - ${W} characters a line`);
  e.align('left').line('1234567890'.repeat(Math.ceil(W / 10)).slice(0, W));
  e.line('-'.repeat(W));
  for (const l of twoCols('Paracetamol 500mg', '1,000', W)) e.line(l);
  e.bold(true); for (const l of twoCols('TOTAL', '1,000', W)) e.line(l); e.bold(false);
  e.align('center').line('If this page reads well, receipts will too.').align('left');
  e.cut();
  return e.bytes();
}

/** Bytes to base64, for the Windows and Android bridges */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
