// Device unlock (fingerprint / face / Windows Hello) and changes to how someone signs in: set up only after a password
// sign-in and the password again, one person per device, never someone else's account, the key kept in secure
// storage (never in the database), turned off by failures, revoked accounts and the 30-day limit.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/features/auth/data/auth_repository.dart';
import 'package:rxpos/features/auth/domain/device_unlock.dart';
import 'package:rxpos/features/auth/domain/offline_secrets.dart';
import 'package:rxpos/features/auth/domain/session.dart';

import '../sync/fake_cloud.dart';

/// The system's check, as a test wants it
class FakeCheck implements SystemCheck {
  UnlockKind available = UnlockKind.biometrics;
  bool pass = true;
  final asked = <String>[];
  @override
  Future<UnlockKind> kind() async => available;
  @override
  Future<bool> confirm(String reason) async {
    asked.add(reason);
    return pass;
  }
}

Map<String, Object?> ok(String id, String email) => {
      'token': 'tok-$id', 'tenant': 't1', 'slug': 't1', 'pharmacy': 'Pharmacy t1',
      'user': {'id': id, 'name': id == 'u-tia' ? 'Tia Admin' : 'Ben Cashier', 'email': email, 'role': id == 'u-tia' ? 'admin' : 'cashier'},
    };

void main() {
  setUpAll(() {
    passwordIterations = 50;
    pinIterations = 50;
    unlockIterations = 10;
  });
  late AppDatabase db;
  late FakeCloud cloud;
  late FakeCheck check;
  late MemoryVault vault;
  late AuthRepository auth;
  var now = DateTime(2026, 11, 15);
  setUp(() async {
    now = DateTime(2026, 11, 15);
    db = AppDatabase(NativeDatabase.memory());
    cloud = FakeCloud();
    check = FakeCheck();
    vault = MemoryVault();
    auth = AuthRepository(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com', now: () => now, check: check, vault: vault);
    // Tia and Ben both signed in on this shared device once, with the internet
    cloud.login = (b) => b['email'] == 'tia@test.rx' && b['password'] == 'tia-pass'
        ? (200, ok('u-tia', 'tia@test.rx'))
        : b['email'] == 'ben@test.rx' && b['password'] == 'ben-pass'
            ? (200, ok('u-ben', 'ben@test.rx'))
            : (401, {'error': 'Wrong email or password'});
    await RecordStore(db).update((d) {
      d.put('users', {'id': 'u-tia', 'name': 'Tia Admin', 'email': 'tia@test.rx', 'username': 'tia', 'role': 'admin'});
      d.put('users', {'id': 'u-ben', 'name': 'Ben Cashier', 'email': 'ben@test.rx', 'username': 'ben', 'role': 'cashier'});
    });
    await auth.signIn(email: 'ben@test.rx', password: 'ben-pass');
    await auth.signOut();
    await auth.signIn(email: 'tia@test.rx', password: 'tia-pass');
    await auth.signOut();
    cloud.login = null; // offline from now on
  });
  tearDown(() => db.close());

  test('turning device unlock on needs the password and the system check; then it signs in only that person', () async {
    expect(await auth.enableUnlock('t1', 'u-tia', password: 'wrong'), startsWith('Wrong password'));
    expect(await auth.secrets.hasUnlock('t1', 'u-tia'), isFalse);
    check.pass = false;
    expect(await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass'), contains('not confirmed'));
    check.pass = true;
    expect(await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass'), isNull);
    expect(vault.values.keys, ['rxpos.unlock.t1.u-tia']);
    // the key lives only in secure storage: the database holds its hash, never the key, the PIN or the password
    final kept = (await (db.select(db.kv)..where((x) => x.k.equals('device:offline-v1'))).getSingle()).v;
    expect(kept, isNot(contains(vault.values.values.single)));
    expect(kept, isNot(contains('tia-pass')));

    expect((await auth.unlockUser('tia'))?['id'], 'u-tia');
    expect(await auth.unlockUser('ben@test.rx'), isNull, reason: 'Ben has not turned it on');
    final s = (await auth.signInWithUnlock('tia') as SignedIn).session;
    expect((s.userId, s.role), ('u-tia', 'admin'), reason: 'the same staff identity and role');
    expect(check.asked.last, 'Unlock RxPOS as Tia Admin');
    expect((await auth.signInWithUnlock('ben') as SignInFailed).message, contains('not set up on this device for that account'));
    // the audit log says what changed, never a secret
    final audit = await RecordStore(db).rows('audit');
    expect(audit.map((a) => a['action']), contains('Device unlock (fingerprint or face unlock) turned on'));
  });

  test('one person per device: a fingerprint cannot tell staff apart, so Ben cannot add his to Tia\'s device', () async {
    expect(await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass'), isNull);
    expect(await auth.enableUnlock('t1', 'u-ben', password: 'ben-pass'), contains('only one person per device'));
    expect(await auth.secrets.hasUnlock('t1', 'u-ben'), isFalse);
    expect(await auth.secrets.hasUnlock('t1', 'u-tia'), isTrue, reason: 'Ben cannot remove Tia\'s either');
  });

  test('a failed or cancelled system check never signs in; a key missing from secure storage turns unlock off', () async {
    await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass');
    check.pass = false;
    expect((await auth.signInWithUnlock('tia') as SignInFailed).message, contains('Not confirmed'));
    expect(await auth.restore(), isNull);
    check.pass = true;
    vault.values.clear(); // e.g. the phone was restored from a backup: the Keystore key is gone
    expect((await auth.signInWithUnlock('tia') as SignInFailed).message, contains('turned off'));
    expect(await auth.secrets.hasUnlock('t1', 'u-tia'), isFalse);
    expect(await auth.signIn(email: 'tia', password: 'tia-pass'), isA<SignedIn>(), reason: 'the password still works');
  });

  test('no system check here (the web, nothing enrolled): not offered, and cannot be turned on', () async {
    check.available = UnlockKind.none;
    expect(await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass'), contains('no fingerprint, face or Windows Hello'));
    final web = AuthRepository(dio: cloud.dio(), db: db, cloudUrl: 'https://rxposug.com');
    expect(await web.check.kind(), UnlockKind.none, reason: 'the default (and the web) has none');
  });

  test('the 30-day offline limit and two-step sign-in apply as for the PIN', () async {
    await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass');
    now = now.add(const Duration(days: 31));
    expect((await auth.signInWithUnlock('tia') as SignInFailed).message, contains('more than 30 days'));
  });

  test('turning it off needs the password; a disabled or removed account loses its PIN and unlock at the next sign-in', () async {
    await auth.enableUnlock('t1', 'u-tia', password: 'tia-pass');
    expect(await auth.disableUnlock('t1', 'u-tia', password: 'nope'), startsWith('Wrong password'));
    expect(await auth.secrets.hasUnlock('t1', 'u-tia'), isTrue);
    expect(await auth.disableUnlock('t1', 'u-tia', password: 'tia-pass'), isNull);
    expect(vault.values, isEmpty);

    // Ben sets a PIN (password first), then is disabled by the admin; the change syncs to this device
    expect(await auth.setPin('t1', 'u-ben', password: 'wrong', pin: '2468'), startsWith('Wrong password'));
    expect(await auth.setPin('t1', 'u-ben', password: 'ben-pass', pin: '2468'), isNull);
    await RecordStore(db).update((d) => d.put('users', {'id': 'u-ben', 'name': 'Ben Cashier', 'email': 'ben@test.rx', 'username': 'ben', 'role': 'cashier', 'disabled': true}));
    expect(await auth.pinUser('ben'), isNull, reason: 'a disabled account is not offered at once');
    expect((await auth.signInWithPin('ben', '2468') as SignInFailed).message, contains('No PIN'));
    cloud.login = (b) => (200, ok('u-tia', 'tia@test.rx'));
    await auth.signIn(email: 'tia@test.rx', password: 'tia-pass');
    expect(await auth.secrets.hasPin('t1', 'u-ben'), isFalse, reason: 'forgotten after the next sign-in on the device');
    expect(await auth.secrets.hasOffline('t1', 'u-ben'), isFalse);
    expect(await auth.secrets.hasOffline('t1', 'u-tia'), isTrue);
    expect(await auth.clearPin('t1', 'u-tia', password: 'tia-pass'), isNull, reason: 'nothing to clear is fine');
  });

  test('re-authentication checks this device\'s own verifier, offline too', () async {
    expect(await auth.reauthenticate('t1', 'u-tia', 'tia-pass'), isTrue);
    expect(await auth.reauthenticate('t1', 'u-tia', 'ben-pass'), isFalse, reason: 'not someone else\'s password');
    expect(await auth.reauthenticate('t1', 'u-tia', ''), isFalse);
    now = now.add(const Duration(days: 31));
    expect(await auth.reauthenticate('t1', 'u-tia', 'tia-pass'), isFalse, reason: 'after 30 days offline the internet is needed');
  });
}
