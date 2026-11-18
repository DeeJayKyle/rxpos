// The one plain line each report opens with (UI batch 3, F9), worked out from its own figures. The Flutter app has
// the same wording in rxpos_flutter/lib/features/reports/domain/report_summary.dart.

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const change = (p, what = 'on the period before') => (p == null ? '' : p === 0 ? `level ${what}` : `${p > 0 ? 'up' : 'down'} ${Math.abs(p)}% ${what}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * tab: the report; f: { sales, prevSales, receipts, topProduct, purchases, topSupplier, expenses, topCategory,
 * profit, margin, stockValue, expiredValue, lines } (whatever the report has); fmt: money. Returns a sentence or ''.
 */
export function reportSummary(tab, f, fmt) {
  switch (tab) {
    case 'sales': {
      if (!f.receipts) return 'No sales in these dates.';
      const c = change(pct(f.sales, f.prevSales));
      return `${fmt(f.sales)} from ${f.receipts} sale${f.receipts === 1 ? '' : 's'}${c ? `, ${c}` : ''}${f.topProduct ? `; ${f.topProduct} sold most` : ''}.`;
    }
    case 'products': return f.topProduct ? `${f.topProduct} sold most${f.topProductShare ? `: ${f.topProductShare}% of the sales` : ''}.` : 'Nothing sold in these dates.';
    case 'lines': return f.lines ? `${f.lines} medicine line${f.lines === 1 ? '' : 's'} sold in these dates.` : 'Nothing sold in these dates.';
    case 'purchases': return f.purchases > 0 ? `${fmt(f.purchases)} bought${f.topSupplier ? `, most from ${f.topSupplier}` : ''}.` : 'No deliveries received in these dates.';
    case 'expenses': return f.expenses > 0 ? `${fmt(f.expenses)} spent${f.topCategory ? `; ${f.topCategory} the largest` : ''}.` : 'No expenses in these dates.';
    case 'profit': case 'income':
      return f.sales > 0 ? `${cap(f.profit >= 0 ? 'a profit of ' : 'a loss of ')}${fmt(Math.abs(f.profit))}${f.margin != null ? ` (${f.margin}% of sales)` : ''}${f.prevProfit != null ? `, ${change(pct(f.profit, f.prevProfit)) || 'the first period with figures'}` : ''}.` : 'No sales in these dates, so no profit yet.';
    case 'stock': return f.stockValue > 0 ? `${fmt(f.stockValue)} of stock at cost${f.expiredValue > 0 ? `; ${fmt(f.expiredValue)} has expired` : ''}.` : 'No stock in hand.';
    default: return '';
  }
}
