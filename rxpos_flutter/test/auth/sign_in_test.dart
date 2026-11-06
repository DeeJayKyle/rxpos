// Signing in with the same accounts as the React app: plain, choose a pharmacy, two-step code, wrong password, owner,
// and switching pharmacy (never while changes are waiting).
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/features/auth/data/auth_repository.dart';
import 'package:rxpos/features/auth/domain/offline_secrets.dart';
import 'package:rxpos/features/auth/domain/session.dart';

import '../sync/fake_cloud.dart';

Map<String, Object?> ok(String tenant, {String name = 'Tia Admin', String role = 'admin'}) => {
      'token': 'tok-$tenant', 'tenant': tenant, 'slug': tenant, 'pharmacy': 'Pharmacy $tenant',
      'user': {'id': 'u-$tenant', 'name': name, 'email': 'tia@test.rx', 'role': role},
    };

void main() {
  setUpAll(() {
    passwordIterations = 50;
    pinIterations = 50;
  });
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
    expect((await auth.signIn(email: 'owner@rx', password: 'p') as SignInFailed).message, contains('RxPOS owner account'));
  });

  test('switching pharmacy clears the old one\'s data, but never while changes are waiting', () async {
    cloud.login = (b) => (200, ok(b['password'] == 'second' ? 't2' : 't1'));
    final store = RecordStore(db);
    await auth.signIn(email: 'tia@test.rx', password: 'first');
    await store.update((d) => d.put('sales', {'id': 's1', 'total': 100}));
    final ask = await auth.signIn(email: 'tia@test.rx', password: 'second');
    expect((ask as ConfirmSwitch).pharmacy, 'Pharmacy t2', reason: 'asked before switching');
    expect(ask.current, 'Pharmacy t1');
    final blocked = await auth.signIn(email: 'tia@test.rx', password: 'second', allowSwitch: true);
    expect((blocked as SignInFailed).message, contains('1 change'));
    expect(await store.get('sales', 's1'), isNotNull);
    expect((await auth.restore())?.tenant, 't1', reason: 'still signed in to the first pharmacy');
    await db.delete(db.outbox).go(); // as if the change had synced
    final switched = await auth.signIn(email: 'tia@test.rx', password: 'second', allowSwitch: true);
    expect((switched as SignedIn).session.tenant, 't2');
    expect(await store.get('sales', 's1'), isNull, reason: 'the first pharmacy\'s data is not shown in the second');
  });

  test('no internet before the first sign-in on this device: a plain message', () async {
    cloud.login = null; // the connection drops
    final out = await auth.signIn(email: 'a', password: 'b');
    expect((out as SignInFailed).message, contains('first sign-in on a device needs the internet'));
  });

  Future<void> signedInOnce({Map<String, Object?> user = const {}}) async {
    cloud.login = (b) => b['password'] == 'tia-pass' ? (200, ok('t1')) : (401, {'error': 'Wrong email or password'});
    await auth.signIn(email: 'tia@test.rx', password: 'tia-pass');
    await RecordStore(db).update((d) => d.put('users', {'id': 'u-t1', 'name': 'Tia Admin', 'email': 'tia@test.rx', 'username': 'tia', 'role': 'admin', ...user}));
    await auth.signOut();
    cloud.login = null; // offline from now on
  }

  test('offline: the password this device remembers, by email or username; never someone else\'s', () async {
    await signedInOnce();
    expect(await auth.restore(), isNull, reason: 'signed out');
    expect((await auth.signIn(email: 'tia@test.rx', password: 'wrong') as SignInFailed).message, 'Wrong email or password.');
    final s = (await auth.signIn(email: 'TIA', password: 'tia-pass') as SignedIn).session;
    expect((s.userId, s.tenant, s.token, s.pharmacy), ('u-t1', 't1', 'tok-t1', 'Pharmacy t1'), reason: 'the link to the pharmacy is kept after signing out');
    expect((await auth.signIn(email: 'ben@test.rx', password: 'x') as SignInFailed).message, contains('first sign-in'));
    final kept = await (db.select(db.kv)..where((x) => x.k.equals('device:offline-v1'))).getSingleOrNull();
    expect(kept!.v, isNot(contains('tia-pass')));
  });

  test('offline: not after 30 days; not with two-step sign-in before a code was typed on this device', () async {
    var now = DateTime(2026, 11, 5);
    auth = AuthRepository(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', now: () => now);
    await signedInOnce(user: {'twoFactor': true});
    expect((await auth.signIn(email: 'tia@test.rx', password: 'tia-pass') as SignInFailed).message, contains('two-step sign-in'));
    await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: trustKey('t1', 'u-t1'), v: '1'));
    expect(await auth.signIn(email: 'tia@test.rx', password: 'tia-pass'), isA<SignedIn>());
    now = now.add(const Duration(days: 31));
    expect((await auth.signIn(email: 'tia@test.rx', password: 'tia-pass') as SignInFailed).message, contains('more than 30 days'));
  });

  test('the quick PIN: five tries, then the password is needed', () async {
    await signedInOnce();
    expect(await auth.pinUser('tia@test.rx'), isNull);
    await auth.secrets.setPin('t1', 'u-t1', '4321');
    expect((await auth.pinUser('tia'))!['id'], 'u-t1');
    expect((await auth.signInWithPin('tia', '1111') as SignInFailed).message, 'Wrong PIN. 4 tries left.');
    expect(await auth.signInWithPin('tia', '4321'), isA<SignedIn>());
    for (var i = 0; i < 4; i++) {
      await auth.signInWithPin('tia', '0000');
    }
    expect((await auth.signInWithPin('tia', '0000') as SignInFailed).message, 'Too many wrong PINs. Sign in with your password.');
    expect(await auth.pinUser('tia'), isNull, reason: 'forgotten');
    expect(() => auth.secrets.setPin('t1', 'u-t1', '12'), throwsA(isA<Exception>()));
  });

  test('remember me: without it the next start asks to sign in again; with it, for 30 days', () async {
    var now = DateTime.now();
    auth = AuthRepository(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', now: () => now);
    cloud.login = (_) => (200, ok('t1'));
    await auth.signIn(email: 'tia@test.rx', password: 'p', remember: false);
    expect(await auth.restore(), isNotNull, reason: 'while the app is open');
    expect(await auth.restore(appStart: true), isNull);
    await auth.signIn(email: 'tia@test.rx', password: 'p', remember: true);
    expect(await auth.restore(appStart: true), isNotNull);
    now = now.add(const Duration(days: 31));
    expect(await auth.restore(appStart: true), isNull);
  });

  test('forgotten password: a code by email, then the new password', () async {
    cloud.api['password/forgot'] = (b) => (200, {'message': 'We emailed you a code.', 'hint': 't***@test.rx', 'echo': b});
    cloud.api['password/reset'] = (b) => b['code'] == '123456' ? (200, {'ok': true}) : (400, {'error': 'That code is not right.'});
    final r = await auth.forgotPassword(email: ' Tia@Test.rx ', pharmacy: 'Sample-RX', channel: 'sms');
    expect((r['echo']! as Map)..remove('x'), {'email': 'tia@test.rx', 'tenant': 'sample-rx', 'channel': 'sms'});
    await expectLater(auth.resetPassword(email: 'tia@test.rx', code: '000000', password: 'new-pass-1', channel: 'sms'), throwsA(predicate((e) => '$e' == 'That code is not right.')));
    await auth.resetPassword(email: 'tia@test.rx', code: '123456', password: 'new-pass-1', channel: 'sms');
    expect(cloud.calls.last.$2, {'email': 'tia@test.rx', 'code': '123456', 'password': 'new-pass-1', 'channel': 'sms'});
  });
}
