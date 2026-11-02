// Fictional supplier invoices with known contents, to measure how well invoice scanning reads them. No real
// supplier, pharmacy or price. Each invoice is rendered in several styles: clean typed, typed with handwritten
// quantities / batches / corrections, fully handwritten, and a skewed, blurry, low-contrast "phone photo".
export const INVOICES = [
  {
    id: 'inv-a', supplier: 'Lakeview Medical Supplies Ltd', invoiceNo: 'LV-20419', date: '2026-10-28',
    items: [
      { name: 'Amoxicillin 500mg Capsules 10x10', batch: 'AMX2405', expiry: '2028-06-30', qty: 10, unitCost: 18500 },
      { name: 'Paracetamol 500mg Tablets 100s', batch: 'PCT8812', expiry: '2027-11-30', qty: 24, unitCost: 3200 },
      { name: 'Metronidazole 200mg Tablets 100s', batch: 'MTZ0931', expiry: '2028-02-29', qty: 12, unitCost: 4800 },
      { name: 'ORS Sachets 20.5g', batch: 'ORS5520', expiry: '2027-08-31', qty: 50, unitCost: 450 },
      { name: 'Ciprofloxacin 500mg Tablets 10x10', batch: 'CPX7714', expiry: '2028-09-30', qty: 6, unitCost: 21000 },
      { name: 'Cetirizine Syrup 60ml', batch: 'CTZ3306', expiry: '2027-05-31', qty: 20, unitCost: 2600 },
    ],
  },
  {
    id: 'inv-b', supplier: 'Greenhill Pharma Distributors', invoiceNo: '7731', date: '2026-10-30',
    items: [
      { name: 'Artemether/Lumefantrine 20/120mg 24s', batch: 'ALU0447', expiry: '2028-01-31', qty: 30, unitCost: 5500 },
      { name: 'Ibuprofen 400mg Tablets 100s', batch: 'IBU2219', expiry: '2027-12-31', qty: 10, unitCost: 6000 },
      { name: 'Omeprazole 20mg Capsules 28s', batch: 'OMP6650', expiry: '2028-04-30', qty: 15, unitCost: 3900 },
      { name: 'Ceftriaxone 1g Injection', batch: 'CFX1182', expiry: '2027-10-31', qty: 40, unitCost: 2300 },
      { name: 'Salbutamol Inhaler 100mcg', batch: 'SAL9035', expiry: '2028-03-31', qty: 8, unitCost: 9500 },
    ],
  },
];
const money = (n) => n.toLocaleString('en-UG');
const total = (inv) => inv.items.reduce((a, i) => a + i.qty * i.unitCost, 0);
const fmtExpiry = (d, style) => { const [y, m] = d.split('-'); return style === 'mon' ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}-${y.slice(2)}` : `${m}/${y}`; };
const fmtDate = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };

/** HTML for one invoice in one style: typed | mixed (handwritten qty/batch/expiry + a correction) | handwritten | photo */
export function html(inv, style) {
  const hand = style === 'handwritten';
  const handCell = style === 'mixed' || hand;
  const cell = (v, h = handCell) => `<td class="${h ? 'hw' : ''}">${v}</td>`;
  const rows = inv.items.map((it, n) => {
    // in the mixed style the second line's quantity was corrected by hand: the printed number is struck out
    const qty = style === 'mixed' && n === 1 ? `<s class="typed">${it.qty + 6}</s> <span class="hw">${it.qty}</span>` : String(it.qty);
    return `<tr>${cell(n + 1, hand)}${cell(it.name, hand)}${cell(it.batch)}${cell(fmtExpiry(it.expiry, n % 2 ? 'mon' : 'num'))}${style === 'mixed' && n === 1 ? `<td>${qty}</td>` : cell(qty)}${cell(money(it.unitCost), hand)}${cell(money(it.qty * it.unitCost), hand)}</tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Reenie+Beanie&display=block" rel="stylesheet">
<style>
 body { margin: 0; background: #fff; font: 14px Arial, sans-serif; color: #111; }
 .page { width: 820px; padding: 36px 40px; ${style === 'photo' ? 'transform: rotate(-2.4deg); filter: blur(0.7px) contrast(0.72) brightness(1.06); background: #f4f1e8;' : ''} }
 h1 { margin: 0; font-size: 22px; } .meta { display: flex; justify-content: space-between; margin: 14px 0 18px; }
 table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #555; padding: 6px 7px; text-align: left; font-size: 13px; }
 .hw { font-family: ${hand ? "'Reenie Beanie'" : "'Caveat'"}, cursive; font-size: ${hand ? 21 : 19}px; color: ${hand ? '#1b2a6b' : '#1d3a8a'}; }
 .tot { text-align: right; margin-top: 12px; font-size: 15px; } .foot { margin-top: 28px; font-size: 12px; color: #555; }
</style></head><body><div class="page">
 <h1 class="${hand ? 'hw' : ''}">${inv.supplier}</h1><div class="${hand ? 'hw' : ''}">Plot 12, Sample Road, Kampala · Tel 0700 000 000 · TIN 1000000000</div>
 <div class="meta ${hand ? 'hw' : ''}"><div><b>INVOICE</b> No: ${inv.invoiceNo}<br>Date: ${fmtDate(inv.date)}</div><div>Bill to: Sample Pharmacy<br>Kampala</div></div>
 <table><thead><tr><th>#</th><th>Description</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
 <div class="tot ${hand ? 'hw' : ''}">Sub-total: ${money(total(inv))}<br>VAT 0%: 0<br><b>TOTAL UGX ${money(total(inv))}</b></div>
 <div class="foot ${hand ? 'hw' : ''}">Goods once sold are not returnable. Received by: ____________</div>
</div></body></html>`;
}
export const STYLES = ['typed', 'mixed', 'handwritten', 'photo'];
export { total };
