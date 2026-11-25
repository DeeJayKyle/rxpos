// What Add Stock shows before a delivery is received (the owner's request, 2026-11-22): a summary of the delivery and
// the things worth a second look. The same rules as src/deliverychecks.js (both checked against the same cases:
// tests/unit-delivery-checks.mjs and test/features/delivery_checks_test.dart). Nothing here refuses a delivery.
import 'stock_form.dart' show oldDeliveryDays;

const costJump = 2; // a unit cost at least twice, or at most half, the medicine's last cost
const bigQty = 5; // a quantity at least 5 times the most received of that medicine before…
const bigQtyMin = 20; // …and at least this many units
const shortExpiryDays = 180; // expiring within about 6 months of the delivery

/// One line as the review sees it: [productId] null for a new medicine; [qty] in units, [cost] per unit.
class ReviewLine {
  const ReviewLine({required this.productId, required this.name, required this.qty, required this.cost, required this.price, required this.expiry});
  final String? productId;
  final String name, expiry;
  final double qty, cost, price;
}

/// An invoice number as compared: case, spaces and punctuation don't count.
String invoiceKey(Object? v) => '${v ?? ''}'.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}'.trim()) ?? 0;

/// An earlier delivery (a purchases record) from the same supplier with the same invoice number, or null.
Map<String, Object?>? sameInvoice(List<Map<String, Object?>> purchases, String supplierId, String invoice) {
  final k = invoiceKey(invoice);
  if (k.isEmpty || supplierId.isEmpty) return null;
  for (final p in purchases) {
    if ('${p['supplierId'] ?? ''}' == supplierId && invoiceKey(p['invoice']) == k) return p;
  }
  return null;
}

/// The most of a medicine received in one earlier delivery (units), 0 when never.
double mostReceived(List<Map<String, Object?>> purchases, String productId) {
  var most = 0.0;
  for (final p in purchases) {
    for (final i in (p['items'] as List?) ?? const []) {
      if (i is Map && '${i['productId'] ?? ''}' == productId && _n(i['qty']) > most) most = _n(i['qty']);
    }
  }
  return most;
}

final _plain = RegExp(r'^\d{4}-\d{2}-\d{2}$');
int? _days(String from, String to) {
  if (!_plain.hasMatch(from) || !_plain.hasMatch(to)) return null;
  return DateTime.parse('${to}T00:00:00Z').difference(DateTime.parse('${from}T00:00:00Z')).inDays;
}

String _num(double n) => n == n.roundToDouble() ? '${n.toInt()}' : '$n';

/// The review before "Receive stock": (summary, warnings). [known]: each medicine's current cost and price, by id.
({List<String> summary, List<String> warnings}) deliveryReview({
  required List<ReviewLine> lines,
  required Map<String, ({double cost, double price})> known,
  required List<Map<String, Object?>> purchases,
  required String supplierId,
  required String supplierName,
  required String invoice,
  required String date,
  required String today,
  required double total,
  required Object? invoiceTotal,
  required bool dateRead,
  required String Function(double) money,
  required String Function(String) showDate,
}) {
  final warnings = <String>[];
  final old = oldDeliveryDays(date, today);
  if (old > 0) warnings.add('Dated ${showDate(date)}, $old days ago${dateRead ? ' (the date read from the invoice)' : ''}: Purchase history and reports will list it on that day, not today.');
  final twice = sameInvoice(purchases, supplierId, invoice);
  if (twice != null) {
    final on = '${twice['date'] ?? ''}', no = '${twice['number'] ?? ''}';
    warnings.add('Invoice ${invoice.trim()} from ${supplierName.isEmpty ? 'this supplier' : supplierName} was already received${on.isNotEmpty ? ' on ${showDate(on)}' : ''}${no.isNotEmpty ? ' ($no)' : ''}. Receiving it again adds the stock twice.');
  }
  final inv = _n(invoiceTotal);
  if (inv > 0 && (inv - total).abs() >= 1) {
    warnings.add('The invoice total is ${money(inv)} but the lines add up to ${money(total)}, ${money((inv - total).abs())} ${inv > total ? 'short' : 'over'}: a line may be missing or a figure mistyped.');
  }
  for (final l in lines) {
    final p = l.productId == null ? null : known[l.productId];
    final last = p?.cost ?? 0;
    if (p != null && l.cost > 0 && last > 0 && (l.cost >= last * costJump || l.cost * costJump <= last)) {
      warnings.add('${l.name}: cost ${money(l.cost)} a unit, last time ${money(last)} (${l.cost > last ? '${(l.cost / last).toStringAsFixed(1)} times more' : '${(last / l.cost).toStringAsFixed(1)} times less'}). Is it the price of a whole pack, or the quantity in packs?');
    }
    final most = l.productId == null ? 0.0 : mostReceived(purchases, l.productId!);
    if (most > 0 && l.qty >= bigQtyMin && l.qty >= most * bigQty) {
      warnings.add('${l.name}: ${_num(l.qty)} units, ${(l.qty / most).floor()} times the most received before (${_num(most)}). Is the quantity right?');
    }
    final left = _days(today, l.expiry);
    if (left != null && left >= 0 && left < shortExpiryDays) warnings.add('${l.name}: expires on ${showDate(l.expiry)}, in $left days: short-dated.');
    if (l.price > 0 && l.cost > 0 && l.price < l.cost) warnings.add('${l.name}: the retail price ${money(l.price)} is below the cost ${money(l.cost)}.');
  }
  final fresh = {for (final l in lines) if (l.productId == null) l.name.trim().toLowerCase()}.length;
  final priced = lines.where((l) => l.productId != null && known[l.productId] != null && l.price > 0 && l.price != known[l.productId]!.price).length;
  final units = lines.fold<double>(0, (a, l) => a + l.qty);
  final summary = [
    '${supplierName.isEmpty ? 'No supplier' : supplierName} · ${invoice.trim().isNotEmpty ? 'invoice ${invoice.trim()}' : 'no invoice number'} · dated ${showDate(date)}',
    '${lines.length} line${lines.length == 1 ? '' : 's'}, ${_num(units)} unit${units == 1 ? '' : 's'}, total ${money(total)}',
    if (fresh > 0 || priced > 0)
      [if (fresh > 0) '$fresh new medicine${fresh == 1 ? '' : 's'}', if (priced > 0) '$priced retail price${priced == 1 ? '' : 's'} changed'].join(' · '),
  ];
  return (summary: summary, warnings: warnings);
}
