// PDF downloads: receipts and reports. jsPDF + jspdf-autotable (MIT), loaded only when someone asks for a PDF.
// Web / Windows: the file downloads. Android: it is saved and the share sheet opens (WhatsApp, Drive, Files…).
import { isAndroid } from './platform.js';
import { downloadFile, localDate } from './store.jsx';

const load = async () => {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
};
const safeName = (s) => String(s || 'rxpos').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** Hand a finished PDF to the person: download it, or on Android save it and open the share sheet */
export async function savePdf(name, doc) {
  const file = safeName(name).replace(/(\.pdf)?$/i, '.pdf');
  if (isAndroid) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const data = doc.output('datauristring').split(',')[1];
    const { uri } = await Filesystem.writeFile({ path: file, data, directory: Directory.Cache });
    await Share.share({ title: file, url: uri, dialogTitle: 'Save or send the PDF' });
    return file;
  }
  downloadFile(file, doc.output('blob'), 'application/pdf');
  return file;
}

const money = (fmt, n) => fmt(n).replace(/ /g, ' ');

/** A receipt (or proforma) as a PDF the width of the receipt paper (58 / 80 mm), or A4 */
export async function receiptPdf(sale, { db, fmt }) {
  const { jsPDF } = await load();
  const s = db.settings || {};
  const isProforma = sale.proforma || String(sale.number).startsWith('PF');
  const paper = Number(s.paperWidth) || 80;
  const W = paper <= 80 ? paper : 148; // A4-ish setting: use a tidy A5-width slip
  const M = paper <= 58 ? 3 : 4, inner = W - 2 * M;
  const branch = db.branches.find((b) => b.id === (sale.branchId || 'main'));
  const logo = db.license?.[0]?.branding?.logo;
  const head = [
    ...(db.branches.length > 1 && branch ? [branch.name] : []),
    ...(branch?.address || s.address ? [branch?.address || s.address] : []),
    ...(s.phone ? ['Tel: ' + s.phone] : []), ...(s.tin ? ['TIN: ' + s.tin] : []),
    ...(isProforma ? ['PROFORMA INVOICE'] : []),
    `${sale.number} · ${new Date(sale.date).toLocaleString()}`,
    `${isProforma ? 'Prepared by' : 'Served by'}: ${sale.cashier || sale.createdBy || ''}`,
    ...(sale.customerName && sale.customerName !== 'Walk-in Customer' ? ['Customer: ' + sale.customerName] : []),
  ];
  const totals = [
    ['Subtotal', money(fmt, sale.subtotal ?? sale.total)],
    ...(sale.discount > 0 ? [['Discount', '-' + money(fmt, sale.discount)]] : []),
    ...(sale.tax > 0 ? [['Tax', money(fmt, sale.tax)]] : []),
    ['TOTAL', money(fmt, sale.total), true],
    ...(!isProforma ? [[`Paid (${sale.payment || 'Cash'})`, money(fmt, sale.payment === 'Cash' ? sale.tendered ?? sale.total : sale.paid ?? sale.total)]] : []),
    ...(!isProforma && sale.payment === 'Cash' && sale.tendered > sale.total ? [['Change', money(fmt, sale.tendered - sale.total)]] : []),
    ...(!isProforma && (sale.paid ?? sale.total) < sale.total ? [['Balance on credit', money(fmt, sale.total - sale.paid)]] : []),
    ...(sale.momo?.txid ? [[sale.momo.provider === 'airtel' ? 'Airtel Ref' : 'MoMo Ref', sale.momo.txid]] : []),
  ];
  const footer = isProforma ? 'Prices valid for 7 days.' : s.receiptFooter || '';
  const fs = paper <= 58 ? 7 : 8, lh = fs * 0.42;

  // lay out once to measure the height, then draw for real on a page exactly that long
  const draw = (doc) => {
    let y = M;
    if (logo) { try { const p = doc.getImageProperties(logo); const w = Math.min(inner * 0.5, 30), h = (w * p.height) / p.width; doc.addImage(logo, W / 2 - w / 2, y, w, h); y += h + 2; } catch { /* unreadable logo: skip */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs + 3);
    for (const t of doc.splitTextToSize(s.name || 'Pharmacy', inner)) { doc.text(t, W / 2, y + 3, { align: 'center' }); y += (fs + 3) * 0.42; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
    y += 1;
    for (const line of head) for (const t of doc.splitTextToSize(line, inner)) { doc.text(t, W / 2, y + 2.5, { align: 'center' }); y += lh; }
    const rule = () => { y += 1.5; doc.setLineDashPattern([0.6, 0.6], 0); doc.line(M, y, W - M, y); doc.setLineDashPattern([], 0); y += 2.5; };
    rule();
    for (const i of sale.items || []) {
      const amt = money(fmt, i.qty * i.price);
      const nameLines = doc.splitTextToSize(i.name || '', inner - doc.getTextWidth(amt) - 2);
      nameLines.forEach((t, n) => { doc.text(t, M, y + 2.5); if (!n) doc.text(amt, W - M, y + 2.5, { align: 'right' }); y += lh; });
      const meta = [i.pack ? `${i.pack.count} × ${i.pack.name} (${i.pack.size}) @ ${money(fmt, i.pack.price)}` : `${i.qty} × ${money(fmt, i.price)}`, i.alloc?.length === 1 && i.alloc[0].batch ? 'B/N ' + i.alloc[0].batch : '', i.alloc?.[0]?.expiry ? 'Exp ' + i.alloc[0].expiry : ''].filter(Boolean).join(' · ');
      doc.setFontSize(fs - 1); doc.setTextColor(90);
      for (const t of doc.splitTextToSize(meta, inner)) { doc.text(t, M, y + 2.3); y += (fs - 1) * 0.42; }
      if (i.directions) {
        const d = [i.directions.dose, i.directions.freq, i.directions.days && `for ${i.directions.days} days`].filter(Boolean).join(' ') + (i.directions.notes?.length ? ' · ' + i.directions.notes.join(', ') : '');
        for (const t of doc.splitTextToSize(d, inner)) { doc.text(t, M, y + 2.3); y += (fs - 1) * 0.42; }
      }
      doc.setFontSize(fs); doc.setTextColor(0);
      y += 0.8;
    }
    rule();
    for (const [k, v, big] of totals) {
      if (big) { doc.setFont('helvetica', 'bold'); doc.setFontSize(fs + 2); }
      doc.text(k, M, y + 2.5); doc.text(String(v), W - M, y + 2.5, { align: 'right' });
      y += big ? (fs + 2) * 0.45 : lh;
      if (big) { doc.setFont('helvetica', 'normal'); doc.setFontSize(fs); }
    }
    if (sale.status === 'refunded') { y += 1; doc.setFont('helvetica', 'bold'); doc.text('REFUNDED', W / 2, y + 2.5, { align: 'center' }); doc.setFont('helvetica', 'normal'); y += lh; }
    if (footer) { y += 2; for (const t of doc.splitTextToSize(footer, inner)) { doc.text(t, W / 2, y + 2.5, { align: 'center' }); y += lh; } }
    return y + M;
  };
  const height = draw(new jsPDF({ unit: 'mm', format: [W, 1000] }));
  // a short receipt is wider than it is long: say so, or jsPDF turns the page sideways
  const H = Math.max(height, 40);
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: H >= W ? 'portrait' : 'landscape' });
  draw(doc);
  doc.setProperties({ title: `Receipt ${sale.number}`, creator: 'RxPOS' });
  return savePdf(`${isProforma ? 'proforma' : 'receipt'}-${sale.number}`, doc);
}

const cellText = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

/**
 * Turn what is on screen into a report PDF: the summary tiles, then every table with its heading.
 * Action columns (buttons only) and empty-state rows are left out.
 */
export async function pagePdf(root, { title, subtitle = '', db, file, landscape, data } = {}) {
  // data: [{ heading, head: [...], body: [[...]], numeric: [colIndex] }] instead of reading tables from the screen
  if (!root && !data) throw new Error('Nothing to export yet');
  const { jsPDF, autoTable } = await load();
  const tables = data || !root ? [] : [...root.querySelectorAll('table')].filter((t) => !t.closest('.no-pdf') && t.offsetParent !== null);
  const wide = landscape ?? (data ? data.some((d) => d.head.length > 7) : tables.some((t) => (t.rows[0]?.cells.length || 0) > 7));
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: wide ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth(), M = 12;
  const s = db?.settings || {};
  let y = M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(s.name || 'RxPOS', M, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  doc.text([s.address, s.phone && 'Tel: ' + s.phone].filter(Boolean).join(' · '), M, y + 9);
  doc.text(`Printed ${new Date().toLocaleString()}`, W - M, y + 4, { align: 'right' });
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  y += 17; doc.text(title || 'Report', M, y);
  if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); y += 5; doc.text(subtitle, M, y); doc.setTextColor(0); }
  y += 4;
  const theme = { fontSize: 8, cellPadding: 1.6, lineColor: [220, 224, 230], lineWidth: 0.1 };
  const headStyle = { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold' };

  // summary tiles (label · value · note)
  const stats = [...(root?.querySelectorAll('.stat') || [])].filter((x) => x.offsetParent !== null && !x.closest('.no-pdf'));
  if (stats.length) {
    const body = stats.map((st) => {
      const label = cellText(st.querySelector(':scope > small') || { innerText: '' }).slice(0, 60);
      const value = cellText(st.querySelector(':scope > strong') || { innerText: '' }).slice(0, 40);
      const note = cellText(st.querySelector(':scope > span.muted') || { innerText: '' }).slice(0, 80);
      return [label, value, note];
    }).filter((r) => r[0] || r[1]);
    autoTable(doc, { startY: y + 2, head: [['Summary', '', '']], body, styles: theme, headStyles: headStyle, columnStyles: { 1: { fontStyle: 'bold', halign: 'right' } }, margin: { left: M, right: M } });
    y = doc.lastAutoTable.finalY + 4;
  }

  for (const t of tables) {
    const card = t.closest('.card');
    let heading = '';
    for (let el = t.previousElementSibling; el; el = el.previousElementSibling) if (/^H[2-4]$/.test(el.tagName)) { heading = cellText(el); break; }
    if (!heading && card) heading = cellText(card.querySelector('h2, h3, h4') || { innerText: '' });
    const headRow = t.tHead?.rows[0];
    const headCells = headRow ? [...headRow.cells] : [];
    const bodyRows = [...(t.tBodies[0]?.rows || [])].filter((r) => !(r.cells.length === 1 && r.cells[0].colSpan > 1));
    const footRows = [...(t.tFoot?.rows || [])];
    const width = Math.max(headCells.length, ...bodyRows.map((r) => r.cells.length), 0);
    // drop columns that only hold buttons (View / Edit…)
    const keep = [];
    for (let c = 0; c < width; c++) {
      const hText = headCells[c] ? cellText(headCells[c]) : '';
      const onlyButtons = bodyRows.every((r) => { const td = r.cells[c]; return !td || td.classList.contains('actions') || (td.querySelector('button, a') && !cellText(td).replace(/View|Edit|Delete|Print|Refund|Sell|Receive|Count|Write off|Pay/gi, '').trim()); });
      if (hText || !onlyButtons) keep.push(c);
    }
    const pick = (cells) => keep.map((c) => (cells[c] ? cellText(cells[c]) : ''));
    const body = bodyRows.map((r) => pick([...r.cells]));
    if (!body.length) continue;
    const numeric = new Set(keep.map((c, k) => (headCells[c]?.classList.contains('num') || bodyRows[0]?.cells[c]?.classList.contains('num') ? k : -1)).filter((k) => k >= 0));
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = M; }
    if (heading) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(heading, M, y + 4); y += 6; }
    autoTable(doc, {
      startY: y, head: headCells.length ? [pick(headCells)] : undefined, body, foot: footRows.length ? footRows.map((r) => pick([...r.cells])) : undefined,
      styles: theme, headStyles: headStyle, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
      columnStyles: Object.fromEntries([...numeric].map((k) => [k, { halign: 'right' }])), margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  for (const d of data || []) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = M; }
    if (d.heading) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(d.heading, M, y + 4); y += 6; }
    autoTable(doc, { startY: y, head: [d.head], body: d.body.map((r) => r.map((v) => (v == null ? '' : String(v)))), foot: d.foot ? [d.foot] : undefined, styles: theme, headStyles: headStyle, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
      columnStyles: Object.fromEntries((d.numeric || []).map((k) => [k, { halign: 'right' }])), margin: { left: M, right: M } });
    y = doc.lastAutoTable.finalY + 6;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130); doc.text(`${s.name || 'RxPOS'} · ${title || 'Report'}`, M, doc.internal.pageSize.getHeight() - 6); doc.text(`Page ${i} of ${pages}`, W - M, doc.internal.pageSize.getHeight() - 6, { align: 'right' }); }
  doc.setTextColor(0);
  doc.setProperties({ title: title || 'Report', creator: 'RxPOS' });
  return savePdf(file || `${title || 'report'}-${localDate()}`, doc);
}
