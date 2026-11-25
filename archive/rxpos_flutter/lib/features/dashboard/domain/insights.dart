// Medicines worth promoting today (src/engage.jsx useInsights, src/promote.js): never prescription-only or controlled
// medicines (the idle screen faces customers). Short expiry first, then high margin and slow movers.
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/money.dart';

typedef Insight = ({String kind, Product p, String note, String staff});

bool isFeaturable(Product p, double stock) => stock > 0 && p.price > 0 && !p.rx && !p.controlled;

({List<Insight> shortExpiry, List<Insight> slow, List<Insight> highValue, List<Insight> highMargin}) insights(Iterable<Product> products, double Function(String) stockOf,
    List<BatchStock> Function(String) batchesOf, Iterable<Sale> sales, PharmacySettings s, {DateTime? now}) {
  final warn = s.expiryWarnDays.round();
  final inStock = products.where((p) => isFeaturable(p, stockOf(p.id))).toList();
  final lastSold = <String, String>{};
  var oldest = today(now);
  for (final x in sales) {
    if (x.status == 'refunded') continue;
    final d = dayOf(x.date);
    if (d.compareTo(oldest) < 0) oldest = d;
    for (final i in x.items) {
      if ((lastSold[i.id] ?? '').compareTo(d) < 0) lastSold[i.id] = d;
    }
  }
  final dead = (s.raw['deadDays'] as num?)?.round() ?? 90;
  final slowAfter = dead < 60 ? dead : 60;
  final history = daysSince(oldest, now: now) >= slowAfter;
  double margin(Product p) => p.price > 0 && p.cost > 0 ? (p.price - p.cost) / p.price : 0;
  String next(Product p) => batchesOf(p.id).where((b) => b.qty > 0 && b.expiry.isNotEmpty).map((b) => b.expiry).fold('', (a, e) => a.isEmpty || e.compareTo(a) < 0 ? e : a);
  final shortExpiry = [
    for (final p in inStock)
      if (next(p).isNotEmpty && daysUntil(next(p), now: now) >= 0 && daysUntil(next(p), now: now) <= warn) p,
  ]..sort((a, b) => next(a).compareTo(next(b)));
  final slow = !history
      ? <Product>[]
      : ([for (final p in inStock) if (lastSold[p.id] == null || daysSince(lastSold[p.id]!, now: now) >= slowAfter) p]
        ..sort((a, b) => (stockOf(b.id) * (b.cost != 0 ? b.cost : b.price)).compareTo(stockOf(a.id) * (a.cost != 0 ? a.cost : a.price))));
  final highValue = [...inStock]..sort((a, b) => b.price.compareTo(a.price));
  final highMargin = inStock.where((p) => margin(p) >= .25).toList()..sort((a, b) => margin(b).compareTo(margin(a)));
  String left(Product p) => '${formatQty(stockOf(p.id))} in stock';
  return (
    shortExpiry: [for (final p in shortExpiry.take(10)) (kind: 'expiry', p: p, note: 'Expires in ${daysUntil(next(p), now: now)} days · ${left(p)}', staff: 'Short expiry')],
    slow: [
      for (final p in slow.take(10))
        (kind: 'slow', p: p, note: lastSold[p.id] != null ? 'No sale for ${daysSince(lastSold[p.id]!, now: now)} days · ${left(p)}' : 'Not sold yet · ${left(p)}', staff: 'Recommend it'),
    ],
    highValue: [for (final p in highValue.take(8)) (kind: 'value', p: p, note: left(p), staff: 'High value')],
    highMargin: [for (final p in highMargin.take(10)) (kind: 'margin', p: p, note: '${(margin(p) * 100).round()}% margin · ${left(p)}', staff: 'Suggest it')],
  );
}

/// What to promote on the dashboard: up to four, each medicine once.
List<Insight> promoteToday(({List<Insight> shortExpiry, List<Insight> slow, List<Insight> highValue, List<Insight> highMargin}) i) {
  final pick = [i.shortExpiry.elementAtOrNull(0), i.highMargin.elementAtOrNull(0), i.slow.elementAtOrNull(0), i.highMargin.elementAtOrNull(1), i.shortExpiry.elementAtOrNull(1)];
  final out = <Insight>[];
  for (final x in pick) {
    if (x != null && !out.any((y) => y.p.id == x.p.id)) out.add(x);
  }
  return out.take(4).toList();
}

/// The WhatsApp message to share a medicine.
String shareText(Product p, PharmacySettings s) {
  final where = [s.name, s.address].where((x) => x.isNotEmpty).join(', ');
  return '💊 *${p.name}*${p.generic.isNotEmpty && p.generic != p.name ? ' (${p.generic})' : ''} is available at ${where.isEmpty ? 'our pharmacy' : where} for ${s.money(p.price)}.'
      '${s.phone.isNotEmpty ? ' Call or WhatsApp ${s.phone}.' : ''} Ask our pharmacist for advice. Get well soon!';
}
