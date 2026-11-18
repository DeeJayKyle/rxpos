// The one plain line each report opens with (UI batch 3, F9): the same wording as src/reportSummary.js.

int? _pct(double cur, double prev) => prev > 0 ? ((cur - prev) / prev * 100).round() : null;
String _change(int? p) => p == null ? '' : p == 0 ? 'level on the period before' : '${p > 0 ? 'up' : 'down'} ${p.abs()}% on the period before';

String reportSummary(String tab, {
  required String Function(num) money,
  double sales = 0, double prevSales = 0, int receipts = 0, String? topProduct, int? topProductShare, int lines = 0,
  double purchases = 0, String? topSupplier, double expenses = 0, String? topCategory,
  double profit = 0, int? margin, double? prevProfit, double stockValue = 0, double expiredValue = 0,
}) {
  switch (tab) {
    case 'sales':
      if (receipts == 0) return 'No sales in these dates.';
      final c = _change(_pct(sales, prevSales));
      return '${money(sales)} from $receipts sale${receipts == 1 ? '' : 's'}${c.isEmpty ? '' : ', $c'}${topProduct == null ? '' : '; $topProduct sold most'}.';
    case 'products':
      return topProduct == null ? 'Nothing sold in these dates.' : '$topProduct sold most${topProductShare == null ? '' : ': $topProductShare% of the sales'}.';
    case 'lines':
      return lines == 0 ? 'Nothing sold in these dates.' : '$lines medicine line${lines == 1 ? '' : 's'} sold in these dates.';
    case 'purchases':
      return purchases > 0 ? '${money(purchases)} bought${topSupplier == null ? '' : ', most from $topSupplier'}.' : 'No deliveries received in these dates.';
    case 'expenses':
      return expenses > 0 ? '${money(expenses)} spent${topCategory == null ? '' : '; $topCategory the largest'}.' : 'No expenses in these dates.';
    case 'profit' || 'income':
      if (sales <= 0) return 'No sales in these dates, so no profit yet.';
      final c = prevProfit == null ? '' : ', ${_change(_pct(profit, prevProfit)).isEmpty ? 'the first period with figures' : _change(_pct(profit, prevProfit))}';
      return '${profit >= 0 ? 'A profit of' : 'A loss of'} ${money(profit.abs())}${margin == null ? '' : ' ($margin% of sales)'}$c.';
    case 'stock':
      return stockValue > 0 ? '${money(stockValue)} of stock at cost${expiredValue > 0 ? '; ${money(expiredValue)} has expired' : ''}.' : 'No stock in hand.';
    default:
      return '';
  }
}
