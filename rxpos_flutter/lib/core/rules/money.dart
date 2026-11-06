// Money math, ported from src/money.js. Amounts are whole currency units unless the pharmacy sets `decimals`.
// Every step rounds once and explicitly (half up, like JavaScript's Math.round), so a figure and its reversal
// (a refund) match to the unit and a pack-split price never leaves a tail like 1999.9999 on a stored total.
import 'package:intl/intl.dart';

const _eps = 2.220446049250313e-16; // Number.EPSILON

double _pow10(int d) {
  var f = 1.0;
  for (var i = 0; i < d; i++) {
    f *= 10;
  }
  return f;
}

/// Round to [decimals] places, half up (as JavaScript's Math.round).
double round(num n, [int decimals = 0]) {
  final v = n.toDouble();
  if (!v.isFinite) return 0;
  final f = _pow10(decimals);
  return ((v + _eps) * f + 0.5).floorToDouble() / f;
}

/// A line's net after its (amount) discount, rounded. Never negative.
double lineTotal({required num price, required num qty, num discount = 0, int decimals = 0}) {
  final gross = price * qty;
  return round(gross - discount < 0 ? 0 : gross - discount, decimals);
}

/// Sum of the lines' nets, each rounded per line.
double cartSubtotal(Iterable<({num price, num qty, num discount})> lines, [int decimals = 0]) =>
    lines.fold(0.0, (a, l) => a + lineTotal(price: l.price, qty: l.qty, discount: l.discount, decimals: decimals));

/// Tax on a net amount, rounded once. [inclusive]: the amount already contains the tax (extract it).
double taxOf(num net, num ratePercent, {bool inclusive = false, int decimals = 0}) {
  final r = ratePercent / 100;
  if (r == 0) return 0;
  return round(inclusive ? (net * r) / (1 + r) : net * r, decimals);
}

/// Price per unit when a pack of [perPack] is split.
double unitPrice(num packPrice, num perPack, [int decimals = 0]) => round(packPrice / (perPack == 0 ? 1 : perPack), decimals);

/// A quantity for display: whole numbers as they are, fractions to at most 2 decimals; with a unit, singular for 1.
String formatQty(num? n, [String unit = '']) {
  if (n == null || !n.isFinite) return '—';
  final v = n.toDouble();
  final whole = (v - v.round()).abs() < 1e-9;
  var txt = whole ? v.round().toString() : round(v, 2).toString();
  if (txt.contains('.')) txt = txt.replaceFirst(RegExp(r'\.?0+$'), '');
  if (unit.isEmpty) return txt;
  return '$txt ${v.abs() == 1 ? unit.replaceFirst(RegExp(r's$', caseSensitive: false), '') : unit}';
}

/// An amount in the pharmacy's currency and number style (not the device's): "UGX 1,234,567".
String formatMoney(num n, {String currency = '', int decimals = 0, String locale = 'en'}) {
  final loc = NumberFormat.localeExists(locale.replaceAll('-', '_')) ? locale.replaceAll('-', '_') : 'en';
  final f = NumberFormat.decimalPatternDigits(locale: loc, decimalDigits: decimals);
  return '$currency ${f.format(n)}'.trim();
}
