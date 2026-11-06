import 'dart:convert';

import 'package:dio/dio.dart';

import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/sync/sync_config.dart';
import '../../../core/sync/sync_engine.dart';
import '../domain/offline_secrets.dart';
import '../domain/session.dart';

const _sessionKey = 'session';
const _tenantKey = 'tenant';
/// The pharmacy this device is linked to (kept after signing out, like the React app's sync settings), so someone
/// can sign in again without the internet.
const _linkKey = 'link';
const rememberFor = Duration(days: 30);

String trustKey(String tenant, String userId) => 'device:2fa-ok:$tenant:$userId';

class _KvSecrets implements SecretsStore {
  _KvSecrets(this.db);
  final AppDatabase db;
  static const k = 'device:offline-v1';
  @override
  Future<String?> read() async => (await (db.select(db.kv)..where((x) => x.k.equals(k))).getSingleOrNull())?.v;
  @override
  Future<void> write(String json) => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: k, v: json));
}

/// Signing in to the pharmacy (POST /api/login, same accounts as the React app), offline with this device's own
/// verifier or quick PIN (src/pages/Auth.jsx, src/offline.js), forgotten passwords, and the session kept on the device.
class AuthRepository {
  AuthRepository({required this.dio, required this.db, required this.cloudUrl, DateTime Function()? now}) : _now = now ?? DateTime.now, secrets = OfflineSecrets(_KvSecrets(db), now: now);

  final Dio dio;
  final AppDatabase db;
  final String cloudUrl;
  final OfflineSecrets secrets;
  final DateTime Function() _now;

  Future<String?> _kv(String k) async => (await (db.select(db.kv)..where((x) => x.k.equals(k))).getSingleOrNull())?.v;
  Future<void> _put(String k, String v) => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: k, v: v));

  /// The session kept on the device; one that wasn't "remembered", or is more than 30 days old, asks to sign in again.
  Future<Session?> restore({bool appStart = false}) async {
    final v = await _kv(_sessionKey);
    if (v == null) return null;
    final s = Session.fromJson((jsonDecode(v) as Map).cast<String, Object?>());
    final at = DateTime.tryParse(s.signedInAt);
    if (appStart && (!s.remember || (at != null && _now().difference(at) > rememberFor))) {
      await signOut();
      return null;
    }
    return s;
  }

  /// The pharmacy this device holds: {tenant, slug, pharmacy, token} (null before the first sign-in).
  Future<Map<String, Object?>?> link() async {
    final s = await _kv(_sessionKey) ?? await _kv(_linkKey);
    return s == null ? null : (jsonDecode(s) as Map).cast<String, Object?>();
  }

  /// This device's copy of someone's account (by email or username), if they are not disabled.
  Future<Map<String, Object?>?> localUser(String login) async {
    final e = login.trim().toLowerCase();
    if (e.isEmpty) return null;
    final users = await RecordStore(db).rows('users');
    for (final u in users) {
      if (u['disabled'] == true) continue;
      if ('${u['email'] ?? ''}'.toLowerCase() == e || '${u['username'] ?? ''}'.toLowerCase() == e) return u;
    }
    return null;
  }

  Future<bool> trusted(String tenant, String userId) async => await _kv(trustKey(tenant, userId)) == '1';

  Future<SignInOutcome> signIn({required String email, required String password, String? pharmacy, String? code, bool remember = true, bool allowSwitch = false}) async {
    final login = email.trim().toLowerCase();
    final Response<Object?> res;
    try {
      res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/login',
          data: {'email': login, 'password': password, if (pharmacy != null && pharmacy.isNotEmpty) 'tenant': pharmacy.trim().toLowerCase(), if (code != null && code.isNotEmpty) 'otp': code.trim()},
          options: Options(validateStatus: (_) => true));
    } on DioException {
      return _offline(login, password, remember);
    }
    final j = res.data is Map ? (res.data as Map).cast<String, Object?>() : const <String, Object?>{};
    if (j['twoFactor'] == true) return NeedsCode(code == null || code.isEmpty ? null : j['error'] as String?);
    if (j['choose'] is List) {
      return ChoosePharmacy([
        for (final c in (j['choose'] as List).cast<Map>())
          if (c['code'] != '__owner__') PharmacyChoice(code: '${c['code']}', name: '${c['name']}', role: '${c['role'] ?? ''}'),
      ]);
    }
    if (j['owner'] is Map && j['token'] == null) {
      return const SignInFailed('That is the RxPOS owner account. Open rxposug.com in a web browser to manage pharmacies.');
    }
    if (res.statusCode == 200 && j['token'] is String) {
      final session = Session.fromLogin(j).copyWith(remember: remember);
      final held = await link();
      if (!allowSwitch && held != null && held['tenant'] != null && held['tenant'] != session.tenant) {
        return ConfirmSwitch(pharmacy: session.pharmacy.isNotEmpty ? session.pharmacy : session.slug, current: '${held['pharmacy'] ?? held['slug'] ?? 'another pharmacy'}');
      }
      final problem = await _switchTo(session);
      if (problem != null) return SignInFailed(problem);
      await _put(_sessionKey, jsonEncode(session.toJson()));
      await secrets.remember(session.tenant, session.userId, password); // this device can now sign them in offline
      if (code != null && code.isNotEmpty) await _put(trustKey(session.tenant, session.userId), '1');
      return SignedIn(session);
    }
    final err = (j['error'] as String?) ?? 'Sign-in failed (${res.statusCode}).';
    if (RegExp('more than one pharmacy', caseSensitive: false).hasMatch(err)) return NeedsPharmacyCode(err);
    return SignInFailed(err);
  }

  Session _sessionFor(Map<String, Object?> held, Map<String, Object?> u, bool remember) => Session(
        token: '${held['token'] ?? ''}', tenant: '${held['tenant'] ?? ''}', slug: '${held['slug'] ?? held['tenant'] ?? ''}', pharmacy: '${held['pharmacy'] ?? ''}',
        userId: '${u['id']}', userName: '${u['name'] ?? ''}', email: '${u['email'] ?? ''}', role: '${u['role'] ?? 'cashier'}',
        signedInAt: _now().toUtc().toIso8601String(), remember: remember,
      );

  /// No internet: this device's copy of the account and its own verifier (never the first sign-in on a device).
  Future<SignInOutcome> _offline(String login, String password, bool remember) async {
    final held = await link();
    final u = held == null ? null : await localUser(login);
    if (held == null || u == null) return const SignInFailed('No internet connection. The first sign-in on a device needs the internet to download your pharmacy.');
    final tenant = '${held['tenant']}';
    try {
      if (!await secrets.verify(tenant, '${u['id']}', password, legacyUser: u)) return const SignInFailed('Wrong email or password.');
    } on OfflineError catch (e) {
      return SignInFailed(e.message);
    }
    if (u['twoFactor'] == true && !await trusted(tenant, '${u['id']}')) {
      return const SignInFailed('You use two-step sign-in, and this device has not been signed in with your code yet. Connect to the internet once to sign in here.');
    }
    final s = _sessionFor(held, u, remember);
    await _put(_sessionKey, jsonEncode(s.toJson()));
    return SignedIn(s);
  }

  /// The person whose quick PIN this device holds for the typed email or username.
  Future<Map<String, Object?>?> pinUser(String login) async {
    final held = await link();
    final u = await localUser(login);
    if (held == null || u == null) return null;
    return await secrets.hasPin('${held['tenant']}', '${u['id']}') ? u : null;
  }

  Future<SignInOutcome> signInWithPin(String login, String pin, {bool remember = true}) async {
    final held = await link();
    final u = await pinUser(login);
    if (held == null || u == null) return const SignInFailed('No PIN is set on this device for that account.');
    final tenant = '${held['tenant']}';
    if (u['twoFactor'] == true && !await trusted(tenant, '${u['id']}')) {
      return const SignInFailed('You use two-step sign-in, and this device has not been signed in with your code yet. Use your password.');
    }
    try {
      final r = await secrets.verifyPin(tenant, '${u['id']}', pin);
      if (!r.ok) return SignInFailed(r.left > 0 ? 'Wrong PIN. ${r.left} ${r.left == 1 ? 'try' : 'tries'} left.' : 'Too many wrong PINs. Sign in with your password.');
    } on OfflineError catch (e) {
      return SignInFailed(e.message);
    }
    final s = _sessionFor(held, u, remember);
    await _put(_sessionKey, jsonEncode(s.toJson()));
    return SignedIn(s);
  }

  Future<Map<String, Object?>> _call(String path, [Object? body]) async {
    final Response<Object?> r;
    try {
      r = body == null
          ? await dio.get<Object?>('${syncBase(cloudUrl)}$path', options: Options(validateStatus: (_) => true))
          : await dio.post<Object?>('${syncBase(cloudUrl)}$path', data: body, options: Options(validateStatus: (_) => true));
    } on DioException {
      throw const OfflineError('No connection to the RxPOS cloud. Check the internet.');
    }
    final j = r.data is Map ? (r.data as Map).cast<String, Object?>() : const <String, Object?>{};
    if ((r.statusCode ?? 0) >= 400) throw OfflineError('${j['error'] ?? 'The cloud answered ${r.statusCode}.'}');
    return j;
  }

  /// Send a 6-digit reset code by email or SMS: {hint, message}.
  Future<Map<String, Object?>> forgotPassword({required String email, String? pharmacy, required String channel}) =>
      _call('/api/password/forgot', {'email': email.trim().toLowerCase(), if (pharmacy != null && pharmacy.trim().isNotEmpty) 'tenant': pharmacy.trim().toLowerCase(), 'channel': channel});

  Future<void> resetPassword({required String email, String? pharmacy, required String code, required String password, required String channel}) => _call('/api/password/reset', {
        'email': email.trim().toLowerCase(), if (pharmacy != null && pharmacy.trim().isNotEmpty) 'tenant': pharmacy.trim().toLowerCase(), 'code': code.trim(), 'password': password, 'channel': channel,
      });

  /// Is "Reset with Google" set up in the cloud?
  Future<bool> googleReset() async {
    try {
      return (await _call('/api/google-client'))['clientId'] != null;
    } catch (_) {
      return false;
    }
  }

  /// Signing in to another pharmacy: this device's copy of the old one is cleared first, but never while it has
  /// changes the cloud has not received.
  Future<String?> _switchTo(Session s) async {
    final current = await _kv(_tenantKey);
    if (current == null || current == s.tenant) {
      await _put(_tenantKey, s.tenant);
      return null;
    }
    final waiting = (await db.select(db.outbox).get()).length;
    if (waiting > 0) {
      return 'This device still has $waiting change${waiting == 1 ? '' : 's'} for the pharmacy it was signed in to. '
          'Sign in there again and let them sync before switching pharmacy.';
    }
    final cfg = await SyncConfig.load(db);
    await db.transaction(() async {
      await db.delete(db.records).go();
      await db.delete(db.tombstones).go();
      await db.delete(db.rejectedOps).go();
      await (db.delete(db.kv)..where((x) => x.k.isIn(['settings', _sessionKey, _linkKey]))).go();
      await SyncConfig(deviceId: cfg.deviceId).save(db);
      await _put(_tenantKey, s.tenant);
    });
    return null;
  }

  /// Sign out: the pharmacy's records and unsent changes stay on the device (they sync after the next sign-in); the
  /// link to the pharmacy stays so the team can sign in again offline.
  Future<void> signOut() async {
    final v = await _kv(_sessionKey);
    if (v != null) {
      final s = (jsonDecode(v) as Map).cast<String, Object?>();
      await _put(_linkKey, jsonEncode({'token': s['token'], 'tenant': s['tenant'], 'slug': s['slug'], 'pharmacy': s['pharmacy']}));
    }
    await (db.delete(db.kv)..where((x) => x.k.equals(_sessionKey))).go();
  }

  /// Changes waiting to reach the cloud (told when signing out).
  Future<int> unsent() async => (await db.select(db.outbox).get()).length;
}
