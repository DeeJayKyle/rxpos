// Users and roles, branch transfers.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/passwords.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/branches/domain/transfers.dart';
import 'package:rxpos/features/users/domain/users.dart';

void main() {
  late AppDatabase db;
  late RecordStore store;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = RecordStore(db);
  });
  tearDown(() => db.close());

  test('a new user: checks, and a password the cloud can verify', () async {
    final u = await saveUser(store, {'name': 'Ben Cashier', 'email': ' Ben@Test.rx ', 'role': 'cashier'}, password: 'ben-pass-123', others: const [], by: 'Tia', roleName: 'Cashier');
    expect((u['email'], u['algo']), ('ben@test.rx', 'pbkdf2'));
    expect(verifyPassword(u, 'ben-pass-123'), isTrue);
    expect(() => saveUser(store, {'name': 'X', 'email': 'ben@test.rx'}, password: 'long-enough', others: [u], by: 'T', roleName: 'r'), throwsA(isA<UserProblem>()));
    expect(() => saveUser(store, {'name': 'X', 'username': 'a b'}, password: 'long-enough', others: const [], by: 'T', roleName: 'r'), throwsA(isA<UserProblem>()));
    expect(() => saveUser(store, {'name': 'X', 'email': 'x@y.z'}, password: 'short', others: const [], by: 'T', roleName: 'r'), throwsA(isA<UserProblem>()));
    final edited = await saveUser(store, {...u, 'name': 'Ben C.'}, others: [u], by: 'Tia', roleName: 'Cashier');
    expect(edited['hash'], u['hash'], reason: 'editing without a new password keeps it');
  });

  test('a custom role', () async {
    final r = await saveRole(store, name: 'Night shift', permissions: ['pos.sell'], by: 'Tia', existingIds: {'admin', 'cashier'});
    expect(r['id'], 'night-shift');
    expect(() => saveRole(store, name: 'Cashier', permissions: const [], by: 'T', existingIds: {'cashier'}), throwsA(isA<UserProblem>()));
  });

  test('a transfer leaves the sending branch first-expiry-first-out and arrives in the same batches, short noted', () async {
    const batches = [BatchStock(id: 'b-early', batch: 'E', qty: 3, expiry: '2027-01-01'), BatchStock(id: 'b-late', batch: 'L', qty: 10, expiry: '2028-01-01')];
    final t = await sendTransfer(store, fromId: 'main', toId: 'kla', toName: 'Kampala', by: 'Tia',
        lines: [(productId: 'p1', name: 'Amoxa', qty: 5, stock: 13, batches: batches)]);
    Future<StockIndex> idx() async => StockIndex.of((await store.rows('movements')).map(Movement.fromRecord));
    expect((await idx()).ofProduct('main', 'p1'), -5);
    await receiveTransfer(store, t, received: {0: 4}, fromName: 'Main', by: 'Kim');
    final i = await idx();
    expect(i.ofProduct('kla', 'p1'), 4);
    expect((i.ofBatch('kla', 'b-early'), i.ofBatch('kla', 'b-late')), (3.0, 1.0));
    expect((await store.get('transfers', t['id'] as String))!['status'], 'Received (short)');
    expect(() => sendTransfer(store, fromId: 'main', toId: 'kla', toName: 'K', by: 'T', lines: [(productId: 'p1', name: 'A', qty: 99, stock: 13, batches: batches)]), throwsA(isA<TransferProblem>()));
  });
}
