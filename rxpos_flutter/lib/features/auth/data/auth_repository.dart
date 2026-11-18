import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:rxpos/core/web/owner_console_stub.dart' if (dart.library.js_interop) 'package:rxpos/core/web/owner_console_web.dart';
import 'package:rxpos/core/web/tab_session_stub.dart' if (dart.library.js_interop) 'package:rxpos/core/web/tab_session_web.dart';
import 'package:rxpos/core/web/web_keep_stub.dart' if (dart.library.js_interop) 'package:rxpos/core/web/web_keep_web.dart';

import 'package:dio/dio.dart';

import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/sync/sync_config.dart';
import '../../../core/sync/sync_engine.dart';
import '../domain/device_unlock.dart';
import '../domain/offline_secrets.dart';
import '../domain/session.dart';

const _sessionKey = 'session';
const _tenantKey = 'tenant';
/// The pharmacy this device is linked to (kept after signing out, like the React app's sync settings), so someone
/// can sign in again without the internet.
const _linkKey = 'link';

/// Whose cloud sign-in token this device holds (audit P2-7).
const _tokenUserKey = 'token-user';
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
/// The cloud's code for "RxPOS owner" in the list of places an account can sign in to.
const ownerChoice = '__owner__';

/// Offered to the owner on the website next to the owner console: the classic RxPOS app (rxposug.com/classic/).
const classicChoice = '__classic__';

/// Where the owner can go after signing in on the website: the owner console, any pharmacy the same email works at
/// (in this app), or the classic app.
List<PharmacyChoice> ownerPlaces(List<PharmacyChoice> pharmacies) => [
      const PharmacyChoice(code: ownerChoice, name: 'RxPOS owner console', role: 'Manage all pharmacies'),
      ...pharmacies,
      const PharmacyChoice(code: classicChoice, name: 'Classic RxPOS app', role: 'The previous app, at rxposug.com/classic/'),
    ];

class AuthRepository {
  AuthRepository({required this.dio, required this.db, required this.cloudUrl, DateTime Function()? now, SystemCheck? check, KeyVault? vault})
      : _now = now ?? DateTime.now,
        secrets = OfflineSecrets(_KvSecrets(db), now: now),
        check = check ?? const NoSystemCheck(),
        vault = vault ?? MemoryVault();

  final Dio dio;
  final AppDatabase db;
  final String cloudUrl;
  final OfflineSecrets secrets;
  /// The system's fingerprint / face / Windows Hello check, and its secure storage (device unlock)
  final SystemCheck check;
  final KeyVault vault;
  final DateTime Function() _now;

  Future<String?> _kv(String k) async => (await (db.select(db.kv)..where((x) => x.k.equals(k))).getSingleOrNull())?.v;
  Future<void> _put(String k, String v) async {
    await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: k, v: v));
    webKeep(k, v); // a browser keeps the sign-in for this tab only
  }

  /// The session kept on the device; one that wasn't "remembered", or is more than 30 days old, asks to sign in again.
  Future<Session?> restore({bool appStart = false}) async {
    final v = await _kv(_sessionKey);
    if (v == null) return null;
    final s = Session.fromJson((jsonDecode(v) as Map).cast<String, Object?>());
    final at = DateTime.tryParse(s.signedInAt);
    if (appStart && ((!s.remember && !tabSignedIn()) || (at != null && _now().difference(at) > rememberFor))) {
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

  /// The owner's key from a sign-in that offered the owner console among the pharmacies (website only).
  String? _ownerToken;

  Future<SignInOutcome> signIn({required String email, required String password, String? pharmacy, String? code, bool remember = true, bool allowSwitch = false}) async {
    final login = email.trim().toLowerCase();
    // the owner's choice of where to go (website only): the owner console, or the classic app
    if (pharmacy == ownerChoice && _ownerToken != null && openOwnerConsole(_ownerToken!)) return const SignInFailed('Opening the owner console…');
    if (pharmacy == classicChoice && openClassicApp()) return const SignInFailed('Opening the classic RxPOS app…');
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
      // the owner console is offered on the website only (it is a page of rxposug.com)
      _ownerToken = kIsWeb && j['ownerToken'] is String ? j['ownerToken'] as String : null;
      final pharmacies = [
        for (final c in (j['choose'] as List).cast<Map>())
          if (c['code'] != ownerChoice) PharmacyChoice(code: '${c['code']}', name: '${c['name']}', role: '${c['role'] ?? ''}'),
      ];
      return ChoosePharmacy(_ownerToken != null ? ownerPlaces(pharmacies) : pharmacies);
    }
    if (j['owner'] is Map && j['token'] == null) {
      // on the website: straight to the owner console (rxposug.com/owner); the apps send the owner there
      // on the website the owner chooses where to go (the owner console or the classic app); the apps send them there
      final token = '${(j['owner'] as Map)['token'] ?? ''}';
      if (kIsWeb && token.isNotEmpty) {
        _ownerToken = token;
        return ChoosePharmacy(ownerPlaces(const []));
      }
      return const SignInFailed('That is the RxPOS owner account. Open rxposug.com/owner in a web browser to manage pharmacies.');
    }
    // a pharmacy the owner keeps on the classic app (owner console → "New RxPOS app on the web" off): on the website its
    // staff go to the classic app, at the pharmacy's address (they sign in there)
    if (kIsWeb && res.statusCode == 200 && j['token'] is String && j['app'] == 'classic' && openClassicApp('${j['slug'] ?? ''}')) {
      return SignInFailed('${j['pharmacy'] ?? 'This pharmacy'} uses the classic RxPOS app: opening it…');
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
      await _put(_tokenUserKey, session.userId); // whose sign-in token the device now holds (audit P2-7)
      await secrets.remember(session.tenant, session.userId, password); // this device can now sign them in offline
      await pruneRevoked(session.tenant, keep: session.userId);
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

  /// Type the password again before changing how you sign in on this device (PIN, device unlock). Checked against this
  /// device's own verifier of the password, so it works offline too; false when wrong or never signed in here.
  Future<bool> reauthenticate(String tenant, String userId, String password) async {
    try {
      if (password.isEmpty) return false;
      // an account this device still holds an older synced hash for (signed in before verifiers) is checked once with it
      final u = (await RecordStore(db).rows('users')).where((x) => x['id'] == userId && x['disabled'] != true).firstOrNull;
      return await secrets.verify(tenant, userId, password, legacyUser: u != null && u['hash'] != null ? u : null);
    } on OfflineError {
      return false;
    }
  }

  /// Set or change the quick PIN, after the password.
  Future<String?> setPin(String tenant, String userId, {required String password, required String pin}) async {
    if (!await reauthenticate(tenant, userId, password)) return 'Wrong password. The PIN was not changed.';
    try {
      await secrets.setPin(tenant, userId, pin);
    } on OfflineError catch (e) {
      return e.message;
    }
    await _audit(tenant, userId, 'Quick PIN set on a device');
    return null;
  }

  /// Remove the quick PIN, after the password.
  Future<String?> clearPin(String tenant, String userId, {required String password}) async {
    if (!await reauthenticate(tenant, userId, password)) return 'Wrong password. The PIN was kept.';
    await secrets.clearPin(tenant, userId);
    await _audit(tenant, userId, 'Quick PIN removed from a device');
    return null;
  }

  /// Turn on device unlock (fingerprint / face / Windows Hello): the password, then the system's own check.
  Future<String?> enableUnlock(String tenant, String userId, {required String password}) async {
    final kind = await check.kind();
    if (kind == UnlockKind.none) return 'This device has no fingerprint, face or Windows Hello set up.';
    if (!await reauthenticate(tenant, userId, password)) return 'Wrong password. ${_cap(unlockName(kind))} was not turned on.';
    if (!await check.confirm('Confirm it is you to turn on ${unlockName(kind)} for RxPOS')) return '${_cap(unlockName(kind))} was not confirmed. Nothing changed.';
    try {
      await secrets.enableUnlock(tenant, userId, vault);
    } on OfflineError catch (e) {
      return e.message;
    } catch (_) {
      return 'This device could not keep the unlock key safely. Use a quick PIN instead.';
    }
    await _audit(tenant, userId, 'Device unlock (${unlockName(kind)}) turned on');
    return null;
  }

  /// Turn off device unlock, after the password.
  Future<String?> disableUnlock(String tenant, String userId, {required String password}) async {
    if (!await reauthenticate(tenant, userId, password)) return 'Wrong password. Device unlock was kept.';
    await secrets.clearUnlock(tenant, userId, vault);
    await _audit(tenant, userId, 'Device unlock turned off');
    return null;
  }

  static String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  /// A note in the pharmacy's audit log (who changed how they sign in; never the PIN or any key).
  Future<void> _audit(String tenant, String userId, String action) async {
    try {
      final u = (await RecordStore(db).rows('users')).where((x) => x['id'] == userId).firstOrNull;
      await RecordStore(db).update((d) => d.audit('${u?['name'] ?? userId}', action, 'this device only'));
    } catch (_) {/* the change itself is done; the log is best effort */}
  }

  /// Forget the PINs and device unlock of people disabled or removed since (learnt from the last sync).
  Future<void> pruneRevoked(String tenant, {String keep = ''}) async {
    final active = {for (final u in await RecordStore(db).rows('users')) if (u['disabled'] != true) '${u['id']}', if (keep.isNotEmpty) keep};
    if (active.isEmpty) return; // nothing synced yet: never forget everyone
    await secrets.prune(tenant, active, vault: vault);
  }

  /// The person whose device unlock this device holds for the typed email or username.
  Future<Map<String, Object?>?> unlockUser(String login) async {
    final held = await link();
    final u = await localUser(login);
    if (held == null || u == null) return null;
    return await secrets.hasUnlock('${held['tenant']}', '${u['id']}') ? u : null;
  }

  /// Sign in with the system's check (fingerprint / face / Windows Hello) for the typed account. Same limits as the PIN:
  /// set up on this device after a password sign-in, 30 days offline, two-step sign-in must have trusted this device.
  Future<SignInOutcome> signInWithUnlock(String login, {bool remember = true}) async {
    final held = await link();
    final u = await unlockUser(login);
    if (held == null || u == null) return const SignInFailed('Device unlock is not set up on this device for that account. Use your PIN or password.');
    final tenant = '${held['tenant']}';
    if (u['twoFactor'] == true && !await trusted(tenant, '${u['id']}')) {
      return const SignInFailed('You use two-step sign-in, and this device has not been signed in with your code yet. Use your password.');
    }
    final kind = await check.kind();
    if (kind == UnlockKind.none) return const SignInFailed('No fingerprint, face or Windows Hello is available now. Use your PIN or password.');
    if (!await check.confirm('Unlock RxPOS as ${u['name'] ?? login}')) return const SignInFailed('Not confirmed. Try again, or use your PIN or password.');
    try {
      if (!await secrets.verifyUnlock(tenant, '${u['id']}', vault)) {
        return const SignInFailed('Device unlock could not be checked on this device, so it was turned off. Sign in with your password.');
      }
    } on OfflineError catch (e) {
      return SignInFailed(e.message);
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
      webKeep(_sessionKey, null);
      webKeep(_linkKey, null);
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
    webKeep(_sessionKey, null);
  }

  // ---------- audit P2-7, option 1 (owner's decision, 17 Nov 2026) ----------
  // The device keeps the cloud token of the last person who signed in with their password; someone else unlocking it
  // with a PIN, fingerprint or offline password keeps syncing and selling with it, but confirms with their own password
  // before a call that acts as a person in the cloud (core/network/cloud_api.dart personGuard).

  /// Does [s] use a token that belongs to someone else? (a device from before, with no owner kept, counts as yes)
  Future<bool> borrowedToken(Session s) async => s.token.startsWith('u.') && (await _kv(_tokenUserKey)) != s.userId;

  /// Sign [s]'s person in to the cloud with their own [password]: the device then holds their token (returned).
  Future<String> confirmPerson(Session s, String password) async {
    final u = (await RecordStore(db).rows('users')).where((x) => x['id'] == s.userId).firstOrNull;
    final login = s.email.isNotEmpty ? s.email : '${u?['username'] ?? ''}';
    final Response<Object?> res;
    try {
      res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/login', data: {'email': login, 'password': password, 'tenant': s.tenant}, options: Options(validateStatus: (_) => true));
    } on DioException {
      throw const OfflineError('No connection to the RxPOS cloud. Check the internet.');
    }
    final j = res.data is Map ? (res.data as Map).cast<String, Object?>() : const <String, Object?>{};
    if (j['twoFactor'] == true) throw const OfflineError('You use two-step sign-in: sign out, then sign in with your password and code to do this.');
    final token = j['token'], user = j['user'];
    if (res.statusCode != 200 || token is! String) throw OfflineError('${j['error'] ?? 'Wrong password. Nothing was done.'}');
    if (user is! Map || '${user['id']}' != s.userId) throw const OfflineError('That password signed in a different account. Nothing was done.');
    final stored = await _kv(_sessionKey);
    if (stored != null) await _put(_sessionKey, jsonEncode({...(jsonDecode(stored) as Map).cast<String, Object?>(), 'token': token}));
    await _put(_tokenUserKey, s.userId);
    return token;
  }

  /// A manager approves something on this device (a big refund, 2026-11-18): their quick PIN or the password this device
  /// knows, else a cloud sign-in as them that is closed again at once. True only for the right secret.
  Future<bool> approve(String tenant, String userId, String secret) async {
    if (secret.isEmpty) return false;
    try {
      if (RegExp(r'^\d{4,8}$').hasMatch(secret) && await secrets.hasPin(tenant, userId) && (await secrets.verifyPin(tenant, userId, secret)).ok) return true;
    } on OfflineError {
      // the PIN's window has passed: the password is asked instead
    }
    if (await reauthenticate(tenant, userId, secret)) return true;
    final u = (await RecordStore(db).rows('users')).where((x) => x['id'] == userId && x['disabled'] != true).firstOrNull;
    final login = '${u?['email'] ?? ''}'.isNotEmpty ? '${u!['email']}' : '${u?['username'] ?? ''}';
    if (login.isEmpty) return false;
    try {
      final res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/login', data: {'email': login, 'password': secret, 'tenant': tenant}, options: Options(validateStatus: (_) => true));
      final j = res.data is Map ? (res.data as Map).cast<String, Object?>() : const <String, Object?>{};
      final token = j['token'], user = j['user'];
      if (res.statusCode != 200 || token is! String || user is! Map || '${user['id']}' != userId) return false;
      // the approval's own sign-in is closed straight away
      unawaited(dio.post<Object?>('${syncBase(cloudUrl)}/api/logout', data: const {}, options: Options(headers: {'Authorization': 'Bearer $token'}, validateStatus: (_) => true)).then((_) {}, onError: (_) {}));
      return true;
    } on DioException {
      return false;
    }
  }

  /// Changes waiting to reach the cloud (told when signing out).
  Future<int> unsent() async => (await db.select(db.outbox).get()).length;
}
