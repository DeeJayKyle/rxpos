// Signing in with the same accounts as the React app: plain, choose a pharmacy, two-step code, wrong password, owner,
// and switching pharmacy (never while changes are waiting).
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/features/auth/data/auth_repository.dart';
import 'package:rxpos/features/auth/domain/session.dart';

import '../sync/fake_cloud.dart';

Map<String, Object?> ok(String tenant, {String name = 'Tia Admin', String role = 'admin'}) => {
      'token': 'tok-$tenant', 'tenant': tenant, 'slug': tenant, 'pharmacy': 'Pharmacy $tenant',
      'user': {'id': 'u-$tenant', 'name': name, 'email': 'tia@test.rx', 'role': role},
    };

void main() {
  late AppDatabase db;
  late FakeCloud cloud;
  late AuthRepository auth;
  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    cloud = FakeCloud();
    auth = AuthRepository(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com');
  });
  tearDown(() => db.close());

  test('a correct password signs in and the session is kept on the device', () async {
    cloud.login = (b) => b['password'] == 'right-pass' ? (200, ok('t1')) : (401, {'error': 'Wrong email or password (4 attempts left).'});
    final out = await auth.signIn(email: ' tia@test.rx ', password: 'right-pass');
    expect(out, isA<SignedIn>());
    final s = (out as SignedIn).session;
    expect((s.token, s.tenant, s.userName, s.role), ('tok-t1', 't1', 'Tia Admin', 'admin'));
    expect(cloud.logins.single['email'], 'tia@test.rx');
    expect((await auth.restore())?.token, 'tok-t1', reason: 'restored after a restart, without internet');
  });

  test('a wrong password shows the cloud\'s message', () async {
    cloud.login = (_) => (401, {'error': 'Wrong email or password (4 attempts left before a 15-minute lock).'});
    final out = await auth.signIn(email: 'tia@test.rx', password: 'nope');
    expect((out as SignInFailed).message, contains('4 attempts left'));
    expect(await auth.restore(), isNull);
  });

  test('one email at several pharmacies: choose, then sign in to the chosen one', () async {
    cloud.login = (b) => b['tenant'] == null
        ? (200, {'choose': [{'code': 'kampala-rx', 'name': 'Kampala Rx', 'role': 'admin'}, {'code': 'jinja-rx', 'name': 'Jinja Rx', 'role': 'cashier'}]})
        : (200, ok('${b['tenant']}'));
    final first = await auth.signIn(email: 'tia@test.rx', password: 'p');
    expect((first as ChoosePharmacy).choices.map((c) => c.name), ['Kampala Rx', 'Jinja Rx']);
    final out = await auth.signIn(email: 'tia@test.rx', password: 'p', pharmacy: 'jinja-rx');
    expect((out as SignedIn).session.tenant, 'jinja-rx');
  });

  test('two-step sign-in asks for the code, says when it is wrong, accepts the right one', () async {
    cloud.login = (b) => switch (b['otp']) {
          null => (401, {'twoFactor': true}),
          '123456' => (200, ok('t1')),
          _ => (401, {'twoFactor': true, 'error': 'That code is not right. Type the newest code from your authenticator app.'}),
        };
    expect(await auth.signIn(email: 'a@b.c', password: 'p'), isA<NeedsCode>().having((n) => n.message, 'message', isNull));
    expect((await auth.signIn(email: 'a@b.c', password: 'p', code: '999999') as NeedsCode).message, contains('not right'));
    expect(await auth.signIn(email: 'a@b.c', password: 'p', code: ' 123456 '), isA<SignedIn>());
  });

  test('the RxPOS owner\'s account is sent to the owner console', () async {
    cloud.login = (_) => (200, {'owner': {'token': 'own'}});
    expect((await auth.signIn(email: 'owner@rx', password: 'p') as SignInFailed).message, contains('owner console'));
  });

  test('switching pharmacy clears the old one\'s data, but never while changes are waiting', () async {
    cloud.login = (b) => (200, ok(b['password'] == 'second' ? 't2' : 't1'));
    final store = RecordStore(db);
    await auth.signIn(email: 'tia@test.rx', password: 'first');
    await store.update((d) => d.put('sales', {'id': 's1', 'total': 100}));
    final blocked = await auth.signIn(email: 'tia@test.rx', password: 'second');
    expect((blocked as SignInFailed).message, contains('1 change'));
    expect(await store.get('sales', 's1'), isNotNull);
    expect((await auth.restore())?.tenant, 't1', reason: 'still signed in to the first pharmacy');
    await db.delete(db.outbox).go(); // as if the change had synced
    final switched = await auth.signIn(email: 'tia@test.rx', password: 'second');
    expect((switched as SignedIn).session.tenant, 't2');
    expect(await store.get('sales', 's1'), isNull, reason: 'the first pharmacy\'s data is not shown in the second');
  });

  test('no internet: a plain message', () async {
    cloud.login = null; // the connection drops
    final out = await auth.signIn(email: 'a', password: 'b');
    expect((out as SignInFailed).message, contains('No connection'));
  });
}
