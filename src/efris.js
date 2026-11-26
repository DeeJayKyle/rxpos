// URA EFRIS (Electronic Fiscal Receipting and Invoicing System): what a sale or a refund is in EFRIS's own words.
//
// Pure functions shared by the app (the receipt, the queue that fiscalises sales) and the cloud (worker/efris.js,
// which signs, encrypts and sends them to URA). Nothing here talks to the network.
//
//   invoiceFromSale(sale, ctx)      → the T109 "billing upload" content for one sale
//   creditNoteFromInvoice(fiscal, …) → the T110 credit note application for a refunded sale
//   fiscalFromT109(resp)            → what is printed on the receipt: FDN, verification code, QR, device number
//
// Field names and codes follow URA's "Interface Design for System-to-System" (T109, T110, T111) as published by URA
// and used by the open SDKs; the sandbox (efristest.ura.go.ug) is the place to confirm them before going live.
//
// Tax: since the VAT-per-item change (src/tax.js) each sale line carries taxCategory ('standard' | 'zero' | 'exempt')
// and tax (that line's VAT, after its share of the discount); prices are VAT-exclusive, so a line's gross is its net
// plus its VAT. A sale from before has neither: its VAT (sale.tax) is shared over the lines as standard-rated, or the
// lines are exempt when it had none.

export const EFRIS_TAX = {
  standard: { code: '01', name: 'Standard' },
  zero: { code: '02', name: 'Zero rated' },
  exempt: { code: '03', name: 'Exempt' },
};

/** How each payment method is reported (EFRIS payment modes) */
export function paymentMode(name = '') {
  const p = String(name).toLowerCase();
  if (/mobile|momo|mtn|airtel/.test(p)) return '105';
  if (/card|visa|master/.test(p)) return '106';
  if (/bank|transfer|eft/.test(p)) return '107';
  if (/cheque|check/.test(p)) return '103';
  if (/credit|account|insur/.test(p)) return '101';
  return '102'; // cash
}

/** Credit note reason codes: 101 expiry or damage, 102 purchase cancelled, 103 amount wrongly stated, 104 waiver, 105 other */
export function creditReason(text = '') {
  const t = String(text).toLowerCase();
  if (/expir|damage|broken|spoil/.test(t)) return '101';
  if (/wrong|mistake|error|price/.test(t)) return '103';
  return '102';
}

const two = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const num = (n) => Number(n) || 0;

/** Date and time in Uganda (EAT, UTC+3) as EFRIS wants it: yyyy-MM-dd HH:mm:ss */
export function eatTime(when = new Date()) {
  const d = new Date(new Date(when).getTime() + 3 * 3600e3);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Each line's net (after its share of the receipt discount), VAT, gross and category, adding up to the sale's total.
 * Exported for the tests and the receipt.
 */
export function saleLines(sale, { standardRate } = {}) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (!items.length) throw new Error('The sale has no lines');
  const gross0 = items.map((i) => Math.max(0, num(i.qty) * num(i.price) - num(i.discount))); // a line's own discount, as src/money.js lineTotal
  const subtotal = gross0.reduce((a, b) => a + b, 0);
  const disc = Math.min(num(sale.discount), subtotal);
  const perLine = items.every((i) => i.taxCategory && Number.isFinite(Number(i.tax)));
  const rate = num(standardRate ?? sale.taxRate);
  let left = disc;
  const lines = items.map((i, n) => {
    const share = n === items.length - 1 ? left : subtotal ? Math.round((disc * gross0[n]) / subtotal * 100) / 100 : 0;
    left -= share;
    const net = gross0[n] - share;
    let category, tax;
    if (perLine) { category = i.taxCategory; tax = num(i.tax); }
    else if (num(sale.tax) > 0) { category = 'standard'; tax = subtotal - disc ? (num(sale.tax) * net) / (subtotal - disc) : 0; }
    else { category = 'exempt'; tax = 0; }
    if (!EFRIS_TAX[category]) category = 'standard';
    return { item: i, order: n, net, tax: Math.round(tax * 100) / 100, category };
  });
  // round each line, then put the sale's own rounding (UGX has no cents) on the largest line so the lines add up
  // to exactly what the customer was charged
  for (const l of lines) l.gross = Math.round((l.net + l.tax) * 100) / 100;
  const total = num(sale.total);
  const diff = Math.round((total - lines.reduce((a, l) => a + l.gross, 0)) * 100) / 100;
  if (Math.abs(diff) > Math.max(1, lines.length)) throw new Error(`The lines do not add up to the sale's total (${diff} apart)`);
  if (diff) { const big = lines.reduce((a, l) => (l.gross > a.gross ? l : a)); big.gross += diff; big.net += diff; }
  for (const l of lines) {
    l.rate = l.category === 'standard' ? (rate || 18) / 100 : 0;
    l.net = Math.round((l.gross - l.tax) * 100) / 100;
  }
  return lines;
}

const rateText = (l) => (l.category === 'exempt' ? '-' : l.category === 'zero' ? '0' : String(l.rate));

/**
 * The T109 content for a sale. ctx: { tin, deviceNo, legalName, settings, products: Map(id → product), customer,
 * unit, category } — unit and category are the pharmacy's defaults for medicines with no EFRIS unit or commodity code.
 */
export function invoiceFromSale(sale, ctx) {
  const s = ctx.settings || {};
  const lines = saleLines(sale, { standardRate: s.taxRate });
  const prod = (id) => ctx.products?.get?.(id) || {};
  const goodsDetails = lines.map((l) => {
    const p = prod(l.item.id);
    const qty = num(l.item.qty);
    return {
      item: String(l.item.name || p.name || 'Item').slice(0, 200),
      itemCode: String(p.efrisCode || l.item.id).slice(0, 50),
      qty: String(qty),
      unitOfMeasure: String(p.efrisUnit || ctx.unit || '101'),
      unitPrice: (l.gross / (qty || 1)).toFixed(8).replace(/0+$/, '').replace(/\.$/, ''),
      total: two(l.gross),
      taxRate: rateText(l),
      tax: two(l.tax),
      orderNumber: String(l.order),
      discountFlag: '2', // the receipt discount is already in each line's price
      deemedFlag: '2',
      exciseFlag: '2',
      goodsCategoryId: String(p.efrisCategory || ctx.category || ''),
      goodsCategoryName: '',
      vatApplicableFlag: '1',
    };
  });
  const byCat = new Map();
  for (const l of lines) {
    const k = l.category;
    const g = byCat.get(k) || { taxCategoryCode: EFRIS_TAX[k].code, net: 0, tax: 0, gross: 0, taxRate: rateText(l), taxRateName: EFRIS_TAX[k].name };
    g.net += l.net; g.tax += l.tax; g.gross += l.gross;
    byCat.set(k, g);
  }
  const taxDetails = [...byCat.values()].map((g) => ({ taxCategoryCode: g.taxCategoryCode, netAmount: two(g.net), taxRate: g.taxRate, taxAmount: two(g.tax), grossAmount: two(g.gross), taxRateName: g.taxRateName }));
  const gross = lines.reduce((a, l) => a + l.gross, 0), tax = lines.reduce((a, l) => a + l.tax, 0);
  // what was paid at the till, what an insurer owes and what is left on credit
  const insurer = num(sale.insurance?.share);
  const paid = Math.min(num(sale.paid ?? sale.total), gross - insurer);
  const onCredit = Math.max(0, Math.round((gross - insurer - paid) * 100) / 100);
  const payWay = [
    ...(paid > 0 ? [{ paymentMode: paymentMode(sale.payment), paymentAmount: two(paid) }] : []),
    ...(insurer + onCredit > 0 ? [{ paymentMode: '101', paymentAmount: two(insurer + onCredit) }] : []),
  ].map((p, i) => ({ ...p, orderNumber: String.fromCharCode(97 + i) }));
  const c = ctx.customer || {};
  const b2b = !!String(c.tin || '').trim();
  return {
    sellerDetails: {
      tin: ctx.tin, ninBrn: ctx.brn || '', legalName: ctx.legalName || s.name || '', businessName: s.name || '',
      address: s.address || '', mobilePhone: s.phone || '', linePhone: '', emailAddress: s.email || '', placeOfBusiness: s.address || '',
      referenceNo: String(sale.number), branchId: '', isCheckReferenceNo: '1', // URA refuses the same receipt number twice
    },
    basicInformation: {
      invoiceNo: '', antifakeCode: '', deviceNo: ctx.deviceNo, issuedDate: eatTime(sale.date), operator: String(sale.cashier || sale.createdBy || 'RxPOS').slice(0, 100),
      currency: String(s.currency || 'UGX').toUpperCase() === 'UGX' ? 'UGX' : String(s.currency).toUpperCase().slice(0, 3),
      oriInvoiceId: '', invoiceType: '1', invoiceKind: b2b ? '1' : '2', dataSource: '103', invoiceIndustryCode: '101', isBatch: '0',
    },
    buyerDetails: {
      buyerTin: b2b ? String(c.tin).trim() : '', buyerNinBrn: '', buyerPassportNum: '',
      buyerLegalName: sale.customerName && sale.customerName !== 'Walk-in Customer' ? String(sale.customerName).slice(0, 256) : '',
      buyerBusinessName: '', buyerAddress: c.address || '', buyerEmail: c.email || '', buyerMobilePhone: c.phone || '', buyerLinePhone: '',
      buyerPlaceOfBusi: '', buyerType: b2b ? '0' : '1', buyerCitizenship: '', buyerSector: '', buyerReferenceNo: '',
    },
    goodsDetails,
    taxDetails,
    summary: { netAmount: two(gross - tax), taxAmount: two(tax), grossAmount: two(gross), itemCount: String(goodsDetails.length), modeCode: '1', remarks: '', qrCode: '' },
    payWay,
    extend: { reason: '', reasonCode: '' },
  };
}

/** What URA's answer to T109 (or T108) means for the receipt */
export function fiscalFromT109(content) {
  const b = content?.basicInformation || {};
  const fdn = String(b.invoiceNo || '').trim();
  if (!fdn) throw new Error('EFRIS answered without a fiscal document number');
  return {
    fdn,
    invoiceId: String(b.invoiceId || ''),
    code: String(b.antifakeCode || b.antiFakeCode || ''),
    qr: String(content?.summary?.qrCode || ''),
    deviceNo: String(b.deviceNo || ''),
    issuedAt: String(b.issuedDate || ''),
  };
}

/** What is kept of the invoice sent, for the credit note when the sale is refunded */
export const keptOfInvoice = (inv) => ({ buyerDetails: inv.buyerDetails, goodsDetails: inv.goodsDetails, taxDetails: inv.taxDetails, summary: inv.summary, currency: inv.basicInformation.currency });

const neg = (v) => { const n = -Math.abs(Number(v) || 0); return n.toFixed(String(v).includes('.') ? Math.min(8, String(v).split('.')[1].length) : 0); };

/**
 * T110: a credit note application for the whole of a fiscalised sale (RxPOS refunds whole sales). `fiscal` is the
 * sale's fiscal record (FDN, invoiceId and the invoice kept when it was issued).
 */
export function creditNoteFromInvoice(fiscal, { reason, by, at, number }) {
  const kept = fiscal?.sent;
  if (!fiscal?.fdn || !kept?.goodsDetails?.length) throw new Error('This sale has no fiscal receipt to credit');
  const why = String(reason || '').trim();
  const code = creditReason(why);
  return {
    oriInvoiceId: fiscal.invoiceId, oriInvoiceNo: fiscal.fdn, reasonCode: code,
    reason: (why || (code === '102' ? 'Purchase cancelled: goods returned' : 'Refund')).slice(0, 1024),
    applicationTime: eatTime(at || new Date()), invoiceApplyCategoryCode: '101', currency: kept.currency || 'UGX',
    contactName: String(by || '').slice(0, 200), contactMobileNum: '', contactEmail: '', source: '103', remarks: '',
    sellersReferenceNo: ('CN-' + (number || fiscal.saleNumber || '')).slice(0, 50),
    goodsDetails: kept.goodsDetails.map((g) => ({ ...g, qty: neg(g.qty), total: neg(g.total), tax: neg(g.tax) })),
    taxDetails: kept.taxDetails.map((t) => ({ ...t, netAmount: neg(t.netAmount), taxAmount: neg(t.taxAmount), grossAmount: neg(t.grossAmount) })),
    summary: { ...kept.summary, netAmount: neg(kept.summary.netAmount), taxAmount: neg(kept.summary.taxAmount), grossAmount: neg(kept.summary.grossAmount) },
    buyerDetails: kept.buyerDetails,
  };
}

/** T111 approval status: 101 approved, 102 submitted (waiting), 103 rejected, 104 voided */
export function creditStatus(content, referenceNo) {
  const rows = content?.records || content?.page?.records || [];
  const r = rows.find((x) => String(x.referenceNo) === String(referenceNo)) || rows[0];
  if (!r) return { status: 'pending' };
  const st = String(r.approveStatus || r.approveStatusCode || '');
  if (st === '101') return { status: 'approved', fdn: String(r.invoiceNo || ''), id: String(r.id || '') };
  if (st === '103') return { status: 'rejected', note: String(r.remarks || r.approveRemark || '') };
  if (st === '104') return { status: 'voided' };
  return { status: 'pending' };
}

// ---------------------------------------------------------------------------------------------------------------------
// The app's side

/** EFRIS is switched on for this pharmacy (Settings → URA EFRIS); the keys themselves live in the cloud only */
export const efrisOn = (settings) => !!settings?.efrisOn;

/** The sales that still need a fiscal receipt: completed (or since refunded) real sales from when EFRIS was switched on */
export function unfiscalised(db, { now = Date.now(), days = 30 } = {}) {
  const s = db?.settings || {};
  if (!efrisOn(s)) return [];
  const from = Math.max(Date.parse(s.efrisFrom || 0) || 0, now - days * 864e5);
  const have = new Map((db.fiscal || []).map((f) => [f.id, f]));
  return (db.sales || []).filter((x) => {
    if (!x || x.training || x.proforma || !x.number || Date.parse(x.date) < from) return false;
    const f = have.get(x.id);
    return !f || (f.status === 'failed' && now - (Date.parse(f.lastTry) || 0) > 6 * 3600e3); // a refusal is tried again after 6 hours
  });
}

/** Refunded sales whose fiscal receipt still needs a credit note, and credit notes waiting for URA's approval */
export function creditsToDo(db, { now = Date.now() } = {}) {
  if (!efrisOn(db?.settings)) return { apply: [], check: [] };
  const sales = new Map((db.sales || []).map((x) => [x.id, x]));
  const apply = [], check = [];
  for (const f of db.fiscal || []) {
    const sale = sales.get(f.id);
    if (f.status !== 'issued' || !sale || sale.status !== 'refunded') continue;
    const cn = f.creditNote;
    if (!cn || (cn.status === 'failed' && now - (Date.parse(cn.lastTry) || 0) > 6 * 3600e3)) apply.push(sale);
    else if (cn.status === 'pending' && now - (Date.parse(cn.checked || cn.at) || 0) > 15 * 60e3) check.push(sale);
  }
  return { apply, check };
}

/**
 * One pass of the queue (src/efrisqueue.jsx): up to 10 sales, then credit notes. api: { efrisSale, efrisRefund,
 * efrisCredit } (src/cloud.js). Stops at the first sign that the cloud or URA cannot be reached; the next pass tries
 * again. Returns how many fiscal records changed.
 */
export async function runEfrisQueue({ db, syncCfg, can, api }) {
  if (!efrisOn(db.settings) || !syncCfg?.url) return 0;
  let changed = 0;
  const tryEach = async (list, fn) => {
    for (const x of list.slice(0, 10)) {
      try { if ((await fn(syncCfg, x.id))?.fiscal) changed++; }
      catch (e) {
        if (/not reached the cloud yet/i.test(e.message)) continue; // that sale syncs first
        return false; // offline, or the cloud or URA is down: later
      }
    }
    return true;
  };
  if (can('pos.sell') || can('pos.wholesale')) { if (!(await tryEach(unfiscalised(db), api.efrisSale))) return changed; }
  if (can('sales.refund')) {
    const { apply, check } = creditsToDo(db);
    if (await tryEach(apply, api.efrisRefund)) await tryEach(check, api.efrisCredit);
  }
  return changed;
}

/** The lines EFRIS adds to a printed or sent receipt */
export function fiscalText(f) {
  if (!f) return [];
  if (f.status !== 'issued') return ['Fiscal receipt pending (URA EFRIS)'];
  const out = [`FDN: ${f.fdn}`, `Verification code: ${f.code}`];
  if (f.deviceNo) out.push(`Device no: ${f.deviceNo}`);
  if (f.creditNote?.fdn) out.push(`Credit note FDN: ${f.creditNote.fdn}`);
  return out;
}
