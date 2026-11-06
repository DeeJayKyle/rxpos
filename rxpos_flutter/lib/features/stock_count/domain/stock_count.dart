// Stock take, ported from src/pages/StockCount.jsx with the same records, so a count can be started on one app and
// finished on the other.
//
// A count is a `stockCounts` record (what is counted, at which branch) plus one `countItems` record per medicine
// counted (id "<countId>:<productId>"), so several people can count different shelves at once without overwriting
// each other. Each counted batch keeps the system quantity at the moment it was counted ([CountLine.sys]); posting
// books counted − system-then as a "Stock count" movement, so sales made while counting are not lost.
import 'dart:math';

import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/stock.dart';

String countItemId(String countId, String productId) => '$countId:$productId';

double _n(Object? v, [double d = 0]) => v is num ? v.toDouble() : (double.tryParse('${v ?? ''}') ?? d);

/// One batch line of a counted medicine. [skipped]: left blank (not counted: keeps its system quantity).
/// [found]: a batch on the shelf that RxPOS did not know ([batchId] null).
class CountLine {
  const CountLine({required this.key, this.batchId, required this.batch, this.expiry = '', this.cost = 0, required this.sys, required this.qty, this.skipped = false, this.found = false});
  final String key;
  final String? batchId;
  final String batch, expiry;
  final double cost, sys, qty;
  final bool skipped, found;
  double get diff => qty - sys;

  Map<String, Object?> toJson() => {
        'key': key, 'batchId': batchId, 'batch': batch, 'expiry': expiry, 'cost': cost, 'sys': sys, 'qty': qty,
        if (skipped) 'skipped': true, if (found) 'found': true,
      };
  factory CountLine.fromJson(Map<String, Object?> j) => CountLine(
      key: '${j['key'] ?? j['batchId'] ?? j['batch'] ?? ''}', batchId: j['batchId'] as String?, batch: '${j['batch'] ?? ''}', expiry: '${j['expiry'] ?? ''}',
      cost: _n(j['cost']), sys: _n(j['sys']), qty: _n(j['qty']), skipped: j['skipped'] == true, found: j['found'] == true);
}

/// A counted medicine (a countItems record).
class CountItem {
  const CountItem({required this.productId, required this.lines, required this.by, this.at = ''});
  final String productId, by, at;
  final List<CountLine> lines;
  factory CountItem.fromRecord(Map<String, Object?> r) => CountItem(productId: '${r['productId']}', by: '${r['by'] ?? ''}', at: '${r['at'] ?? ''}',
      lines: [for (final l in ((r['lines'] as List?) ?? const []).cast<Map>()) CountLine.fromJson(l.cast<String, Object?>())]);
}

/// The value of a line's difference (its cost, else the medicine's).
double lineValue(CountLine l, Product? p) => l.diff * (l.cost != 0 ? l.cost : (p?.cost ?? 0));

class CountSummary {
  const CountSummary({this.counted = 0, this.matched = 0, this.short = 0, this.over = 0, this.shortValue = 0, this.overValue = 0, this.scope = 0, this.zeroed = 0, this.netValue});
  final int counted, matched, short, over, scope, zeroed;
  final double shortValue, overValue;
  /// the net change when it differs from overValue − shortValue (uncounted batches set to 0)
  final double? netValue;
  double get net => netValue ?? overValue - shortValue;
  Map<String, Object?> toJson() => {'counted': counted, 'matched': matched, 'short': short, 'over': over, 'shortValue': shortValue, 'overValue': overValue,
    'net': net, 'scope': scope, if (zeroed > 0) 'zeroed': zeroed};
  factory CountSummary.fromJson(Map<String, Object?> j) => CountSummary(counted: _n(j['counted']).round(), matched: _n(j['matched']).round(), short: _n(j['short']).round(),
      over: _n(j['over']).round(), shortValue: _n(j['shortValue']), overValue: _n(j['overValue']), scope: _n(j['scope']).round(), zeroed: _n(j['zeroed']).round(), netValue: _n(j['net']));
}

CountSummary summarise(int scope, Iterable<CountItem> items, Map<String, Product> byId) {
  var counted = 0, matched = 0, short = 0, over = 0;
  var shortValue = 0.0, overValue = 0.0;
  for (final it in items) {
    counted++;
    final p = byId[it.productId];
    final d = it.lines.fold<double>(0, (a, l) => a + l.diff), v = it.lines.fold<double>(0, (a, l) => a + lineValue(l, p));
    if (it.lines.every((l) => l.diff == 0)) {
      matched++;
    } else if (d < 0 || v < 0) {
      short++;
    } else {
      over++;
    }
    for (final l in it.lines) {
      final x = lineValue(l, p);
      if (x < 0) {
        shortValue += -x;
      } else {
        overValue += x;
      }
    }
  }
  return CountSummary(counted: counted, matched: matched, short: short, over: over, shortValue: shortValue, overValue: overValue, scope: scope);
}

/// What a new count covers.
enum CountScope { all, shelf, form, expiring, value, random, empty }

String shelfOf(Product p) => '${p.raw['shelf'] ?? ''}'.trim();

/// The medicines a new count covers, in shelf order (random stays random), and its label.
({List<Product> list, String label}) countScope(CountScope scope, List<Product> stocked, List<BatchStock> Function(String) batchesOf,
    {String shelf = '', String form = '', int size = 20, int warn = 90, Random? rnd, DateTime? now}) {
  double value(Product p) => batchesOf(p.id).fold<double>(0, (a, b) => a + (b.qty > 0 ? b.qty : 0) * (b.cost != 0 ? b.cost : p.cost));
  final n = size < 1 ? 1 : size;
  final list = switch (scope) {
    CountScope.shelf => stocked.where((p) => shelfOf(p) == shelf).toList(),
    CountScope.form => stocked.where((p) => p.form == form).toList(),
    CountScope.expiring => stocked.where((p) => batchesOf(p.id).any((b) => b.qty > 0 && b.expiry.isNotEmpty && daysUntil(b.expiry, now: now) <= warn)).toList(),
    CountScope.value => ([...stocked]..sort((a, b) => value(b).compareTo(value(a)))).take(n).toList(),
    CountScope.random => ([...stocked]..shuffle(rnd)).take(n).toList(),
    CountScope.empty => <Product>[],
    CountScope.all => stocked,
  };
  int byShelf(Product a, Product b) {
    final c = (shelfOf(a).isEmpty ? '~' : shelfOf(a)).compareTo(shelfOf(b).isEmpty ? '~' : shelfOf(b));
    return c != 0 ? c : a.name.compareTo(b.name);
  }

  final label = switch (scope) {
    CountScope.all => 'All medicines in stock', CountScope.shelf => 'Shelf $shelf', CountScope.form => form, CountScope.expiring => 'Expiring within $warn days',
    CountScope.value => 'Top $n by value', CountScope.random => 'Spot check of $n', CountScope.empty => 'Scan as you go',
  };
  return (list: scope == CountScope.random ? list : ([...list]..sort(byShelf)), label: label);
}

class CountProblem implements Exception {
  CountProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

Future<Map<String, Object?>> startCount(RecordStore store, {required String name, required CountScope scope, required String label,
    required List<String> productIds, required String user, bool blind = true, String branchId = mainBranch}) {
  if (scope != CountScope.empty && productIds.isEmpty) throw CountProblem('Nothing to count in that choice');
  return store.update((d) {
    final rec = d.put('stockCounts', {
      'id': uid(), 'number': 'SC${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase().substring(2)}',
      'name': name.trim().isEmpty ? 'Stock count' : name.trim(), 'date': d.now, 'branchId': branchId, 'scope': scope.name, 'scopeLabel': label,
      'productIds': productIds, 'blind': blind, 'status': 'open', 'startedBy': user, 'startedAt': d.now,
    });
    d.audit(user, 'Stock count started', '${rec['name']} ($label, ${productIds.length} items)', branchId);
    return rec;
  });
}

/// A medicine not on the count's list yet (scanned or searched while counting).
Future<void> addToCount(RecordStore store, Map<String, Object?> count, String productId) async {
  final ids = ((count['productIds'] as List?) ?? const []).cast<String>();
  if (ids.contains(productId)) return;
  await store.update((d) async {
    final cur = await store.get('stockCounts', count['id'] as String) ?? count;
    final now = ((cur['productIds'] as List?) ?? const []).cast<String>();
    if (!now.contains(productId)) d.put('stockCounts', {...cur, 'productIds': [...now, productId]});
  });
}

/// The batch lines shown for a medicine on the count: every system batch here (with what was saved for it), plus
/// batches found on the shelf.
List<({String key, String? batchId, String batch, String expiry, double cost, double sysNow, CountLine? saved})> countRows(Product p, List<BatchStock> batches, CountItem? item) {
  final out = [
    for (final b in batches.where((b) => b.qty != 0))
      (key: b.id, batchId: b.id as String?, batch: b.batch, expiry: b.expiry, cost: b.cost != 0 ? b.cost : p.cost, sysNow: b.qty,
        saved: item?.lines.where((l) => l.batchId == b.id).firstOrNull),
  ];
  for (final l in item?.lines ?? const <CountLine>[]) {
    if (!out.any((o) => l.batchId != null && o.batchId == l.batchId)) out.add((key: l.key, batchId: l.batchId, batch: l.batch, expiry: l.expiry, cost: l.cost, sysNow: 0, saved: l));
  }
  return out;
}

/// Save what was typed for a medicine ([typed]: line key → text; blank = not counted). All blank (and nothing found)
/// clears the medicine's count. A batch counted now records the system quantity now; one already counted with the
/// same figure keeps what it had then.
Future<void> saveCount(RecordStore store, {required Map<String, Object?> count, required Product product, required List<BatchStock> batches,
    required CountItem? item, required Map<String, String> typed, List<CountLine> extra = const [], required String by, String branchId = mainBranch}) async {
  final rows = countRows(product, batches, item);
  String valOf(String key, CountLine? saved) => typed[key] ?? (saved == null || saved.skipped ? '' : _fmt(saved.qty));
  if (extra.isEmpty && rows.every((r) => valOf(r.key, r.saved).trim().isEmpty)) {
    if (item != null) await store.update((d) => d.del('countItems', countItemId(count['id'] as String, product.id)));
    return;
  }
  final lines = [
    for (final r in rows)
      () {
        final t = valOf(r.key, r.saved).trim();
        final skipped = t.isEmpty;
        final qty = skipped ? r.sysNow : max(0, _n(t).round()).toDouble();
        final before = item?.lines.where((x) => (x.batchId != null && x.batchId == r.batchId) || (x.batchId == null && x.key == r.key)).firstOrNull;
        final sysAt = before != null && !before.skipped && !skipped && before.qty == qty ? before.sys : r.sysNow;
        return CountLine(key: r.key, batchId: r.batchId, batch: r.batch, expiry: r.expiry, cost: r.cost, sys: sysAt, qty: qty, skipped: skipped,
            found: r.saved?.found ?? false);
      }(),
    ...extra,
  ];
  await _put(store, count, product, lines, by, branchId);
}

Future<void> _put(RecordStore store, Map<String, Object?> count, Product p, List<CountLine> lines, String by, String branchId) =>
    store.update((d) => d.put('countItems', {
          'id': countItemId(count['id'] as String, p.id), 'countId': count['id'], 'productId': p.id, 'name': p.name, 'branchId': branchId,
          'lines': [for (final l in lines) l.toJson()], 'total': lines.fold<double>(0, (a, l) => a + l.qty), 'by': by, 'at': d.now,
        }));

String _fmt(double v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';

/// A batch found on the shelf that RxPOS did not know (the expiry on the pack is needed).
CountLine foundBatch({required String batch, required String expiry, required double qty, required double cost}) {
  if (expiry.trim().isEmpty) throw CountProblem('Enter the expiry date on the pack');
  return CountLine(key: 'found-${uid()}', batch: batch.trim(), expiry: expiry.trim(), cost: cost, sys: 0, qty: qty < 0 ? 0 : qty.roundToDouble(), found: true);
}

/// Scan & count: one more pack of this medicine, on its earliest-expiry batch. Returns what to show.
Future<String> tallyOne(RecordStore store, {required Map<String, Object?> count, required Product p, required List<BatchStock> batches, required CountItem? item,
    required String by, String branchId = mainBranch}) async {
  final bs = batches.where((b) => b.qty != 0).toList();
  if (bs.isEmpty) return '${p.name}: no batch recorded here. Add the batch you find on its card';
  final lines = <CountLine>[];
  for (var i = 0; i < bs.length; i++) {
    final b = bs[i];
    final saved = item?.lines.where((l) => l.batchId == b.id).firstOrNull;
    final cost = b.cost != 0 ? b.cost : p.cost;
    if (i > 0) {
      lines.add(saved ?? CountLine(key: b.id, batchId: b.id, batch: b.batch, expiry: b.expiry, cost: cost, sys: b.qty, qty: b.qty, skipped: true));
      continue;
    }
    final counted = saved != null && !saved.skipped ? saved.qty : 0.0;
    lines.add(CountLine(key: b.id, batchId: b.id, batch: b.batch, expiry: b.expiry, cost: cost, sys: saved != null && !saved.skipped ? saved.sys : b.qty, qty: counted + 1));
  }
  for (final l in item?.lines ?? const <CountLine>[]) {
    if (!lines.any((x) => x.batchId != null && x.batchId == l.batchId)) lines.add(l);
  }
  await _put(store, count, p, lines, by, branchId);
  return '${p.name}: ${_fmt(lines.first.qty)} counted (batch ${lines.first.batch})';
}

Future<void> clearCount(RecordStore store, Map<String, Object?> count, String productId) => store.update((d) => d.del('countItems', countItemId(count['id'] as String, productId)));

Future<void> cancelCount(RecordStore store, Map<String, Object?> count, CountSummary sum, {required String user, String branchId = mainBranch}) => store.update((d) {
      d.put('stockCounts', {...count, 'status': 'cancelled', 'postedBy': user, 'postedAt': d.now, 'summary': sum.toJson()});
      d.audit(user, 'Stock count cancelled', '${count['name']}', branchId);
    });

/// A difference to post (one batch line).
typedef DiffRow = ({Product p, CountLine l, String by});

List<DiffRow> differences(Iterable<CountItem> items, Map<String, Product> byId) {
  final out = <DiffRow>[
    for (final it in items)
      if (byId[it.productId] case final p?)
        for (final l in it.lines)
          if (l.diff != 0) (p: p, l: l, by: it.by),
  ];
  out.sort((a, b) => lineValue(a.l, a.p).compareTo(lineValue(b.l, b.p)));
  return out;
}

/// Batches with stock of the medicines on the list nobody counted (to set to 0 when not found).
List<({Product p, BatchStock b})> zeroable(List<Product> all, Iterable<CountItem> items, List<BatchStock> Function(String) batchesOf) {
  final counted = {for (final i in items) i.productId};
  return [for (final p in all.where((p) => !counted.contains(p.id))) for (final b in batchesOf(p.id).where((b) => b.qty > 0)) (p: p, b: b)];
}

/// Post the count: stock becomes what was counted. Returns the summary saved on the count.
Future<CountSummary> postCount(RecordStore store, {required Map<String, Object?> count, required List<DiffRow> diffs, required CountSummary sum,
    List<({Product p, BatchStock b})> zero = const [], required PharmacySettings settings, required String user, String branchId = mainBranch}) {
  final zeroValue = zero.fold<double>(0, (a, z) => a - z.b.qty * (z.b.cost != 0 ? z.b.cost : z.p.cost));
  final summary = CountSummary(counted: sum.counted, matched: sum.matched, short: sum.short, over: sum.over, shortValue: sum.shortValue - zeroValue,
      overValue: sum.overValue, scope: sum.scope, zeroed: zero.length, netValue: sum.net + zeroValue);
  return store.update((d) async {
    final ref = '${count['number'] ?? count['name']}';
    for (final r in diffs) {
      var batchId = r.l.batchId != null && !r.l.batchId!.startsWith('lb-') ? r.l.batchId : null;
      if (r.l.batchId == null && r.l.found) {
        batchId = (await d.addBatch(productId: r.p.id, batch: r.l.batch, expiry: r.l.expiry, cost: r.l.cost != 0 ? r.l.cost : r.p.cost))['id'] as String;
      }
      d.move(productId: r.p.id, qty: r.l.diff, type: 'Stock count', ref: ref, note: '${count['name']}', user: user, batchId: batchId, branchId: branchId);
    }
    for (final z in zero) {
      d.move(productId: z.p.id, qty: -z.b.qty, type: 'Stock count', ref: ref, note: '${count['name']} (not found)', user: user, batchId: z.b.legacy ? null : z.b.id, branchId: branchId);
    }
    d.put('stockCounts', {...count, 'status': 'posted', 'postedBy': user, 'postedAt': d.now, 'postedOn': today(), 'summary': summary.toJson()});
    d.audit(user, 'Stock count posted',
        '${count['name']}: ${sum.counted} counted, ${sum.matched} matched, ${sum.short} short (${settings.money(summary.shortValue)}), ${sum.over} extra (${settings.money(sum.overValue)})${zero.isNotEmpty ? ', ${zero.length} uncounted batches set to 0' : ''}',
        branchId);
    return summary;
  });
}

/// Correct a posted count (stock.adjust): [counted] is line key → the quantity that should have been counted. Each
/// change books the difference as a "Stock count" movement on that batch (note "… corrected: reason"), the medicine's
/// count and the count's totals are updated, and the audit log keeps what changed and why. Stock sold since can't be
/// taken back: a correction never takes a batch below 0.
Future<CountSummary> correctPostedCount(RecordStore store, {required Map<String, Object?> count, required CountItem item, required Map<String, double> counted,
    required String reason, required Map<String, Product> byId, required List<BatchStock> batchesNow, required PharmacySettings settings, required String user,
    String branchId = mainBranch}) async {
  if (count['status'] != 'posted') throw CountProblem('Only a posted count can be corrected');
  if (reason.trim().isEmpty) throw CountProblem('Say why the count is being corrected');
  final p = byId[item.productId];
  if (p == null) throw CountProblem('That medicine is no longer in the list');
  final allBatches = await store.rows('batches');
  String? batchOf(CountLine l) => l.batchId != null && !l.batchId!.startsWith('lb-')
      ? l.batchId
      : allBatches.where((b) => b['productId'] == p.id && b['batch'] == l.batch && (b['expiry'] ?? '') == l.expiry).firstOrNull?['id'] as String?;
  final changes = <({CountLine l, double qty, String? batchId})>[];
  for (final l in item.lines) {
    final want = counted[l.key];
    if (want == null) continue;
    final qty = max(0, want.round()).toDouble();
    if (qty == l.qty) continue;
    final batchId = batchOf(l);
    final have = batchesNow.where((b) => b.id == batchId).firstOrNull?.qty ?? 0;
    if (have + qty - l.qty < 0) {
      throw CountProblem('${p.name}, batch ${l.batch.isEmpty ? '—' : l.batch}: only ${_fmt(have)} left now, so the count can\'t go down by ${_fmt(l.qty - qty)}');
    }
    changes.add((l: l, qty: qty, batchId: batchId));
  }
  final old = count['summary'] is Map ? CountSummary.fromJson((count['summary'] as Map).cast<String, Object?>()) : null;
  if (changes.isEmpty) return old ?? const CountSummary();
  final rows = await store.rows('countItems');
  final items = [for (final r in rows.where((r) => r['countId'] == count['id'])) CountItem.fromRecord(r)];
  final scope = ((count['productIds'] as List?) ?? const []).length;
  final before = summarise(scope, items, byId);
  final lines = [for (final l in item.lines) () {
    final c = changes.where((x) => x.l.key == l.key).firstOrNull;
    return c == null ? l : CountLine(key: l.key, batchId: l.batchId, batch: l.batch, expiry: l.expiry, cost: l.cost, sys: l.sys, qty: c.qty, skipped: false, found: l.found);
  }()];
  final fixed = CountItem(productId: item.productId, lines: lines, by: item.by, at: item.at);
  final after = summarise(scope, [for (final i in items) i.productId == item.productId ? fixed : i], byId);
  // what posting set to 0 (uncounted batches) stays as it was
  final zeroValue = old == null ? 0.0 : old.net - before.net, zeroShort = old == null ? 0.0 : old.shortValue - before.shortValue;
  final summary = CountSummary(counted: after.counted, matched: after.matched, short: after.short, over: after.over, shortValue: after.shortValue + zeroShort,
      overValue: after.overValue, scope: old?.scope ?? scope, zeroed: old?.zeroed ?? 0, netValue: after.net + zeroValue);
  final ref = '${count['number'] ?? count['name']}';
  return store.update((d) async {
    for (final c in changes) {
      d.move(productId: p.id, qty: c.qty - c.l.qty, type: 'Stock count', ref: ref, note: '${count['name']} (corrected: ${reason.trim()})', user: user, batchId: c.batchId, branchId: branchId);
    }
    final rec = await store.get('countItems', countItemId(count['id'] as String, p.id)) ?? const <String, Object?>{};
    d.put('countItems', {...rec, 'lines': [for (final l in lines) l.toJson()], 'total': lines.fold<double>(0, (a, l) => a + l.qty)});
    final cur = await store.get('stockCounts', count['id'] as String) ?? count;
    d.put('stockCounts', {...cur, 'summary': summary.toJson()});
    d.audit(user, 'Stock count corrected',
        '${count['name']}: ${p.name} ${[for (final c in changes) 'batch ${c.l.batch.isEmpty ? '—' : c.l.batch} ${_fmt(c.l.qty)} → ${_fmt(c.qty)}'].join(', ')} (${reason.trim()})',
        branchId);
    return summary;
  });
}
