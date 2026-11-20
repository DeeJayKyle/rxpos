// Matching a line read off an invoice (printed or handwritten) to one of this pharmacy's medicines, and the same item
// under different names: as src/invoiceMatch.js and src/medmerge.js (tested with the same cases).
import '../entities/product.dart';
import 'search.dart' show fold;

const _formWords = {
  'tablet', 'tablets', 'tabs', 'tab', 'tb', 'tbs', 'capsule', 'capsules', 'caps', 'cap', 'syrup', 'syr', 'suspension', 'susp', 'cream', 'crm', 'ointment', 'oint',
  'injection', 'inj', 'drops', 'drop', 'the', 'and', 'with', 'for', 'pack', 'packs', 'pcs', 'pc', 'box', 'boxes', 'bx', 'bottle', 'btl', 'btls', 'strip', 'strips', 'sachet', 'sachets', 'vial', 'vials',
  'amp', 'amps', 'ampoule', 'ampoules', 'tube', 'tubes', 'film', 'coated', 'fc', 'ec', 'sr', 'dt', 'oral', 'solution', 'soln', 'sol', 'ml', 'mg', 'mcg', 'g', 'iu', 'each', 'per', 'of', 'no', 'qty', 'nos', 'tins', 'tin',
};
const _short = {
  'amox': 'amoxicillin', 'amoxil': 'amoxicillin', 'amoxi': 'amoxicillin', 'pcm': 'paracetamol', 'para': 'paracetamol', 'panadol': 'paracetamol', 'cotrim': 'cotrimoxazole', 'septrin': 'cotrimoxazole',
  'metro': 'metronidazole', 'flagyl': 'metronidazole', 'cipro': 'ciprofloxacin', 'ibu': 'ibuprofen', 'ibupro': 'ibuprofen', 'diclo': 'diclofenac', 'omep': 'omeprazole', 'ome': 'omeprazole',
  'hctz': 'hydrochlorothiazide', 'asa': 'aspirin', 'vit': 'vitamin', 'multivit': 'multivitamin', 'ferrous': 'ferrous', 'fefol': 'ferrous', 'chlor': 'chlorpheniramine', 'cpm': 'chlorpheniramine',
  'azith': 'azithromycin', 'azithro': 'azithromycin', 'erythro': 'erythromycin', 'doxy': 'doxycycline', 'genta': 'gentamicin', 'ceftri': 'ceftriaxone', 'metfor': 'metformin', 'amlo': 'amlodipine',
  'nifed': 'nifedipine', 'predni': 'prednisolone', 'salbu': 'salbutamol', 'albend': 'albendazole', 'mebend': 'mebendazole', 'fluco': 'fluconazole', 'clotri': 'clotrimazole', 'hydrocort': 'hydrocortisone',
  'ors': 'ors', 'zinc': 'zinc', 'coartem': 'artemether', 'al': 'artemether', 'amoxiclav': 'amoxicillin', 'augmentin': 'amoxicillin',
};
const _lookalike = [['l', 'i'], ['l', '1'], ['i', '1'], ['o', '0'], ['o', 'a'], ['u', 'v'], ['u', 'n'], ['n', 'r'], ['e', 'c'], ['a', 'e'], ['s', '5'], ['z', '2'], ['b', '8'], ['g', '9'], ['t', 'f'], ['h', 'n']];
final _look = {for (final p in _lookalike) ...['${p[0]}${p[1]}', '${p[1]}${p[0]}']};
final _shortF = {for (final e in _short.entries) fold(e.key): fold(e.value)};

/// The words of a name worth comparing: folded, form / pack words, pack sizes (10x10) and strengths left out.
List<String> nameWords(String s) => fold(s)
    .replaceAll(RegExp(r'\b\d+\s*[x*]\s*\d+\b'), ' ')
    .split(RegExp(r'[\s.]+'))
    .where((w) => w.isNotEmpty && !_formWords.contains(w) && !RegExp(r'^x?\d').hasMatch(w))
    .map((w) => _shortF[w] ?? w)
    .toList();

/// Strengths on a name in one unit: "500mg" → 500mg, "1g" → 1000mg, "80/480" kept; a volume is the pack, not a strength.
List<String> strengthsOf(String s) {
  final out = <String>[];
  for (final m in RegExp(r'(\d+(?:\.\d+)?)(mg|mcg|g|ml|iu|%)').allMatches(fold(s))) {
    final n = double.parse(m[1]!), u = m[2]!;
    if (u == 'ml') continue;
    String num(double v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';
    out.add(u == 'g' ? '${num(n * 1000)}mg' : u == 'mcg' && n >= 1000 ? '${num(n / 1000)}mg' : '${num(n)}$u');
  }
  for (final m in RegExp(r'\b(\d+)\s*/\s*(\d+)\b(?!\s*ml)').allMatches(s.toLowerCase())) {
    out.add('${m[1]}/${m[2]}');
  }
  return out.toSet().toList();
}

double _distance(String a, String b) {
  if (a == b) return 0;
  final m = a.length, n = b.length;
  if ((m - n).abs() > 3) return (m > n ? m : n).toDouble();
  List<double>? prev2;
  var prev = [for (var j = 0; j <= n; j++) j.toDouble()];
  for (var i = 1; i <= m; i++) {
    final cur = <double>[i.toDouble()];
    for (var j = 1; j <= n; j++) {
      final x = a[i - 1], y = b[j - 1];
      final sub = x == y ? 0.0 : _look.contains('$x$y') ? 0.5 : 1.0;
      var d = [prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub].reduce((p, q) => p < q ? p : q);
      if (prev2 != null && i > 1 && j > 1 && x == b[j - 2] && a[i - 2] == y && prev2[j - 2] + 1 < d) d = prev2[j - 2] + 1;
      cur.add(d);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/// How alike two words are, 0 to 1 (the same, one the start of the other, or a few letters misread).
double wordLike(String w, String h) {
  if (w == h) return 1;
  final short = w.length < h.length ? w.length : h.length, long = w.length > h.length ? w.length : h.length;
  if (short >= 4 && (h.startsWith(w) || w.startsWith(h))) return 0.9;
  if (short < 4) return 0;
  if (w[0] != h[0] && !_look.contains('${w[0]}${h[0]}')) return 0;
  final d = _distance(w, h), allowed = long <= 6 ? 1 : long <= 9 ? 2 : 3;
  return d <= allowed ? 1 - d / long / 1.5 : 0;
}

List<String> _aliases(Product p) => [for (final a in (p.raw['aliases'] as List?) ?? const []) '$a'];
final _prep = Expando<({List<String> own, List<String> all, String first, List<String> str})>();
({List<String> own, List<String> all, String first, List<String> str}) _prepOf(Product p) => _prep[p] ??= () {
      final own = nameWords(p.name);
      final all = {...own, ...nameWords('${p.generic} ${p.raw['ingredients'] ?? ''} ${_aliases(p).join(' ')}')}.toList();
      return (own: own, all: all, first: own.isNotEmpty ? own.first : (all.isNotEmpty ? all.first : ''), str: strengthsOf('${p.name} ${p.strength}'));
    }();

/// The invoice words a medicine was received as before: folded words|strengths → productId (purchase items' invoiceName).
Map<String, String> learnedNames(Iterable<Map<String, Object?>> purchases) => {
      for (final pu in purchases)
        for (final it in ((pu['items'] as List?) ?? const []).whereType<Map>())
          if ('${it['invoiceName'] ?? ''}'.isNotEmpty && '${it['productId'] ?? ''}'.isNotEmpty)
            '${nameWords('${it['invoiceName']}').join(' ')}|${strengthsOf('${it['invoiceName']}').join(',')}': '${it['productId']}',
    };

typedef Ranked = ({Product p, double score, bool sure, String why});

/// The medicines an invoice line could be, best first; `sure` = safe to put on the line (still shown for checking).
List<Ranked> rankProducts(String name, List<Product> products, {Map<String, String>? learned, String? alt, double Function(Product)? stockOf, int limit = 5}) {
  final names = [name, ?alt].where((x) => x.trim().isNotEmpty).toList();
  if (names.isEmpty || products.isEmpty) return const [];
  final byId = {for (final p in products) p.id: p};
  final out = <String, Ranked>{};
  void add(Product p, double score, String why, bool sure) {
    final was = out[p.id];
    if (was == null || score > was.score) out[p.id] = (p: p, score: score, why: why, sure: sure);
  }

  for (final n in names) {
    final id = learned?['${nameWords(n).join(' ')}|${strengthsOf(n).join(',')}'];
    if (id != null && byId[id] != null) add(byId[id]!, 3, 'received as this before', true);
    final code = RegExp(r'\b\d{8,14}\b').firstMatch(n)?[0];
    if (code != null) {
      for (final p in products) {
        if (p.barcode == code) add(p, 2.5, 'barcode', true);
      }
    }
    final want = nameWords(n), wantStr = strengthsOf(n);
    if (want.isEmpty) continue;
    for (final p in products) {
      final h = _prepOf(p);
      if (h.all.isEmpty) continue;
      var sum = 0.0, exact = 0;
      for (final w in want) {
        var b = 0.0;
        for (final x in h.all) {
          final s = wordLike(w, x);
          if (s > b) b = s;
          if (b == 1) break;
        }
        sum += b;
        if (b == 1) exact++;
      }
      final hit = sum / want.length;
      if (hit < 0.5) continue;
      final cover = h.own.isEmpty ? 0 : h.own.where((x) => want.any((w) => wordLike(w, x) >= 0.8)).length / h.own.length;
      final bool? strengthSame = wantStr.isNotEmpty && h.str.isNotEmpty ? wantStr.any(h.str.contains) : null;
      final score = hit + 0.25 * cover + (strengthSame == true ? 0.3 : strengthSame == false ? -0.8 : 0) + (wordLike(want.first, h.first) >= 0.8 ? 0.15 : 0) + ((stockOf?.call(p) ?? 0) > 0 ? 0.03 : 0);
      final why = strengthSame == false ? 'strength differs (${h.str.join(', ')})' : exact == want.length ? 'same name' : 'name read alike';
      add(p, score, why, strengthSame != false && hit >= 0.75 && score >= 0.9);
    }
  }
  final list = out.values.where((x) => x.score >= 0.55).toList()..sort((a, b) => b.score.compareTo(a.score));
  final top = list.take(limit).toList();
  if (top.length > 1 && top[0].sure && top[0].score < 2 && top[0].score - top[1].score < 0.08) {
    top[0] = (p: top[0].p, score: top[0].score, sure: false, why: '${top[0].why}; another medicine is as likely');
  }
  return top;
}

// ---------- the same item under different names (src/medmerge.js) ----------
const _formOf = [
  (r'tab|tb\b', 'tablet'), (r'cap', 'capsule'), (r'syr|susp|suspension|elixir|mixture', 'liquid'), (r'inj|amp|vial', 'injection'), (r'cream|crm|oint|gel|lotion', 'topical'),
  (r'drop', 'drops'), (r'sachet|powder', 'sachet'), (r'inhal|spray|puff', 'inhaler'), (r'suppos|pessar', 'suppository'),
];

/// The form of a medicine from its form field, else from its name ('' when unknown).
String formOf(Product p) {
  final f = p.form.toLowerCase();
  for (final (re, k) in _formOf) {
    if (RegExp(re).hasMatch(f)) return k;
  }
  final n = p.name.toLowerCase();
  for (final (re, k) in _formOf) {
    if (RegExp('\\b(${re.replaceAll(r'\b', '')})').hasMatch(n)) return k;
  }
  return '';
}

final _facts = Expando<({String s, String form, List<String> w})>();
({String s, String form, List<String> w}) _factsOf(Product p) =>
    _facts[p] ??= (s: (strengthsOf('${p.name} ${p.strength}')..sort()).join(','), form: formOf(p), w: nameWords(p.name));

/// Are two medicines the same item (same words, strengths and form)?
bool sameItem(Product a, Product b) {
  if (a.id == b.id) return false;
  final x = _factsOf(a), y = _factsOf(b);
  if (x.s != y.s || (x.form.isNotEmpty && y.form.isNotEmpty && x.form != y.form)) return false;
  if (x.w.isEmpty || x.w.length != y.w.length) return false;
  for (var i = 0; i < x.w.length; i++) {
    if (wordLike(x.w[i], y.w[i]) < 0.8) return false;
  }
  return true;
}

/// Groups of medicines that look like one item, with the one to keep suggested (most stock, then a barcode).
List<({List<Product> items, String keep})> mergeGroups(List<Product> products, double Function(Product) stockOf) {
  final buckets = <String, List<Product>>{};
  for (final p in products) {
    final f = _factsOf(p);
    if (p.name.isEmpty || f.w.isEmpty) continue;
    (buckets['${f.s}|${f.w.length}|${f.w.first.length >= 3 ? f.w.first.substring(0, 3) : f.w.first}'] ??= []).add(p);
  }
  final out = <({List<Product> items, String keep})>[];
  for (final list in buckets.values) {
    if (list.length < 2) continue;
    final parent = {for (final p in list) p.id: p.id};
    String root(String x) {
      while (parent[x] != x) {
        x = parent[x]!;
      }
      return x;
    }

    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        if (sameItem(list[i], list[j])) parent[root(list[i].id)] = root(list[j].id);
      }
    }
    final groups = <String, List<Product>>{};
    for (final p in list) {
      (groups[root(p.id)] ??= []).add(p);
    }
    for (final items in groups.values) {
      if (items.length < 2) continue;
      final keep = ([...items]..sort((a, b) {
            final s = stockOf(b).compareTo(stockOf(a));
            if (s != 0) return s;
            final c = (b.barcode.isNotEmpty ? 1 : 0) - (a.barcode.isNotEmpty ? 1 : 0);
            return c != 0 ? c : a.name.length - b.name.length;
          }))
          .first;
      out.add((items: items, keep: keep.id));
    }
  }
  return out..sort((a, b) => a.items.first.name.compareTo(b.items.first.name));
}

/// The kept medicine after a merge: the others' names as aliases, their barcode when it has none, their packs and
/// missing details added.
Map<String, Object?> mergedRecord(Map<String, Object?> keep, List<Map<String, Object?>> gone) {
  String s(Object? v) => '${v ?? ''}';
  final aliases = <String>{
    for (final a in (keep['aliases'] as List?) ?? const []) '$a',
    for (final g in gone) ...[s(g['name']), for (final a in (g['aliases'] as List?) ?? const []) '$a'],
    for (final g in gone)
      if (s(keep['barcode']).isNotEmpty && s(g['barcode']).isNotEmpty && g['barcode'] != keep['barcode']) s(g['barcode']),
  }..removeWhere((x) => x.isEmpty || x == keep['name']);
  final packs = [for (final k in (keep['packs'] as List?) ?? const []) k];
  for (final g in gone) {
    for (final k in ((g['packs'] as List?) ?? const []).whereType<Map>()) {
      if (!packs.whereType<Map>().any((x) => x['name'] == k['name'] && '${x['size']}' == '${k['size']}')) packs.add(k);
    }
  }
  final fill = <String, Object?>{
    for (final f in ['barcode', 'generic', 'category', 'shelf', 'strength', 'ingredients'])
      if (s(keep[f]).isEmpty && gone.any((g) => s(g[f]).isNotEmpty)) f: gone.firstWhere((g) => s(g[f]).isNotEmpty)[f],
  };
  return {...keep, ...fill, 'aliases': aliases.toList(), if (packs.isNotEmpty) 'packs': packs};
}
