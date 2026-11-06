// Medicine search, ported from src/search.js: every word typed must appear in the medicine's brand, generic name,
// form, category, strength or barcode, ignoring case, accents, punctuation and common spelling variants
// (amoxycillin / amoxicillin, sulphate / sulfate, paediatric / pediatric, "500 mg" / "500mg").
import '../entities/product.dart';

const _accents = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ù': 'u',
  'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'ÿ': 'y',
};

final _nonWord = RegExp(r'[^a-z0-9%.]+');
final _strength = RegExp(r'(\d)\s+(mg|mcg|g|ml|iu|%)\b');
final _doubled = RegExp(r'([a-z])\1+');
final _spaces = RegExp(r'\s+');

/// Lower-case, accents and punctuation gone, strengths joined, spelling variants folded.
String fold(String? s) {
  var t = (s ?? '').toLowerCase();
  t = t.split('').map((c) => _accents[c] ?? c).join();
  t = t.replaceAll(_nonWord, ' ').replaceAllMapped(_strength, (m) => '${m[1]}${m[2]}');
  t = t.replaceAll('ph', 'f').replaceAll(RegExp('ae|oe'), 'e').replaceAll('y', 'i').replaceAll('ck', 'k');
  t = t.replaceAllMapped(_doubled, (m) => m[1]!);
  return t.replaceAll(_spaces, ' ').trim();
}

/// One searchable string per medicine (built once, reused for every keystroke).
String searchKey(Product p) {
  final ingredients = p.raw['ingredients'];
  return fold([p.name, p.generic, if (ingredients is String) ingredients, p.strength, p.form, p.category, p.barcode]
      .where((x) => x.isNotEmpty)
      .join(' '));
}

/// Medicines matching [query], best first: name starts with it, then a word starts with it, then anywhere; in stock
/// first within each. [stockOf] gives the stock at this branch.
List<Product> searchProducts(List<Product> list, String query, {required double Function(Product) stockOf, String Function(Product)? keyOf}) {
  final q = fold(query);
  if (q.isEmpty) return list;
  final words = q.split(' ');
  final key = keyOf ?? searchKey;
  final out = <(int, int, Product)>[];
  var i = 0;
  for (final p in list) {
    final k = key(p);
    if (!words.every(k.contains)) continue;
    final rank = fold(p.name).startsWith(q) ? 0 : ' $k'.contains(' ${words.first}') ? 1 : 2;
    out.add((rank, i++, p));
  }
  out.sort((a, b) {
    final r = a.$1.compareTo(b.$1);
    if (r != 0) return r;
    final s = (stockOf(b.$3) > 0 ? 1 : 0) - (stockOf(a.$3) > 0 ? 1 : 0);
    return s != 0 ? s : a.$2.compareTo(b.$2);
  });
  return [for (final x in out) x.$3];
}
