import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../database/app_database.dart';
import '../entities/settings.dart';
import '../rules/dates.dart';
import '../rules/balances.dart';
import '../rules/doc_numbers.dart';
import '../rules/ids.dart';
import '../sync/field_merge.dart';
import '../sync/sync_config.dart';
import '../rules/stock.dart';

part 'record_store.g.dart';

/// Every synced table (src/store.jsx TABLES), so this app and the React app agree on what exists.
const syncedTables = [
  'products', 'formulations', 'customers', 'suppliers', 'sales', 'proformas', 'purchases', 'movements',
  'prescriptions', 'expenses', 'expenseCategories', 'banks', 'bankTx', 'loans', 'payments', 'users',
  'batches', 'branches', 'transfers', 'audit', 'purchaseOrders', 'roles', 'messages', 'shifts', 'license', 'events',
  'tempLogs', 'catalogHidden', 'quizResults', 'stockCounts', 'countItems', 'supplierReturns', 'chatMarks', 'chatPins',
  'chatReads', 'drafts',
  'dayCloses', // step 18: closed days per branch (core/rules/day_close.dart)
  'counters', // step 7: each till's document counts (core/rules/doc_numbers.dart), saved with the documents
  'anomalies', // sale checks written by the cloud (worker/anomalies.js); only roles with the audit log receive them
  'insurers', // step 22: insurers and their schemes (core/rules/insurance.dart)
  // only this app (Payroll & HR, scheduled report emails); the React app skips tables it does not know
  'employees', 'attendance', 'salaryAdvances', 'payrolls', 'reportSchedules',
];

/// Tables that only ever grow: a row is never changed or deleted (the cloud refuses it too).
const appendOnlyTables = {'movements', 'audit', 'controlled'};

const settingsKey = 'settings';

/// A change that was refused before anything was written.
class StoreRefused implements Exception {
  StoreRefused(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Everything one action changes (a sale, a delivery…), collected and then saved in one transaction.
class Edit {
  Edit(this._store, this.now);

  final RecordStore _store;
  /// The time every record in this action is stamped with.
  final String now;
  final _puts = <String, ({String t, Map<String, Object?> rec})>{};
  final _dels = <String, ({String t, String id})>{};
  Map<String, Object?>? _settings;

  /// Add or replace a record. It gets an id if it has none and is stamped with [now].
  Map<String, Object?> put(String t, Map<String, Object?> rec) {
    final id = (rec['id'] as String?)?.isNotEmpty == true ? rec['id'] as String : uid();
    final r = {...rec, 'id': id, 'updatedAt': now};
    _dels.remove('$t|$id');
    _puts['$t|$id'] = (t: t, rec: r);
    return r;
  }

  /// Delete a record (a tombstone is kept so a later download does not bring it back). A standard-catalogue medicine
  /// is built into the app, so this pharmacy also remembers it removed it (catalogHidden, as src/store.jsx del).
  void del(String t, String id) {
    _puts.remove('$t|$id');
    _dels['$t|$id'] = (t: t, id: id);
    if (t == 'products' && RegExp(r'^cat-\d+$').hasMatch(id)) put('catalogHidden', {'id': id});
  }

  /// Record a stock movement (+ in, − out). Stock is always the sum of movements.
  Map<String, Object?> move({required String productId, required double qty, required String type, String ref = '',
      String note = '', String user = '', String? batchId, String branchId = mainBranch}) =>
      put('movements', {'id': uid(), 'productId': productId, 'qty': qty == qty.roundToDouble() ? qty.toInt() : qty,
        'type': type, 'ref': ref, 'note': note, 'user': user, 'batchId': batchId, 'branchId': branchId, 'date': now});

  /// Write an audit log line.
  void audit(String user, String action, [String details = '', String branchId = mainBranch]) =>
      put('audit', {'id': uid(), 'date': now, 'user': user, 'action': action, 'details': details, 'branchId': branchId});

  /// A batch for a medicine: the existing one with the same number and expiry, or a new one.
  Future<Map<String, Object?>> addBatch({required String productId, required String batch, String expiry = '', double cost = 0}) async {
    final code = batch.trim();
    for (final p in _puts.values.where((p) => p.t == 'batches')) {
      if (p.rec['productId'] == productId && p.rec['batch'] == code && (p.rec['expiry'] ?? '') == expiry) return p.rec;
    }
    for (final b in await _store.rows('batches')) {
      if (b['productId'] == productId && b['batch'] == code && (b['expiry'] ?? '') == expiry) return b;
    }
    return put('batches', {'id': uid(), 'productId': productId,
      'batch': code.isEmpty ? 'B${today().replaceAll('-', '').substring(2)}' : code, 'expiry': expiry,
      'cost': cost == cost.roundToDouble() ? cost.toInt() : cost, 'received': today()});
  }

  /// Step 7: the next number for a document of this [kind] (R, PF, GRN, PO, TR, SC, RT) at [branchId], counted in
  /// this same transaction, so the count is saved with the document (core/rules/doc_numbers.dart).
  Future<String> number(String kind, {String branchId = mainBranch}) async {
    final till = (await SyncConfig.load(_store.db)).till;
    if (till == null || till <= 0) return legacyNumber(kind);
    final id = counterId(till);
    final cur = _puts['counters|$id']?.rec ?? (await _store.rows('counters')).where((c) => c['id'] == id).firstOrNull ?? {'id': id, 'till': till};
    final n = ((cur[kind] as num?) ?? 0).toInt() + 1;
    put('counters', {...cur, kind: n});
    final branch = _puts['branches|$branchId']?.rec ?? (await _store.rows('branches')).where((b) => b['id'] == branchId).firstOrNull;
    return formatNumber(kind, branchCode(branch), till, n);
  }

  /// Change the pharmacy's shared settings.
  void saveSettings(Map<String, Object?> settings) => _settings = {...settings, 'updatedAt': now};

  bool get isEmpty => _puts.isEmpty && _dels.isEmpty && _settings == null;
}

/// The pharmacy on this device: reads records, and saves each action atomically together with the outbox entries
/// that will send it to the cloud (src/store.jsx update() + src/storage.js commit()).
class RecordStore {
  RecordStore(this.db, {String Function()? clock}) : _clock = clock ?? (() => DateTime.now().toUtc().toIso8601String());

  final AppDatabase db;
  final String Function() _clock;
  final _saved = StreamController<void>.broadcast();

  /// Fires after every saved action (sync sends it straight away).
  Stream<void> get saved => _saved.stream;

  static Map<String, Object?> _decode(String json) => (jsonDecode(json) as Map).cast<String, Object?>();

  Future<List<Map<String, Object?>>> rows(String t) async =>
      [for (final r in await (db.select(db.records)..where((x) => x.t.equals(t))).get()) _decode(r.json)];

  Stream<List<Map<String, Object?>>> watch(String t) =>
      (db.select(db.records)..where((x) => x.t.equals(t))).watch().map((rs) => [for (final r in rs) _decode(r.json)]);

  /// Step 13: stock per branch, batch and medicine, added up by SQLite (the same keys as StockIndex.of: an empty
  /// branch is the main branch, a movement without a batch counts under `lb-<medicine>`, quantities read as numbers
  /// like toNum). Re-runs when records change; returns a few thousand totals, not every movement.
  /// Faster sync, stage 4: on a device keeping recent history (kv "sync": window W with the cloud's brought-forward
  /// figures for W), stock = the movements dated from W + the brought-forward stock (src/stockindex.js); a movement
  /// before W that is still on the device is in the brought-forward figure already, so it is not counted twice.
  static const _stockSql = '''
WITH w AS (SELECT COALESCE((SELECT json_extract(v, '\$.window') FROM kv WHERE k = 'sync'
  AND COALESCE(json_extract(v, '\$.window'), '') <> '' AND json_extract(v, '\$.balances.W') = json_extract(v, '\$.window')), '') AS start)
SELECT br, bk, pid, TOTAL(q) AS q FROM (
  SELECT CASE WHEN COALESCE(CAST(json_extract(json, '\$.branchId') AS TEXT), '') = '' THEN 'main' ELSE CAST(json_extract(json, '\$.branchId') AS TEXT) END AS br,
    COALESCE(CAST(json_extract(json, '\$.batchId') AS TEXT), 'lb-' || COALESCE(CAST(json_extract(json, '\$.productId') AS TEXT), '')) AS bk,
    COALESCE(CAST(json_extract(json, '\$.productId') AS TEXT), '') AS pid,
    CAST(json_extract(json, '\$.qty') AS REAL) AS q
  FROM records, w WHERE t = 'movements' AND (w.start = '' OR COALESCE(CAST(json_extract(json, '\$.date') AS TEXT), '') >= w.start)
  UNION ALL
  SELECT CAST(json_extract(s.value, '\$.branch') AS TEXT), CAST(json_extract(s.value, '\$.batch') AS TEXT),
    COALESCE(CAST(json_extract(s.value, '\$.product') AS TEXT), ''), CAST(json_extract(s.value, '\$.qty') AS REAL)
  FROM kv, w, json_each(kv.v, '\$.balances.stock') s WHERE kv.k = 'sync' AND w.start <> ''
) GROUP BY br, bk, pid''';

  ({String branch, String batchKey, String productId, double qty}) _total(QueryRow r) =>
      (branch: r.read<String>('br'), batchKey: r.read<String>('bk'), productId: r.read<String>('pid'), qty: r.read<double>('q'));

  Stream<StockIndex> watchStock() =>
      db.customSelect(_stockSql, readsFrom: {db.records, db.kv}).watch().map((rows) => StockIndex.fromTotals(rows.map(_total)));

  Future<StockIndex> stock() async => StockIndex.fromTotals((await db.customSelect(_stockSql, readsFrom: {db.records, db.kv}).get()).map(_total));

  /// Faster sync, stage 4: the brought-forward figures of a device keeping recent history (kv "sync": the window and
  /// the cloud's figures for it), or null (no window, or its figures not in yet: the plain sums apply).
  static ({String key, BalanceWindow? win}) _windowOf(String? v) {
    if (v == null) return (key: '', win: null);
    final j = (jsonDecode(v) as Map).cast<String, Object?>();
    final w = j['window'], b = (j['balances'] as Map?)?.cast<String, Object?>();
    if (w is! String || w.isEmpty || b?['W'] != w) return (key: '', win: null);
    return (key: '$w|${b!['asOf']}|${jsonEncode(b)}'.hashCode.toString(), win: BalanceWindow.of(b));
  }

  /// Fires only when the window or its figures change (the sync settings are saved after every downloaded page).
  Stream<BalanceWindow?> watchBalanceWindow() => (db.select(db.kv)..where((x) => x.k.equals('sync'))).watchSingleOrNull()
      .map((r) => _windowOf(r?.v)).distinct((a, b) => a.key == b.key).map((x) => x.win);

  Future<BalanceWindow?> balanceWindow() async => _windowOf((await (db.select(db.kv)..where((x) => x.k.equals('sync'))).getSingleOrNull())?.v).win;

  Future<Map<String, Object?>?> get(String t, String id) async {
    final r = await (db.select(db.records)..where((x) => x.t.equals(t) & x.id.equals(id))).getSingleOrNull();
    return r == null ? null : _decode(r.json);
  }

  // Lookups served by the schema-2 indexes (the expressions must match the index definitions exactly).
  Future<List<Map<String, Object?>>> _byJsonKey(String t, String path, String value) async => [
        for (final r in await db.customSelect(
          "SELECT json FROM records WHERE t = ? AND json_extract(json, '\$.$path') = ?",
          variables: [Variable.withString(t), Variable.withString(value)],
          readsFrom: {db.records},
        ).get())
          _decode(r.read<String>('json')),
      ];

  /// The pharmacy's own medicine with this barcode (the built-in catalogue is searched in memory).
  Future<Map<String, Object?>?> productByBarcode(String barcode) async => (await _byJsonKey('products', 'barcode', barcode)).firstOrNull;

  Future<List<Map<String, Object?>>> movementsOf(String productId) => _byJsonKey('movements', 'productId', productId);

  Future<List<Map<String, Object?>>> batchesOf(String productId) => _byJsonKey('batches', 'productId', productId);

  Future<Map<String, Object?>> settingsRecord() async {
    final r = await (db.select(db.kv)..where((x) => x.k.equals(settingsKey))).getSingleOrNull();
    return r == null ? <String, Object?>{} : _decode(r.v);
  }

  Future<PharmacySettings> settings() async => PharmacySettings.fromRecord(await settingsRecord());

  Stream<PharmacySettings> watchSettings() => (db.select(db.kv)..where((x) => x.k.equals(settingsKey))).watch().map(
      (rs) => PharmacySettings.fromRecord(rs.isEmpty ? const {} : _decode(rs.single.v)));

  /// Run [change] and save everything it did in ONE transaction: records, deletions (with tombstones), settings and
  /// the outbox entries (all sharing one txn id, so they reach the cloud together). If anything fails, nothing is
  /// saved and the error is passed on: the caller (e.g. the till) keeps the sale and says it was NOT recorded.
  Future<T> update<T>(FutureOr<T> Function(Edit d) change) => db.transaction(() async {
        final d = Edit(this, _clock());
        final result = await change(d);
        if (d.isEmpty) return result;
        final txn = uid();
        for (final p in d._puts.values) {
          final id = p.rec['id'] as String;
          if (appendOnlyTables.contains(p.t) && await get(p.t, id) != null) {
            throw StoreRefused('${p.t} can only be added to, never changed ($id).');
          }
          // step 14: a medicine, client, supplier or batch remembers when each field changed (core/sync/field_merge.dart)
          final rec = fieldTables.contains(p.t) ? stampFields(await get(p.t, id), p.rec, d.now) : p.rec;
          await db.into(db.records).insertOnConflictUpdate(
              RecordsCompanion.insert(t: p.t, id: id, json: jsonEncode(rec), updatedAt: Value(d.now)));
          await db.into(db.outbox).insert(OutboxCompanion.insert(op: uid(), txn: txn, t: p.t, id: id, at: d.now));
        }
        for (final x in d._dels.values) {
          if (appendOnlyTables.contains(x.t)) throw StoreRefused('${x.t} can never be deleted (${x.id}).');
          await (db.delete(db.records)..where((r) => r.t.equals(x.t) & r.id.equals(x.id))).go();
          await db.into(db.tombstones).insertOnConflictUpdate(TombstonesCompanion.insert(t: x.t, id: x.id, at: d.now));
          await db.into(db.outbox)
              .insert(OutboxCompanion.insert(op: uid(), txn: txn, t: x.t, id: x.id, deleted: const Value(true), at: d.now));
        }
        if (d._settings case final s?) {
          await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: settingsKey, v: jsonEncode(s)));
          await db.into(db.outbox).insert(OutboxCompanion.insert(op: uid(), txn: txn, t: 'settings', id: 'settings', at: d.now));
        }
        return result;
      }).then((r) {
        _saved.add(null);
        return r;
      });
}

@Riverpod(keepAlive: true)
RecordStore recordStore(Ref ref) => RecordStore(ref.watch(appDatabaseProvider));
