// Against the REAL RxPOS cloud code (worker/index.js run locally with wrangler, fictional data only), a React-style
// device and this app work on the same pharmacy. Skipped unless a local cloud is given:
//   RXPOS_CLOUD=http://127.0.0.1:8791 RXPOS_OWNER_KEY=<owner key> flutter test test/cloud
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/network/interceptors.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/core/sync/sync_engine.dart';
import 'package:rxpos/features/auth/data/auth_repository.dart';
import 'package:rxpos/features/auth/domain/session.dart';
import 'package:rxpos/features/sales_pos/domain/cart.dart';

void main() {
  final base = Platform.environment['RXPOS_CLOUD'];
  final ownerKey = Platform.environment['RXPOS_OWNER_KEY'];
  final skip = base == null || ownerKey == null ? 'no local cloud given (RXPOS_CLOUD, RXPOS_OWNER_KEY)' : null;

  late Dio owner;
  late String tenantId, slug;
  const email = 'fiona@test.rx', password = 'fiona-pass-1234';
  late AppDatabase db;
  late RecordStore store;
  late Dio app;
  late SyncEngine sync;
  String? token;

  Future<Map<String, Object?>> own(String path, [Map<String, Object?>? body]) async =>
      ((await (body == null ? owner.get<Object?>('/api/owner$path') : owner.post<Object?>('/api/owner$path', data: body))).data as Map).cast<String, Object?>();

  setUpAll(() async {
    if (skip != null) return;
    owner = Dio(BaseOptions(baseUrl: base!, headers: {'Authorization': 'Bearer $ownerKey'}));
    for (final t in ((await own('/tenants'))['tenants'] as List).cast<Map>()) {
      if (t['name'] == 'Flutter Sample Pharmacy') await own('/tenants/${t['id']}/delete', {'confirm': t['slug']});
    }
    final created = await own('/tenants', {'name': 'Flutter Sample Pharmacy', 'admin': {'name': 'Fiona Admin', 'email': email, 'password': password}});
    tenantId = '${(created['tenant'] as Map)['id']}';
    slug = '${(created['tenant'] as Map)['slug']}';
    await own('/tenants/$tenantId', {'features': {'catalog': false, 'weather': false, 'promos': false}});
    await own('/tenants/$tenantId/records', {'records': [
      {'t': 'products', 'id': 'fl-amox', 'rec': {'name': 'Amoxa 500mg Caps', 'unit': 'Capsule', 'barcode': '7090001', 'price': 500, 'cost': 300, 'reorder': 0, 'rx': true}},
      {'t': 'batches', 'id': 'fl-b1', 'rec': {'productId': 'fl-amox', 'batch': 'AX1', 'expiry': '2029-01-31', 'cost': 300, 'received': '2026-11-01'}},
      {'t': 'movements', 'id': 'fl-m1', 'rec': {'productId': 'fl-amox', 'batchId': 'fl-b1', 'qty': 100, 'type': 'Opening stock', 'date': '2026-11-01T08:00:00.000Z', 'branchId': 'main', 'user': 'Fiona Admin'}},
    ]});
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
    app = Dio(BaseOptions(baseUrl: base))
      ..interceptors.addAll([AuthInterceptor(() => token), FailureInterceptor()]);
    sync = SyncEngine(dio: app, db: db, cloudUrl: base);
  });

  tearDownAll(() async {
    if (skip != null) return;
    await own('/tenants/$tenantId/delete', {'confirm': slug});
    await db.close();
  });

  Future<double> stock() async => StockIndex.of((await store.rows('movements')).map(Movement.fromRecord)).ofProduct(mainBranch, 'fl-amox');

  test('signs in with the pharmacy\'s account', () async {
    final out = await AuthRepository(dio: app, db: db, cloudUrl: base!).signIn(email: email, password: password);
    expect(out, isA<SignedIn>(), reason: out is SignInFailed ? out.message : '');
    token = (out as SignedIn).session.token;
    expect(out.session.userName, 'Fiona Admin');
    expect(out.session.role, 'admin');
    final wrong = await AuthRepository(dio: app, db: db, cloudUrl: base).signIn(email: email, password: 'nope');
    expect(wrong, isA<SignInFailed>());
  }, skip: skip);

  test('the first download brings the pharmacy', () async {
    final r = await sync.run();
    expect(r.full, isTrue);
    expect(await store.get('products', 'fl-amox'), isNotNull);
    expect(await stock(), 100);
  }, skip: skip);

  test('a sale made here reaches the cloud exactly as the React app writes it', () async {
    final view = StockView(products: [Product.fromRecord((await store.get('products', 'fl-amox'))!)],
        batches: (await store.rows('batches')).map(Batch.fromRecord), index: StockIndex.of((await store.rows('movements')).map(Movement.fromRecord)));
    final sale = await completeSale(store,
        cart: [const CartLine(id: 'fl-amox', name: 'Amoxa 500mg Caps', price: 500, cost: 300, qty: 4, max: 100, rx: true)],
        c: const Checkout(method: PaymentMethod(id: 'cash', name: 'Cash', type: 'cash'), rxChecked: true),
        settings: const PharmacySettings(), stock: view, wholesale: false, cashier: 'Fiona Admin');
    final r = await sync.run();
    expect(r.refused, 0);
    final ex = await own('/tenants/$tenantId/export');
    final cloudSale = (ex['sales'] as List).cast<Map>().singleWhere((s) => s['id'] == sale['id']);
    expect((cloudSale['total'], cloudSale['cashier'], cloudSale['status']), (2000, 'Fiona Admin', 'completed'));
    final moves = (ex['movements'] as List).cast<Map>().where((m) => m['productId'] == 'fl-amox').toList();
    expect(moves.fold<num>(0, (a, m) => a + (m['qty'] as num)), 96);
  }, skip: skip);

  test('a sale from another device (a React app) arrives here; both sales count', () async {
    // what src/sync.js sends: protocol 2, a sale and its movement in one request, each with an op id
    final at = DateTime.now().toUtc().subtract(const Duration(minutes: 1)).toIso8601String();
    final run = DateTime.now().microsecondsSinceEpoch; // change ids are remembered by the cloud: unique per run
    final reply = await app.post<Object?>('/api/sync', data: <String, Object?>{'v': 2, 'deviceId': 'react-device-1', 'since': 0, 'changes': [
      {'t': 'sales', 'id': 'react-sale-1', 'op': 'op-react-1-$run', 'at': at, 'rec': {'id': 'react-sale-1', 'number': 'RREACT1', 'date': at, 'type': 'retail', 'branchId': 'main',
        'items': [{'id': 'fl-amox', 'name': 'Amoxa 500mg Caps', 'price': 500, 'cost': 300, 'qty': 3, 'alloc': [{'batchId': 'fl-b1', 'qty': 3, 'batch': 'AX1', 'expiry': '2029-01-31'}]}],
        'subtotal': 1500, 'discount': 0, 'tax': 0, 'total': 1500, 'payment': 'Cash', 'paid': 1500, 'tendered': 1500, 'bankId': 'cash-drawer',
        'customerId': 'walk-in', 'customerName': 'Walk-in Customer', 'cashier': 'Fiona Admin', 'status': 'completed', 'updatedAt': at}},
      {'t': 'movements', 'id': 'react-mv-1', 'op': 'op-react-2-$run', 'at': at, 'rec': {'id': 'react-mv-1', 'productId': 'fl-amox', 'qty': -3, 'type': 'Sale', 'ref': 'RREACT1',
        'user': 'Fiona Admin', 'batchId': 'fl-b1', 'branchId': 'main', 'date': at, 'updatedAt': at}},
    ]});
    expect(((reply.data as Map)['refusedKeys'] as List?) ?? const [], isEmpty);
    await sync.run();
    expect(await store.get('sales', 'react-sale-1'), isNotNull);
    expect(await stock(), 93, reason: '100 − 4 here − 3 on the other device');
  }, skip: skip);

  test('a resend after a lost reply is applied once by the real cloud', () async {
    final view = StockView(products: [Product.fromRecord((await store.get('products', 'fl-amox'))!)],
        batches: (await store.rows('batches')).map(Batch.fromRecord), index: StockIndex.of((await store.rows('movements')).map(Movement.fromRecord)));
    await completeSale(store, cart: [const CartLine(id: 'fl-amox', name: 'Amoxa', price: 500, cost: 300, qty: 1, max: 93)],
        c: const Checkout(method: PaymentMethod(id: 'cash', name: 'Cash', type: 'cash'), rxChecked: true),
        settings: const PharmacySettings(), stock: view, wholesale: false, cashier: 'Fiona Admin');
    final pending = await db.select(db.outbox).get();
    // send the same changes twice, as a device does when the first reply is lost
    Future<Map> send() async => (await app.post<Object?>('/api/sync', data: {'v': 2, 'deviceId': 'flutter-x', 'since': 999999, 'changes': [
          for (final e in pending) {'t': e.t, 'id': e.id, 'op': e.op, 'at': e.at, 'rec': await store.get(e.t, e.id)},
        ]})).data as Map;
    await send();
    final again = await send();
    expect(again['dupes'], pending.length);
    await sync.run();
    final ex = await own('/tenants/$tenantId/export');
    final sum = (ex['movements'] as List).cast<Map>().where((m) => m['productId'] == 'fl-amox').fold<num>(0, (a, m) => a + (m['qty'] as num));
    expect(sum, 92, reason: 'the resent sale counted once');
  }, skip: skip);

  test('the real cloud refuses deleting a stock movement; the refusal is kept for review here', () async {
    final m = (await store.rows('movements')).first;
    await db.into(db.outbox).insert(OutboxCompanion.insert(op: 'op-tamper-${DateTime.now().microsecondsSinceEpoch}', txn: 'tx-tamper',
        t: 'movements', id: m['id'] as String, deleted: const Value(true), at: DateTime.now().toUtc().toIso8601String()));
    final r = await sync.run();
    expect(r.refused, 1);
    expect((await db.select(db.rejectedOps).get()).single.id, m['id']);
  }, skip: skip);
}
