// Medicine records and stock corrections ported from src/pages/Inventory.jsx: saving a medicine (prices from the
// markups when blank, an internal barcode when none, opening stock as a batch), records that need a look, pack sizes,
// Quick Edit, generating missing barcodes, the inventory editor (details and batches), expired write-offs and the
// stock card's running balance.
import 'dart:math';

import '../../../core/data/record_store.dart';
import '../../../core/entities/movement.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/pricing.dart';
import '../../../core/rules/stock.dart';

class MedicineProblem implements Exception {
  MedicineProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

const sellingUnits = ['Piece', 'Tablet', 'Strip', 'Pack', 'Box', 'Bottle', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Unit'];

/// A new internal barcode: "20" + 10 digits (the in-store range), not used yet.
String newInternalBarcode(Set<String> existing, [Random? rnd]) {
  final r = rnd ?? Random();
  for (;;) {
    final code = '20${(r.nextInt(100000) * 100000 + r.nextInt(100000)).toString().padLeft(10, '0')}';
    if (!existing.contains(code)) return code;
  }
}

/// Barcodes used by more than one medicine.
Set<String> duplicateBarcodes(Iterable<Product> products) {
  final seen = <String>{}, dup = <String>{};
  for (final p in products) {
    if (p.barcode.isNotEmpty && !seen.add(p.barcode)) dup.add(p.barcode);
  }
  return dup;
}

/// Things worth a look in a medicine record (nothing is changed automatically).
List<String> recordIssues(Product p, Set<String> dupBarcodes) => [
      if (!(p.price > 0)) 'No retail price',
      if (p.price > 0 && p.cost > p.price) 'Retail below cost',
      if (!(p.cost > 0)) 'No cost price',
      if (p.form.isEmpty) 'No formulation',
      if (p.unit.isEmpty) 'No selling unit',
      if (p.barcode.isNotEmpty && dupBarcodes.contains(p.barcode)) 'Barcode used twice',
      if (p.name.isNotEmpty && p.name != p.name.trim()) 'Spaces around the name',
    ];

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}'.replaceAll(',', '')) ?? 0;

/// Save a medicine from the Medicine List form. [rec] holds the form's fields (and openingStock / openingBatch /
/// openingExpiry for a new one). Returns the saved record.
Future<Map<String, Object?>> saveMedicine(RecordStore store, Map<String, Object?> rec, {Product? before, required List<Product> all,
    required PharmacySettings settings, required String user, String branchId = mainBranch}) async {
  final name = '${rec['name'] ?? ''}'.trim();
  if (name.isEmpty) throw MedicineProblem('Enter the medicine name');
  if (all.any((x) => x.id != before?.id && !x.isCatalog && x.name.trim().toLowerCase() == name.toLowerCase())) {
    throw MedicineProblem('"$name" is already in your medicine list');
  }
  var code = '${rec['barcode'] ?? ''}'.trim();
  if (code.isNotEmpty && all.any((x) => x.id != before?.id && x.barcode == code)) throw MedicineProblem('Another medicine already has the barcode $code');
  if (code.isEmpty) code = newInternalBarcode({for (final p in all) p.barcode});
  final cost = _n(rec['cost']);
  var price = _n(rec['price']), wholesale = _n(rec['wholesale']);
  if (price <= 0) price = markupPrice(cost, settings.retailMarkup, settings.priceRound);
  if (wholesale <= 0) wholesale = markupPrice(cost, settings.wholesaleMarkup, settings.priceRound);
  final opening = _n(rec['openingStock']);
  final clean = {...rec}..remove('openingStock')..remove('openingBatch')..remove('openingExpiry');
  num out(double v) => v == v.roundToDouble() ? v.toInt() : v;
  final p = {
    ...?before?.raw,
    ...clean,
    'id': before?.id ?? uid(),
    'name': name,
    'barcode': code,
    'cost': out(cost),
    'price': out(price),
    'wholesale': out(wholesale),
    'reorder': out(_n(rec['reorder'])),
    'rx': rec['rx'] == true,
    'controlled': rec['controlled'] == true,
    'chronic': rec['chronic'] == true,
  };
  return store.update((d) async {
    d.put('products', p);
    if (before == null && opening > 0) {
      final b = await d.addBatch(productId: '${p['id']}', batch: '${rec['openingBatch'] ?? ''}', expiry: '${rec['openingExpiry'] ?? ''}', cost: cost);
      d.move(productId: '${p['id']}', qty: opening, type: 'Opening stock', user: user, batchId: b['id'] as String, branchId: branchId);
    }
    if (before != null && (before.price != price || before.cost != cost)) {
      d.audit(user, 'Price changed', '$name: retail ${settings.money(before.price)} → ${settings.money(price)}, cost ${settings.money(before.cost)} → ${settings.money(cost)}', branchId);
    }
    if (before == null) d.audit(user, 'Medicine added', name, branchId);
    return p;
  });
}

/// A pack row as typed: name, units in it, price (null = unit price × size).
typedef PackRow = ({String name, String size, String price});

/// Save a medicine's pack sizes (rows with a name and more than one unit; names must differ).
Future<List<Map<String, Object?>>> savePacks(RecordStore store, Product product, List<PackRow> rows, {required String user, String branchId = mainBranch}) async {
  final packs = [
    for (final k in rows)
      if (k.name.trim().isNotEmpty && _n(k.size) > 1)
        <String, Object?>{'name': k.name.trim(), 'size': _n(k.size).round(), 'price': k.price.trim().isEmpty || _n(k.price) <= 0 ? null : _n(k.price)},
  ];
  if ({for (final k in packs) '${k['name']}'.toLowerCase()}.length != packs.length) throw MedicineProblem('Each pack needs its own name');
  final unit = product.unit.isEmpty ? 'Unit' : product.unit;
  await store.update((d) {
    d.put('products', {...product.toRecord(), 'packs': packs});
    d.audit(user, 'Pack sizes changed', '${product.name}: ${packs.isEmpty ? 'none' : packs.map((k) => '${k['name']} = ${k['size']} $unit').join(', ')}', branchId);
  });
  return packs;
}

/// Quick Edit: save many medicines' prices, reorder levels, shelf and barcodes at once; price changes are audited.
Future<int> quickEdit(RecordStore store, Map<String, Product> byId, Map<String, Map<String, String>> edits,
    {required PharmacySettings settings, required String user, String branchId = mainBranch}) async {
  const numeric = {'cost', 'wholesale', 'price', 'reorder'};
  await store.update((d) {
    final changes = <String>[];
    for (final e in edits.entries) {
      final p = byId[e.key];
      if (p == null) continue;
      final clean = {for (final f in e.value.entries) f.key: numeric.contains(f.key) ? _n(f.value) : f.value.trim()};
      d.put('products', {...p.toRecord(), ...clean});
      if (clean.containsKey('price') && clean['price'] != p.price) changes.add('${p.name}: ${settings.money(p.price)} → ${settings.money(clean['price']! as num)}');
    }
    if (changes.isNotEmpty) {
      final text = changes.join('; ');
      d.audit(user, 'Price changed (quick edit)', text.length > 1000 ? text.substring(0, 1000) : text, branchId);
    }
  });
  return edits.length;
}

/// Give every medicine without a barcode an internal one. Returns how many were made.
Future<int> fillBarcodes(RecordStore store, List<Product> products) async {
  final used = {for (final p in products) if (p.barcode.isNotEmpty) p.barcode};
  final missing = products.where((p) => p.barcode.isEmpty).toList();
  if (missing.isEmpty) return 0;
  await store.update((d) {
    for (final p in missing) {
      final code = newInternalBarcode(used);
      used.add(code);
      d.put('products', {...p.toRecord(), 'barcode': code});
    }
  });
  return missing.length;
}

/// A batch row in the inventory editor.
class BatchEdit {
  const BatchEdit(this.b, {required this.batch, required this.expiry, required this.qty});
  final BatchStock b;
  final String batch, expiry;
  final double qty;
}

/// The inventory editor: a medicine's details and its batches here (number, expiry, actual quantity).
Future<void> inventoryEdit(RecordStore store, Product product, Map<String, Object?> details, List<BatchEdit> rows,
    {required String reason, required PharmacySettings settings, required String user, String branchId = mainBranch}) async {
  final qtyChanges = rows.where((r) => r.qty.roundToDouble() != r.b.qty).toList();
  if (qtyChanges.isNotEmpty && reason.trim().isEmpty) throw MedicineProblem('Give a reason for the quantity change');
  await store.update((d) async {
    final next = {...product.toRecord(), ...details, for (final k in ['cost', 'wholesale', 'price', 'reorder']) if (details.containsKey(k)) k: _n(details[k])};
    d.put('products', next);
    if (next['price'] != product.price) {
      d.audit(user, 'Price changed', '${product.name}: ${settings.money(product.price)} → ${settings.money(next['price']! as num)} (inventory edit)', branchId);
    }
    final batches = {for (final b in await store.rows('batches')) '${b['id']}': b};
    for (final r in rows) {
      if (!r.b.legacy && (r.batch != r.b.batch || r.expiry != r.b.expiry)) {
        final b = batches[r.b.id];
        if (b != null) d.put('batches', {...b, 'batch': r.batch.trim().isEmpty ? b['batch'] : r.batch.trim(), 'expiry': r.expiry});
      }
      final diff = r.qty.roundToDouble() - r.b.qty;
      if (diff != 0) d.move(productId: product.id, qty: diff, type: 'Inventory edit', note: reason.trim(), user: user, batchId: r.b.legacy ? null : r.b.id, branchId: branchId);
    }
    d.audit(user, 'Inventory edited',
        '${next['name']}${qtyChanges.isEmpty ? '' : ': ${qtyChanges.map((r) => '${r.b.batch} ${formatQty(r.b.qty)}→${formatQty(r.qty)}').join(', ')} (${reason.trim()})'}', branchId);
  });
}

/// Write off an expired batch: all of it leaves stock, and the audit log says what it was worth.
Future<void> writeOffBatch(RecordStore store, Product p, BatchStock b, {required PharmacySettings settings, required String user, String branchId = mainBranch}) =>
    store.update((d) {
      d.move(productId: p.id, qty: -b.qty, type: 'Expired write-off', ref: b.batch, user: user, batchId: b.legacy ? null : b.id, branchId: branchId);
      d.audit(user, 'Expired write-off', '${p.name} batch ${b.batch}: ${formatQty(b.qty)} units (${settings.money(b.qty * (b.cost != 0 ? b.cost : p.cost))})', branchId);
    });

/// A medicine's movements at a branch, oldest first, each with the balance after it.
List<(Movement, double)> stockCard(Iterable<Movement> moves, String productId, String branch) {
  final list = moves.where((m) => m.productId == productId && (m.branchId.isEmpty ? mainBranch : m.branchId) == branch).toList()
    ..sort((a, b) => a.date.compareTo(b.date));
  var bal = 0.0;
  return [for (final m in list) (m, bal += m.qty)];
}

/// Put medicines on a shelf (or take them off one with ''): writes each medicine's "Shelf / location" (the React
/// app's `shelf` field) and notes it in the audit log. [what] says what was moved (e.g. "Antimalarials"). Returns how
/// many changed.
Future<int> assignShelf(RecordStore store, Iterable<Product> products, String shelf, {String what = '', required String user, String branchId = mainBranch}) async {
  final to = shelf.trim();
  final change = [for (final p in products) if ('${p.raw['shelf'] ?? ''}'.trim() != to) p];
  if (change.isEmpty) return 0;
  await store.update((d) {
    for (final p in change) {
      d.put('products', {...p.toRecord(), 'shelf': to});
    }
    final names = what.isNotEmpty ? what : change.length <= 5 ? change.map((p) => p.name).join(', ') : '${change.length} medicines';
    d.audit(user, 'Shelf assigned', to.isEmpty ? '$names: taken off their shelf' : '$names → shelf $to', branchId);
  });
  return change.length;
}
