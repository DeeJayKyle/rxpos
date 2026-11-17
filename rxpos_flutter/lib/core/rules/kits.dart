// Kits (1.10.0, the React app's src/kits.js): a kit is a `products` record with a `kit` recipe and no stock of its
// own. A kit sale line keeps `kit.components`, each with the batches its stock came from. This app does not sell or
// build kits yet (PARITY.md): it keeps them out of its medicine lists, gives a kit's medicines back on a refund, and
// leaves the correcting of a kit sale to the React app (its lines would lose their contents here).

/// Is this stored product record a kit?
bool isKitRecord(Map<String, Object?> rec) => rec['kit'] is Map;

/// The sale's stored lines, as they were saved (with fields this app does not model, such as `kit`).
List<Map<String, Object?>> rawSaleItems(Map<String, Object?> sale) => [
  for (final x in (sale['items'] is List ? sale['items'] as List : const [])) x is Map ? x.cast<String, Object?>() : <String, Object?>{},
];

/// Does the sale hold a kit line?
bool saleHasKit(Map<String, Object?> sale) => rawSaleItems(sale).any((i) => i['kit'] is Map);

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

/// The stock a kit line moved, as (productId, batchId, qty); null for a line that is not a kit.
List<(String, String?, double)>? kitStockParts(Map<String, Object?> item) {
  final kit = item['kit'];
  if (kit is! Map) return null;
  final comps = kit['components'];
  final out = <(String, String?, double)>[];
  if (comps is! List) return out;
  for (final c in comps) {
    if (c is! Map) continue;
    final id = '${c['id'] ?? ''}';
    if (id.isEmpty) continue;
    final alloc = c['alloc'];
    if (alloc is List && alloc.isNotEmpty) {
      for (final a in alloc) {
        if (a is! Map) continue;
        final b = a['batchId'];
        out.add((id, b == null ? null : '$b', _num(a['qty'])));
      }
    } else {
      out.add((id, null, _num(c['qty'])));
    }
  }
  return out;
}

// ---- Building and selling kits (ported from src/kits.js, field for field) ----

/// The kit icons (lucide names, as the React app stores them) and kit colours (white text reads on each)
const kitIcons = ['test-tube', 'syringe', 'bandage', 'baby', 'heart-pulse', 'pill', 'package', 'stethoscope', 'droplet', 'shield-plus'];
const kitColors = ['#be185d', '#6d28d9', '#1d4ed8', '#0e7490', '#0f766e', '#15803d', '#b45309', '#c2410c', '#b91c1c', '#4338ca'];

/// A kit that is switched on (a kit can be kept but taken off the till)
bool kitActive(Map<String, Object?> rec) => isKitRecord(rec) && rec['active'] != false;

Map<String, Object?> _kitOf(Map<String, Object?> rec) => rec['kit'] is Map ? (rec['kit'] as Map).cast<String, Object?>() : const {};

/// The kit's stock lines (a medicine and a quantity above 0) and its service lines
({List<(String, double)> stock, List<({String name, double price, double cost})> services}) kitParts(Map<String, Object?> kit) {
  final items = kit['items'] is List ? (kit['items'] as List).whereType<Map>() : const <Map>[];
  return (
    stock: [
      for (final x in items)
        if (x['service'] != true && '${x['productId'] ?? ''}'.isNotEmpty && _num(x['qty']) > 0) ('${x['productId']}', _num(x['qty'])),
    ],
    services: [
      for (final x in items)
        if (x['service'] == true && '${x['name'] ?? ''}'.trim().isNotEmpty) (name: '${x['name']}'.trim(), price: _num(x['price']), cost: _num(x['cost'])),
    ],
  );
}

/// The components after this sale's swaps ({productId: substituteId}); quantities of the same medicine add up
List<(String, double)> withSwaps(List<(String, double)> lines, Map<String, String> swaps) {
  final m = <String, double>{};
  for (final (id, q) in lines) {
    final to = swaps[id] ?? id;
    m[to] = (m[to] ?? 0) + q;
  }
  return [for (final e in m.entries) (e.key, e.value)];
}

double _r2(double n) => (n * 100).round() / 100;

/// One medicine in a kit as it is now
class KitComponent {
  const KitComponent({required this.productId, required this.name, required this.missing, required this.qty, required this.have, required this.makes,
      required this.cost, required this.price, required this.wholesale, required this.rx, required this.controlled, required this.expiry, this.swappedFrom = ''});
  final String productId, name, expiry, swappedFrom;
  final bool missing, rx, controlled;
  final double qty, have, cost, price, wholesale;
  final int makes;
}

/// What a kit is right now (src/kits.js kitView). [canMake] is null when the kit has no stock lines.
class KitView {
  const KitView({required this.rec, required this.components, required this.services, required this.canMake, required this.short, required this.cost,
      required this.listPrice, required this.price, required this.wholesale, required this.margin, required this.expiry, required this.rx, required this.controlled});
  final Map<String, Object?> rec;
  final List<KitComponent> components;
  final List<({String name, double price, double cost})> services;
  final int? canMake;
  final List<KitComponent> short;
  final double cost, listPrice, price, wholesale;
  final int? margin;
  final String expiry;
  final bool rx, controlled;
  String get id => '${rec['id']}';
  String get name => '${rec['name'] ?? ''}';
  String get barcode => '${rec['barcode'] ?? ''}';
  Map<String, Object?> get kit => _kitOf(rec);
  String get icon => '${kit['icon'] ?? 'package'}';
  String get color => '${kit['color'] ?? '#be185d'}';
  String get warning => '${kit['warning'] ?? ''}';
  bool get ack => kit['ack'] == true && warning.isNotEmpty;
  /// how many can be sold (a services-only kit: any number)
  double get stock => canMake == null ? 999999 : canMake!.toDouble();
  String get contents => [for (final c in components) '${_q(c.qty)} × ${c.name}', for (final s in services) s.name].join(' · ');
}

String _q(double v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';

/// [byId]: the medicines (id → (name, cost, price, wholesale, rx, controlled, expiry)); [stockOf]: sellable units
KitView kitView(Map<String, Object?> rec, Map<String, ({String name, double cost, double price, double wholesale, bool rx, bool controlled, String expiry})> byId,
    double Function(String id) stockOf, {Map<String, String> swaps = const {}}) {
  final k = _kitOf(rec);
  final parts = kitParts(k);
  final lines = withSwaps(parts.stock, swaps);
  final comps = [
    for (final (id, q) in lines)
      () {
        final p = byId[id];
        final h = stockOf(id);
        return KitComponent(productId: id, name: p?.name ?? 'Missing medicine', missing: p == null, qty: q, have: h, makes: ((h + 1e-9) / q).floor(),
            cost: p?.cost ?? 0, price: p?.price ?? 0, wholesale: (p?.wholesale ?? 0) > 0 ? p!.wholesale : (p?.price ?? 0), rx: p?.rx ?? false,
            controlled: p?.controlled ?? false, expiry: p?.expiry ?? '', swappedFrom: swaps.entries.where((e) => e.value == id).firstOrNull?.key ?? '');
      }(),
  ];
  int? make;
  if (comps.isNotEmpty) {
    make = comps.any((c) => c.missing) ? 0 : comps.map((c) => c.makes).reduce((a, b) => a < b ? a : b);
    if (make < 0) make = 0;
  }
  final serviceCost = parts.services.fold(0.0, (a, s) => a + s.cost), servicePrice = parts.services.fold(0.0, (a, s) => a + s.price);
  final cost = _r2(comps.fold(0.0, (a, c) => a + c.cost * c.qty) + serviceCost);
  final listPrice = _r2(comps.fold(0.0, (a, c) => a + c.price * c.qty) + servicePrice);
  final listWholesale = _r2(comps.fold(0.0, (a, c) => a + c.wholesale * c.qty) + servicePrice);
  final fixed = _num(k['price']), fixedW = _num(k['wholesale']);
  final price = fixed > 0 ? fixed : listPrice;
  final wholesale = fixedW > 0 ? fixedW : fixed > 0 ? fixed : listWholesale;
  final stocked = comps.where((c) => c.have > 0 && c.expiry.isNotEmpty).map((c) => c.expiry).toList()..sort();
  final short = make == null ? <KitComponent>[] : (comps.where((c) => c.makes == make).toList()..sort((a, b) => a.makes - b.makes));
  return KitView(rec: rec, components: comps, services: parts.services, canMake: make, short: short, cost: cost, listPrice: listPrice, price: price,
      wholesale: wholesale, margin: price > 0 ? ((price - cost) / price * 100).round() : null, expiry: stocked.firstOrNull ?? '',
      rx: comps.any((c) => c.rx) || rec['rx'] == true, controlled: comps.any((c) => c.controlled));
}

/// "Lancets running low": the component that limits the kit, in words ('' when nothing limits it)
String kitShortText(KitView v) {
  if (v.canMake == null || v.short.isEmpty) return '';
  final c = v.short.first;
  if (c.missing) return 'a medicine in this kit was deleted';
  return v.canMake == 0 ? 'no ${c.name} (needs ${_q(c.qty)})' : '${c.name} running low (${_q(c.have)} left)';
}

/// The medicines a sale line used up, as (productId, units): a kit line counts its components (reorder levels see the
/// lancets a kit used), a plain line itself
List<(String, double)> unitsUsed(Map<String, Object?> item) {
  final kit = item['kit'];
  if (kit is Map && kit['components'] is List) {
    return [for (final c in (kit['components'] as List).whereType<Map>()) ('${c['id']}', _num(c['qty']))];
  }
  return [('${item['id'] ?? ''}', _num(item['qty']))];
}

/// "Contains 1 × HIV Test Strip, 2 × Blood Lancets, Testing fee · Safety Lancets instead of Blood Lancets" for a
/// receipt ('' for a plain line)
String kitContents(Map<String, Object?> item) {
  final k = item['kit'];
  if (k is! Map || k['components'] is! List) return '';
  final n = _num(item['qty']) > 0 ? _num(item['qty']) : 1;
  final comps = (k['components'] as List).whereType<Map>().toList();
  final parts = [
    for (final c in comps) '${_q(_r2(_num(c['per']) > 0 ? _num(c['per']) : _num(c['qty']) / n))} × ${c['name']}',
    for (final s in (k['services'] is List ? (k['services'] as List).whereType<Map>() : const <Map>[])) '${s['name']}',
  ];
  final swaps = [for (final c in comps) if ('${c['swappedFromName'] ?? ''}'.isNotEmpty) '${c['name']} instead of ${c['swappedFromName']}'];
  return 'Contains ${parts.join(', ')}${swaps.isEmpty ? '' : ' · ${swaps.join(', ')}'}';
}

/// Ready-made kits (as src/kits.js KIT_TEMPLATES): each line is matched to the pharmacy's own medicines by name
const kitTemplates = <({String key, String name, String icon, String color, String warning, bool ack, List<({List<String> find, double qty})> items})>[
  (key: 'hiv', name: 'HIV Test Kit', icon: 'test-tube', color: '#be185d', warning: 'Pre-test counselling first. Give the result in private; refer a reactive result for confirmation.', ack: true,
    items: [(find: ['hiv test', 'hiv strip', 'determine'], qty: 1), (find: ['lancet'], qty: 1), (find: ['alcohol swab', 'swab'], qty: 1), (find: ['water for injection', 'wfi'], qty: 1)]),
  (key: 'malaria', name: 'Malaria RDT Kit', icon: 'droplet', color: '#b91c1c', warning: 'Test before treating: give antimalarials only for a positive result.', ack: false,
    items: [(find: ['malaria rdt', 'malaria test', 'mrdt'], qty: 1), (find: ['lancet'], qty: 1), (find: ['alcohol swab', 'swab'], qty: 1), (find: ['glove'], qty: 2)]),
  (key: 'pregnancy', name: 'Pregnancy Test Kit', icon: 'baby', color: '#6d28d9', warning: 'Explain how to read the result; a faint line counts as positive.', ack: false,
    items: [(find: ['pregnancy test', 'hcg'], qty: 1), (find: ['urine container', 'specimen'], qty: 1)]),
  (key: 'injection', name: 'Injection Set', icon: 'syringe', color: '#1d4ed8', warning: 'Single use: one needle and syringe per patient.', ack: true,
    items: [(find: ['syringe'], qty: 1), (find: ['needle'], qty: 1), (find: ['alcohol swab', 'swab'], qty: 1), (find: ['water for injection', 'wfi'], qty: 1)]),
  (key: 'wound', name: 'Wound Dressing Kit', icon: 'bandage', color: '#0f766e', warning: '', ack: false,
    items: [(find: ['gauze'], qty: 2), (find: ['bandage', 'crepe'], qty: 1), (find: ['plaster', 'strapping'], qty: 1), (find: ['povidone', 'iodine', 'antiseptic'], qty: 1), (find: ['glove'], qty: 2)]),
  (key: 'mama', name: 'Mama Kit', icon: 'heart-pulse', color: '#c2410c', warning: 'For a clean delivery: check every item is sealed.', ack: false,
    items: [(find: ['cotton wool'], qty: 1), (find: ['glove'], qty: 2), (find: ['razor', 'blade'], qty: 1), (find: ['cord tie', 'cord clamp', 'thread'], qty: 1), (find: ['plastic sheet', 'mackintosh'], qty: 1), (find: ['sanitary pad', 'maternity pad', 'pad'], qty: 2), (find: ['soap'], qty: 1)]),
];

String _fold(String s) => s.toLowerCase().replaceAll(RegExp('[^a-z0-9 ]+'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

/// A template's lines matched to the medicines (id, name, generic, in stock): in-stock first, then the shortest name.
/// Lines with no match come back with productId '' and the words searched.
List<({String productId, double qty, String looking})> matchTemplate(List<({List<String> find, double qty})> items, List<({String id, String name, String generic, bool inStock})> meds) =>
    [
      for (final it in items)
        () {
          ({String id, String name, String generic, bool inStock})? best;
          for (final w in it.find) {
            final f = _fold(w);
            final hits = meds.where((p) => _fold('${p.name} ${p.generic}').contains(f)).toList()
              ..sort((a, b) => a.inStock != b.inStock ? (a.inStock ? -1 : 1) : a.name.length - b.name.length);
            if (hits.isNotEmpty) {
              best = hits.first;
              break;
            }
          }
          return (productId: best?.id ?? '', qty: it.qty, looking: it.find.first);
        }(),
    ];
