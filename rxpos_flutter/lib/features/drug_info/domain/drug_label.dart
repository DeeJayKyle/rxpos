// Drug label lookup (src/druglabel.js): the U.S. FDA drug label database (openFDA, public domain). One request
// searches generic, substance and brand names at once; answers are kept in memory and on the device for 30 days, a
// lookup already on its way is shared, and a medicine the database doesn't know is remembered for a day. Each attempt
// times out after 8 s; network errors and busy servers get one retry; a saved copy is shown when the network can't help.
import 'dart:async';

const drugSections = [
  ('indications_and_usage', 'Uses'),
  ('dosage_and_administration', 'Dosage & administration'),
  ('contraindications', 'Do not use when'),
  ('warnings_and_cautions', 'Warnings & precautions'),
  ('warnings', 'Warnings'),
  ('boxed_warning', 'Boxed warning'),
  ('adverse_reactions', 'Side effects'),
  ('drug_interactions', 'Interactions'),
  ('pregnancy', 'Pregnancy'),
  ('pediatric_use', 'Children'),
  ('geriatric_use', 'Elderly'),
  ('overdosage', 'Overdose'),
  ('storage_and_handling', 'Storage'),
  ('how_supplied', 'How supplied'),
];
const freshFor = Duration(days: 30), missFor = Duration(days: 1);
const _api = 'https://api.fda.gov/drug/label.json';
const _fields = ['openfda.generic_name', 'openfda.substance_name', 'openfda.brand_name'];

/// "Amoxicillin 500mg Capsules" → "amoxicillin" (first ingredient words, no strengths or forms).
String genericKey(String? text) {
  var s = (text ?? '').toLowerCase().replaceAll(RegExp(r'\(.*?\)'), ' ');
  s = s.replaceAll(RegExp(r'\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?)\b'), ' ');
  s = s.replaceAll(RegExp(r'\b(tabs?|tablets?|caps?|capsules?|syrup|suspension|susp|inj|injection|cream|ointment|gel|drops?|eye|ear|sachet|vial|amp|ampoule|bottle|pack|strip|x\d+|forte|ds|plus)\b'), ' ');
  s = s.split(RegExp(r'[/+,&]| and ')).first;
  return s.replaceAll(RegExp(r'[^a-z\s-]'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
}

/// The names worth trying, best first: the generic, then the brand name.
List<String> lookupKeys(String? name, String? generic) => {genericKey(generic), genericKey(name)}.where((k) => k.length >= 3).toList();

String _clip(Object? s, [int n = 900]) {
  final t = '${s ?? ''}'.replaceAll(RegExp(r'\s+'), ' ').trim();
  return t.length > n ? '${t.substring(0, n).replaceFirst(RegExp(r'\s\S*$'), '')} …' : t;
}

String labelUrl(String key) => '$_api?search=${_fields.map((f) => '$f:"${Uri.encodeComponent(key.replaceAll('"', ''))}"').join('+')}&limit=5';

List<String> _names(Map doc, String f) => [for (final x in ((doc['openfda'] as Map?)?[f] as List?) ?? const []) '$x'.toLowerCase()];

Map? pickBest(List<Map> results, String key) {
  final k = key.toLowerCase();
  return results.where((d) => _names(d, 'generic_name').contains(k) || _names(d, 'substance_name').contains(k)).firstOrNull ??
      results.where((d) => _names(d, 'brand_name').contains(k)).firstOrNull ??
      results.where((d) => _names(d, 'generic_name').any((g) => g.contains(k))).firstOrNull ??
      results.firstOrNull;
}

/// The part of a label RxPOS keeps.
Map<String, Object?> toInfo(Map doc, String key, String fetchedAt) {
  final o = (doc['openfda'] as Map?) ?? const {};
  String? first(String f) => (o[f] as List?)?.isNotEmpty == true ? '${(o[f] as List).first}' : null;
  return {
    'key': key,
    'fetchedAt': fetchedAt,
    'title': [first('generic_name'), if (first('brand_name') != null) '(${first('brand_name')})'].whereType<String>().join(' '),
    'route': ((o['route'] as List?) ?? const []).join(', '),
    'form': first('dosage_form') ?? '',
    'sections': [
      for (final (k, label) in drugSections)
        if ((doc[k] as List?)?.isNotEmpty == true && _clip((doc[k] as List).first).isNotEmpty) [label, _clip((doc[k] as List).first)],
    ],
    'source': 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${Uri.encodeComponent(key)}',
  };
}

class LookupError implements Exception {
  LookupError(this.message, {this.retry = false});
  final String message;
  final bool retry;
  @override
  String toString() => message;
}

/// What the network said: status code and the decoded JSON body.
typedef Fetch = Future<(int, Object?)> Function(String url, Duration timeout);

class DrugLookup {
  DrugLookup({required this.fetch, required this.get, required this.set, DateTime Function()? now, this.retries = 1, this.backoff = const Duration(milliseconds: 700)})
      : _now = now ?? DateTime.now;
  final Fetch fetch;
  final Future<Object?> Function(String key) get;
  final Future<void> Function(String key, Object? value) set;
  final DateTime Function() _now;
  final int retries;
  final Duration backoff;
  final _mem = <String, Map<String, Object?>>{}; // key → {info} | {miss, at}
  final _inflight = <String, Future<Map<String, Object?>?>>{};

  Future<List<Map>> _attempt(String url) async {
    final (int, Object?) r;
    try {
      r = await fetch(url, const Duration(seconds: 8));
    } on TimeoutException {
      throw LookupError('The drug database took too long to answer.', retry: true);
    } on LookupError {
      rethrow;
    } catch (_) {
      throw LookupError('Could not reach the drug database. Check the internet connection.', retry: true);
    }
    final (status, body) = r;
    if (status == 404) return const [];
    if (status == 429 || status >= 500) throw LookupError('The drug database is busy ($status).', retry: true);
    if (status < 200 || status >= 300) throw LookupError('The drug database answered $status.');
    return [for (final x in ((body as Map?)?['results'] as List?) ?? const []) x as Map];
  }

  Future<Map<String, Object?>?> _fromNetwork(String key) async {
    for (var i = 0;; i++) {
      try {
        final doc = pickBest(await _attempt(labelUrl(key)), key);
        return doc == null ? null : toInfo(doc, key, _now().toUtc().toIso8601String());
      } on LookupError catch (e) {
        if (!e.retry || i >= retries) rethrow;
        await Future<void>.delayed(backoff * (i + 1));
      }
    }
  }

  bool _fresh(Map info) => _now().difference(DateTime.tryParse('${info['fetchedAt']}') ?? DateTime(2000)) < freshFor;

  /// What is already known without the network: (info, fresh) or a recent miss, else null.
  Future<({Map<String, Object?>? info, bool fresh, bool miss})?> saved(String key) async {
    final m = _mem[key];
    if (m != null) {
      if (m['miss'] == true) return _now().difference(m['at']! as DateTime) < missFor ? (info: null, fresh: false, miss: true) : null;
      final info = m['info']! as Map<String, Object?>;
      return (info: info, fresh: _fresh(info), miss: false);
    }
    try {
      final stored = await get('drug:$key');
      if (stored is Map && stored['sections'] != null) {
        final info = stored.cast<String, Object?>();
        _mem[key] = {'info': info};
        return (info: info, fresh: _fresh(info), miss: false);
      }
      final miss = await get('drug-miss:$key');
      final at = DateTime.tryParse('${miss ?? ''}');
      if (at != null && _now().difference(at) < missFor) {
        _mem[key] = {'miss': true, 'at': at};
        return (info: null, fresh: false, miss: true);
      }
    } catch (_) {
      // storage unreadable: ask the network
    }
    return null;
  }

  /// Ask the network (sharing a request already on its way) and remember the answer.
  Future<Map<String, Object?>?> refresh(String key) => _inflight[key] ??= _fromNetwork(key).then((info) async {
        if (info != null) {
          _mem[key] = {'info': info};
          await set('drug:$key', info).catchError((Object _) {});
        } else {
          final at = _now();
          _mem[key] = {'miss': true, 'at': at};
          await set('drug-miss:$key', at.toUtc().toIso8601String()).catchError((Object _) {});
        }
        return info;
      }).whenComplete(() => _inflight.remove(key));

  Map<String, Object?>? peek(String key) => _mem[key]?['info'] as Map<String, Object?>?;
}

/// Clinical references that can't be copied into the app.
List<(String, String)> drugReferences(String q) {
  final e = Uri.encodeComponent(q);
  return [
    ('Medscape', 'https://search.medscape.com/reference-search?queryText=$e'),
    ('Drugs.com', 'https://www.drugs.com/search.php?searchterm=$e'),
    ('BNF (NICE)', 'https://bnf.nice.org.uk/search/?q=$e'),
    ('DailyMed (US labels)', 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=$e'),
    ('MedlinePlus (patients)', 'https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&query=$e'),
    ('WHO Essential Medicines', 'https://list.essentialmeds.org/?query=$e'),
    ('Uganda Clinical Guidelines', 'https://www.health.go.ug/cause/uganda-clinical-guidelines-2023/'),
  ];
}
