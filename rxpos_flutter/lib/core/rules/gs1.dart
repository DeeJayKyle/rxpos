// GS1 codes on medicine packs (workplan step 21), the same rules as src/gs1.js and checked against the same cases
// (tests/gs1-cases.json): the 2D DataMatrix on a box carries the product number (GTIN, AI 01), expiry (AI 17,
// YYMMDD), batch (AI 10) and often a serial (AI 21). Scanning it fills the medicine, batch and expiry at Add Stock and
// picks that batch at the till. GS (\x1d) ends a variable-length field; a scanner that can't send it leaves a
// variable field running to the end (still right in the usual order: 01, 17, 10 last). The printed text form
// "(01)…(17)…(10)…" is read too.
class Gs1 {
  const Gs1({required this.gtin, this.expiry = '', this.batch = '', this.serial = ''});
  final String gtin, expiry, batch, serial;
  Map<String, String> toJson() => {'gtin': gtin, 'expiry': expiry, 'batch': batch, 'serial': serial};
}

const _gs = '\x1d';
const _fixed = {'01': 14, '02': 14, '11': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2};
const _variable = {'10': 20, '21': 20, '22': 20, '240': 30, '241': 30, '30': 8, '37': 8, '710': 20, '711': 20, '712': 20, '713': 20, '714': 20};

/// GTIN check digit (mod 10, weights 3/1 from the right).
bool gtinValid(String g) {
  if (!RegExp(r'^\d{8}$|^\d{12,14}$').hasMatch(g)) return false;
  final d = g.split('').map(int.parse).toList();
  final check = d.removeLast();
  var sum = 0;
  for (var i = 0; i < d.length; i++) {
    sum += d[d.length - 1 - i] * (i.isEven ? 3 : 1);
  }
  return (10 - sum % 10) % 10 == check;
}

/// YYMMDD → YYYY-MM-DD; a day of 00 is the last day of that month.
String gs1Date(String? v) {
  if (v == null || !RegExp(r'^\d{6}$').hasMatch(v)) return '';
  final y = 2000 + int.parse(v.substring(0, 2)), m = int.parse(v.substring(2, 4));
  var d = int.parse(v.substring(4, 6));
  if (m < 1 || m > 12) return '';
  if (d == 0) d = DateTime.utc(y, m + 1, 0).day;
  return '$y-${'$m'.padLeft(2, '0')}-${'$d'.padLeft(2, '0')}';
}

/// Read a scan, or null when it is not a GS1 code with a valid product number.
Gs1? parseGs1(String? raw) {
  var s = (raw ?? '').trim().replaceFirst(RegExp(r'^\][A-Za-z]\d'), '').replaceAll(RegExp(r'<GS>|\{GS\}', caseSensitive: false), _gs);
  final f = <String, String>{};
  if (s.startsWith('(')) {
    for (final m in RegExp(r'\((\d{2,4})\)([^(]*)').allMatches(s)) {
      f[m.group(1)!] = m.group(2)!.replaceAll(_gs, '').trim();
    }
  } else {
    if (!RegExp(r'^0[12]\d{14}').hasMatch(s)) return null;
    while (s.isNotEmpty) {
      if (s.startsWith(_gs)) {
        s = s.substring(1);
        continue;
      }
      final ai2 = s.length >= 2 ? s.substring(0, 2) : s, ai3 = s.length >= 3 ? s.substring(0, 3) : s;
      final fixed = _fixed[ai2];
      if (fixed != null) {
        final end = (2 + fixed).clamp(0, s.length);
        f[ai2] = s.substring(2, end);
        s = s.substring(end);
        continue;
      }
      final ai = _variable.containsKey(ai3) ? ai3 : _variable.containsKey(ai2) ? ai2 : null;
      if (ai == null) break;
      final rest = s.substring(ai.length), end = rest.indexOf(_gs);
      final v = end < 0 ? rest : rest.substring(0, end);
      f[ai] = v.length > _variable[ai]! ? v.substring(0, _variable[ai]!) : v;
      s = end < 0 ? '' : rest.substring(end + 1);
    }
  }
  final gtin = f['01'] ?? f['02'] ?? '';
  if (!gtinValid(gtin)) return null;
  return Gs1(gtin: gtin, expiry: gs1Date(f['17']), batch: f['10'] ?? '', serial: f['21'] ?? '');
}

/// The same product number whatever its length (a GTIN-14 with a leading 0 is the EAN-13 printed on the box).
bool sameGtin(String? a, String? b) {
  final x = (a ?? '').trim(), y = (b ?? '').trim();
  final ok = RegExp(r'^\d{8,14}$');
  return ok.hasMatch(x) && ok.hasMatch(y) && x.padLeft(14, '0') == y.padLeft(14, '0');
}
