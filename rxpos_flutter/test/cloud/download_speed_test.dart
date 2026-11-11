// How long a first download of a large pharmacy takes in this app, against the REAL RxPOS cloud code (worker/index.js
// run locally with wrangler, fictional data only), and that it arrives complete (docs/SYNC-SPEED-PLAN.md). Skipped
// unless a local cloud is given; the size can be changed with RXPOS_SPEED_SALES (default 15,000 sales, like the
// classic app's "large" benchmark: 51,000 records in all).
//   RXPOS_CLOUD=http://127.0.0.1:8791 RXPOS_OWNER_KEY=<owner key> flutter test test/cloud/download_speed_test.dart
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/network/interceptors.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/core/sync/sync_engine.dart';
import 'package:rxpos/features/auth/data/auth_repository.dart';
import 'package:rxpos/features/auth/domain/session.dart';

void main() {
  final base = Platform.environment['RXPOS_CLOUD'];
  final ownerKey = Platform.environment['RXPOS_OWNER_KEY'];
  final skip = base == null || ownerKey == null ? 'no local cloud given (RXPOS_CLOUD, RXPOS_OWNER_KEY)' : null;
  final sales = int.tryParse(Platform.environment['RXPOS_SPEED_SALES'] ?? '') ?? 15000;
  const products = 2000, email = 'speedy@test.rx', password = 'speedy-pass-1234';

  test('a large pharmacy downloads completely, and how long it takes', () async {
    final owner = Dio(BaseOptions(baseUrl: base!, headers: {'Authorization': 'Bearer $ownerKey'}));
    Future<Map> own(String path, [Map<String, Object?>? body]) async =>
        (await (body == null ? owner.get<Object?>('/api/owner$path') : owner.post<Object?>('/api/owner$path', data: body))).data as Map;
    for (final t in ((await own('/tenants'))['tenants'] as List).cast<Map>()) {
      if (t['name'] == 'Speed Sample Pharmacy') await own('/tenants/${t['id']}/delete', {'confirm': t['slug']});
    }
    final created = await own('/tenants', {'name': 'Speed Sample Pharmacy', 'admin': {'name': 'Speedy Admin', 'email': email, 'password': password}});
    final tid = '${(created['tenant'] as Map)['id']}', slug = '${(created['tenant'] as Map)['slug']}';
    await own('/tenants/$tid', {'features': {'catalog': false, 'weather': false, 'promos': false}});
    final iso = DateTime.utc(2026, 1, 1).toIso8601String();
    final recs = <Map<String, Object?>>[];
    for (var i = 0; i < products; i++) {
      recs
        ..add({'t': 'products', 'id': 'p$i', 'rec': {'name': 'Sample Medicine $i 500mg', 'unit': 'Tablet', 'price': 100 + i % 50, 'cost': 60, 'reorder': 10}})
        ..add({'t': 'batches', 'id': 'b$i', 'rec': {'productId': 'p$i', 'batch': 'B$i', 'expiry': '2029-01-31', 'cost': 60}})
        ..add({'t': 'movements', 'id': 'm$i', 'rec': {'productId': 'p$i', 'batchId': 'b$i', 'qty': 1000, 'type': 'Opening stock', 'branchId': 'main', 'date': iso}});
    }
    for (var i = 0; i < sales; i++) {
      final a = i % products, b = (i * 7) % products;
      recs.add({'t': 'sales', 'id': 's$i', 'rec': {'number': 'R$i', 'date': iso, 'type': 'retail', 'branchId': 'main', 'total': 200, 'paid': 200, 'payment': 'Cash',
        'items': [for (final k in [a, b]) {'id': 'p$k', 'name': 'Sample Medicine $k', 'qty': 1, 'price': 100, 'cost': 60}], 'customerId': 'walk-in', 'status': 'completed'}});
      for (final (j, k) in [(0, a), (1, b)]) {
        recs.add({'t': 'movements', 'id': 'sm$i-$j', 'rec': {'productId': 'p$k', 'batchId': 'b$k', 'qty': -1, 'type': 'Sale', 'ref': 'R$i', 'branchId': 'main', 'date': iso}});
      }
    }
    for (var i = 0; i < recs.length; i += 500) {
      await own('/tenants/$tid/records', {'records': recs.sublist(i, i + 500 > recs.length ? recs.length : i + 500)});
    }

    final db = AppDatabase(NativeDatabase.memory());
    String? token;
    final app = Dio(BaseOptions(baseUrl: base))..interceptors.addAll([AuthInterceptor(() => token), FailureInterceptor()]);
    final out = await AuthRepository(dio: app, db: db, cloudUrl: base).signIn(email: email, password: password);
    token = (out as SignedIn).session.token;
    final watch = Stopwatch()..start();
    final r = await SyncEngine(dio: app, db: db, cloudUrl: base).run();
    watch.stop();
    // ignore: avoid_print
    print('first download: ${recs.length} records in ${watch.elapsedMilliseconds} ms');

    final store = RecordStore(db);
    expect(r.complete, isTrue);
    expect((await store.rows('sales')).length, sales);
    expect((await store.rows('products')).length, products);
    final index = StockIndex.of((await store.rows('movements')).map(Movement.fromRecord));
    var total = 0.0;
    for (var i = 0; i < products; i++) {
      total += index.ofProduct(mainBranch, 'p$i');
    }
    expect(total, products * 1000 - sales * 2, reason: 'stock is the sum of every movement, none missing or twice');
    await db.close();
    await own('/tenants/$tid/delete', {'confirm': slug});
  }, skip: skip, timeout: const Timeout(Duration(minutes: 20)));
}
