// The review before a delivery is received (lib/features/stock/domain/delivery_checks.dart): the same cases as
// tests/unit-delivery-checks.mjs, so both apps say the same. Fictional data.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/stock/domain/delivery_checks.dart';

void main() {
  String money(double n) {
    final s = n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
    return 'UGX $s';
  }

  String date(String d) => d;
  const known = {'pcm': (cost: 50.0, price: 100.0), 'amx': (cost: 300.0, price: 500.0)};
  final purchases = <Map<String, Object?>>[
    {'id': 'g1', 'number': 'GRN-7', 'supplierId': 's1', 'invoice': 'INV-0042', 'date': '2026-11-10', 'items': [{'productId': 'pcm', 'qty': 100}, {'productId': 'amx', 'qty': 30}]},
    {'id': 'g2', 'number': 'GRN-8', 'supplierId': 's2', 'invoice': '0042', 'date': '2026-11-12', 'items': [{'productId': 'pcm', 'qty': 200}]},
  ];
  ({List<String> summary, List<String> warnings}) review(List<ReviewLine> lines,
          {String date0 = '2026-11-22', String invoice = '5667', Object? invoiceTotal = '', bool dateRead = false, double total = 5500}) =>
      deliveryReview(lines: lines, known: known, purchases: purchases, supplierId: 's1', supplierName: 'Lakeview Medical', invoice: invoice, date: date0,
          today: '2026-11-22', total: total, invoiceTotal: invoiceTotal, dateRead: dateRead, money: money, showDate: date);

  test('invoice numbers compared without case, spaces or punctuation', () {
    expect(invoiceKey(' inv 0042 '), invoiceKey('INV-0042'));
    expect(sameInvoice(purchases, 's1', 'inv0042')?['id'], 'g1');
    expect(sameInvoice(purchases, 's1', '0042'), isNull, reason: "another supplier's 0042");
    expect(sameInvoice(purchases, 's1', ''), isNull);
    expect(mostReceived(purchases, 'pcm'), 200);
  });

  test('a delivery with nothing unusual: the summary only', () {
    final r = review([const ReviewLine(productId: 'pcm', name: 'Paracetamol 500mg', qty: 100, cost: 55, price: 100, expiry: '2028-06-30')]);
    expect(r.warnings, isEmpty);
    expect(r.summary, ['Lakeview Medical · invoice 5667 · dated 2026-11-22', '1 line, 100 units, total UGX 5,500']);
  });

  test('each warning', () {
    final r = review([
      const ReviewLine(productId: 'pcm', name: 'Paracetamol 500mg', qty: 1000, cost: 500, price: 400, expiry: '2027-02-01'),
      const ReviewLine(productId: 'amx', name: 'Amoxicillin 500mg', qty: 10, cost: 100, price: 500, expiry: '2028-01-01'),
      const ReviewLine(productId: null, name: 'Newmed Syrup', qty: 5, cost: 1000, price: 1500, expiry: '2028-01-01'),
    ], date0: '2026-11-12', dateRead: true, invoice: 'inv 0042', invoiceTotal: '6000');
    expect(r.warnings, [
      'Dated 2026-11-12, 10 days ago (the date read from the invoice): Purchase history and reports will list it on that day, not today.',
      'Invoice inv 0042 from Lakeview Medical was already received on 2026-11-10 (GRN-7). Receiving it again adds the stock twice.',
      'The invoice total is UGX 6,000 but the lines add up to UGX 5,500, UGX 500 short: a line may be missing or a figure mistyped.',
      'Paracetamol 500mg: cost UGX 500 a unit, last time UGX 50 (10.0 times more). Is it the price of a whole pack, or the quantity in packs?',
      'Paracetamol 500mg: 1000 units, 5 times the most received before (200). Is the quantity right?',
      'Paracetamol 500mg: expires on 2027-02-01, in 71 days: short-dated.',
      'Paracetamol 500mg: the retail price UGX 400 is below the cost UGX 500.',
      'Amoxicillin 500mg: cost UGX 100 a unit, last time UGX 300 (3.0 times less). Is it the price of a whole pack, or the quantity in packs?',
    ]);
    expect(r.summary.sublist(2), ['1 new medicine · 1 retail price changed']);
  });

  test('limits: just inside them is not asked about', () {
    final r = review([
      const ReviewLine(productId: 'pcm', name: 'P', qty: 999, cost: 99, price: 100, expiry: '2027-05-21'),
      const ReviewLine(productId: 'amx', name: 'A', qty: 19, cost: 151, price: 500, expiry: ''),
    ], date0: '2026-11-19', invoiceTotal: '5500.4');
    expect(r.warnings, isEmpty);
  });
}
