// Consistent medicine names (src/medname.js): suggestions only; a person ticks and approves each change before
// anything is saved (features/inventory/presentation/name_check.dart).
const _forms = {
  'tab': 'Tablets', 'tabs': 'Tablets', 'tb': 'Tablets', 'tbs': 'Tablets', 'tablet': 'Tablets', 'tablets': 'Tablets', 'cap': 'Capsules', 'caps': 'Capsules', 'capsule': 'Capsules',
  'capsules': 'Capsules', 'syr': 'Syrup', 'syrup': 'Syrup', 'susp': 'Suspension', 'suspension': 'Suspension', 'inj': 'Injection', 'injection': 'Injection', 'oint': 'Ointment',
  'ointment': 'Ointment', 'crm': 'Cream', 'cream': 'Cream', 'sol': 'Solution', 'soln': 'Solution', 'solution': 'Solution', 'drops': 'Drops', 'gel': 'Gel', 'lotion': 'Lotion',
  'sachet': 'Sachets', 'sachets': 'Sachets', 'inhaler': 'Inhaler', 'spray': 'Spray', 'pessaries': 'Pessaries', 'suppositories': 'Suppositories',
};
const _keepCaps = {'DS', 'SR', 'ER', 'XR', 'XL', 'MR', 'CR', 'DT', 'EC', 'FC', 'IV', 'IM', 'ORS', 'ARV', 'TB', 'HIV', 'BP', 'AL', 'ACT', 'PCM', 'ASA', 'HCT', 'HCTZ', 'MDI', 'ENT', 'LA', 'OD', 'BD', 'II', 'III', 'B6', 'B12', 'D3', 'K2', 'C', 'E', 'A', 'B', 'D', 'K', 'Q10'};
final _unit = RegExp(r'^(\d+(?:\.\d+)?)(mg|mcg|µg|g|kg|ml|l|iu|%|cm|mm)$', caseSensitive: false);

String _title(String w) => w.length <= 1 ? w : w[0].toUpperCase() + w.substring(1).toLowerCase();

/// One name in the house style ("Paracetamol 500mg Tablets"); the same name back when nothing needs changing.
String tidyName(String name) {
  var s = name.replaceAll(RegExp(r'[?!*_#~`"]+'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
  if (s.isEmpty) return s;
  final letters = s.replaceAll(RegExp(r'\d+(?:\.\d+)?\s*(mg|mcg|µg|g|kg|ml|iu|l)\b', caseSensitive: false), '').replaceAll(RegExp(r'[^A-Za-z]'), '');
  final allCaps = letters.length > 3 && letters == letters.toUpperCase();
  s = s.replaceAllMapped(RegExp(r'(\d)\s*(mg|mcg|µg|g|kg|ml|iu|%)\b', caseSensitive: false), (m) => '${m[1]}${m[2]!.toLowerCase() == 'iu' ? 'IU' : m[2]!.toLowerCase()}');
  s = s.replaceAllMapped(RegExp(r'(\d)\s*[xX×]\s*(\d)'), (m) => '${m[1]}x${m[2]}');
  final first = s.split(' ').first;
  final words = [
    for (final w in s.split(' '))
      () {
        final bare = w.replaceAll(RegExp(r'^[(]+|[),.;:]+$'), '');
        final at = w.indexOf(bare);
        final pre = w.substring(0, at), post = w.substring(at + bare.length);
        final low = bare.toLowerCase();
        String out = bare;
        if (_forms[low] != null) {
          out = _forms[low]!;
        } else if (_unit.hasMatch(bare) || (RegExp(r'\d').hasMatch(bare) && RegExp(r'^[\d.x/+-]+[a-z%]*$', caseSensitive: false).hasMatch(bare))) {
          out = bare;
        } else if (allCaps) {
          out = _keepCaps.contains(bare.toUpperCase())
              ? bare.toUpperCase()
              : bare.splitMapJoin(RegExp(r'[-/+&]'), onNonMatch: (p) => RegExp(r'^[A-Za-z]+$').hasMatch(p) ? (_keepCaps.contains(p.toUpperCase()) ? p.toUpperCase() : _title(p)) : p);
        } else if (w == first && RegExp(r'^[a-z]').hasMatch(bare)) {
          out = bare[0].toUpperCase() + bare.substring(1);
        }
        return '$pre$out$post';
      }(),
  ];
  return words.join(' ').replaceAll(RegExp(r'\s+'), ' ').trim();
}

List<num> _numbers(String s) => RegExp(r'\d+(?:\.\d+)?').allMatches(s).map((m) => num.parse(m[0]!)).toList();

/// A suggested new name is offered only when it keeps every number (strength, pack) and the medicine's main word.
bool safeRename(String from, String to) {
  final a = from.trim(), b = to.trim();
  if (b.isEmpty || a == b || b.length > (a.length * 1.6 > 80 ? a.length * 1.6 : 80)) return false;
  if (_numbers(a).join(',') != _numbers(b).join(',')) return false;
  final main = RegExp(r'[a-z]{4,}').allMatches(a.toLowerCase()).map((m) => m[0]!).where((w) => !_forms.containsKey(w)).firstOrNull;
  return main == null || b.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '').contains(main.substring(0, 4));
}

/// Every medicine whose name the house style would change: (id, from, to).
List<({String id, String from, String to})> nameSuggestions(Iterable<({String id, String name})> products) => [
      for (final p in products)
        if (p.name.isNotEmpty && tidyName(p.name) != p.name && safeRename(p.name, tidyName(p.name))) (id: p.id, from: p.name, to: tidyName(p.name)),
    ];
