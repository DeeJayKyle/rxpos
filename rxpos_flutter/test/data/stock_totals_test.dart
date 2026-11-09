// Step 13: stock added up by SQLite (RecordStore.watchStock / stock) gives exactly what counting every movement in
// Dart gives (StockIndex.of), including awkward records: no branch, an empty branch, no batch, quantities as text.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/rules/stock.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  final records = <Map<String, Object?>>[
    {'id': 'a', 'productId': 'p1', 'qty': 100, 'batchId': 'b1', 'branchId': 'main', 'type': 'Opening stock'},
    {'id': 'b', 'productId': 'p1', 'qty': -3, 'batchId': 'b1', 'branchId': 'main', 'type': 'Sale'},
    {'id': 'c', 'productId': 'p1', 'qty': 20, 'batchId': 'b2', 'branchId': 'kla', 'type': 'Transfer in'},
    {'id': 'd', 'productId': 'p2', 'qty': 7, 'type': 'Opening stock'}, // no branch, no batch
    {'id': 'e', 'productId': 'p2', 'qty': -2, 'batchId': null, 'branchId': '', 'type': 'Sale'}, // empty branch, null batch
    {'id': 'f', 'productId': 'p3', 'qty': '12', 'batchId': 'b3', 'branchId': 'main', 'type': 'Opening stock'}, // qty as text
    {'id': 'g', 'productId': 'p3', 'qty': 'x', 'batchId': 'b3', 'branchId': 'main', 'type': 'Adjustment'}, // junk qty = 0
    {'id': 'h', 'productId': 'p3', 'qty': 1.5, 'batchId': 'b3', 'branchId': 'main', 'type': 'Adjustment'},
  ];

  test('SQLite totals equal the movement-by-movement count', () async {
    await store.update((d) {
      for (final r in records) {
        d.put('movements', r);
      }
    });
    final fromSql = await store.stock();
    final fromDart = StockIndex.of((await store.rows('movements')).map(Movement.fromRecord));
    for (final (br, batch) in [('main', 'b1'), ('kla', 'b2'), ('main', 'lb-p2'), ('main', 'b3'), ('kla', 'b1')]) {
      expect(fromSql.ofBatch(br, batch), fromDart.ofBatch(br, batch), reason: '$br|$batch');
    }
    for (final (br, p) in [('main', 'p1'), ('kla', 'p1'), ('main', 'p2'), ('main', 'p3'), ('kla', 'p3')]) {
      expect(fromSql.ofProduct(br, p), fromDart.ofProduct(br, p), reason: '$br|$p');
    }
    for (final p in ['p1', 'p2', 'p3', 'nothing']) {
      expect(fromSql.everywhere(p), fromDart.everywhere(p), reason: p);
    }
    expect((fromSql.ofBatch('main', 'b1'), fromSql.ofBatch('main', 'lb-p2'), fromSql.everywhere('p3')), (97.0, 5.0, 13.5));
  });

  test('the live totals follow each new movement', () async {
    final seen = <double>[];
    final sub = store.watchStock().listen((ix) => seen.add(ix.everywhere('p1')));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await store.update((d) => d.put('movements', records[0]));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await store.update((d) => d.put('movements', records[1]));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await sub.cancel();
    expect(seen.first, 0);
    expect(seen.last, 97);
  });
}
