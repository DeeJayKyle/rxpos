// G2 (1.13; src/deliverycheck.js): check a delivery by scanning each pack. The line of the medicine scanned counts
// up (ticked when all are in); anything on no line is listed as extra; before "Receive stock" what is missing or
// extra is said.
import '../../../core/entities/product.dart';
import '../../../core/rules/gs1.dart';

class DeliveryCheck {
  const DeliveryCheck({this.counts = const {}, this.extra = const []});
  final Map<String, int> counts;
  final List<({String code, String name})> extra;
}

/// The product a scanned code stands for: its barcode, or the GTIN inside a GS1 pack code.
Product? productForCode(String code, List<Product> products) {
  final c = code.trim();
  if (c.isEmpty) return null;
  final gtin = parseGs1(c)?.gtin ?? '';
  final short = gtin.replaceFirst(RegExp(r'^0+'), '');
  return products.where((p) => p.barcode.isNotEmpty && (p.barcode == c || (gtin.isNotEmpty && (p.barcode == gtin || p.barcode == short)))).firstOrNull;
}

/// One scan → the new check, the line's key (null: extra) and what to say.
({DeliveryCheck check, String? lineKey, String text}) scanInto(DeliveryCheck c, List<Map<String, Object?>> lines, List<Product> products, String code) {
  final p = productForCode(code, products);
  final line = p == null ? null : lines.where((l) => l['productId'] == p.id).firstOrNull;
  if (p == null || line == null) {
    final name = p?.name ?? '';
    return (
      check: DeliveryCheck(counts: c.counts, extra: [...c.extra, (code: code.trim(), name: name)]),
      lineKey: null,
      text: name.isNotEmpty ? '$name is not on this order: listed as extra' : '${code.trim()}: not a medicine on this order: listed as extra',
    );
  }
  final n = (c.counts[p.id] ?? 0) + 1;
  final want = num.tryParse('${line['qty'] ?? ''}') ?? 0;
  return (
    check: DeliveryCheck(counts: {...c.counts, p.id: n}, extra: c.extra),
    lineKey: '${line['key']}',
    text: '${p.name}: $n of ${_n(want)}${n > want ? ' (more than ordered)' : n == want ? ' ✓' : ''}',
  );
}

String _n(num v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';

/// What doesn't match: lines short of their quantity, lines over it, and extra packs (as lines of text).
List<String> checkProblems(DeliveryCheck c, List<Map<String, Object?>> lines, String Function(Map<String, Object?>) nameOf) {
  final out = <String>[];
  for (final l in lines) {
    final id = '${l['productId'] ?? ''}';
    final want = num.tryParse('${l['qty'] ?? ''}') ?? 0;
    if (id.isEmpty || want <= 0) continue;
    final got = c.counts[id] ?? 0;
    if (got < want) out.add('${nameOf(l)}: $got of ${_n(want)} scanned');
    if (got > want) out.add('${nameOf(l)}: $got scanned, ${_n(want)} on the order');
  }
  for (final x in c.extra) {
    out.add('Extra: ${x.name.isEmpty ? x.code : x.name}');
  }
  return out;
}
