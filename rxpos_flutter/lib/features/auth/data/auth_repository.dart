import 'dart:convert';

import 'package:dio/dio.dart';

import '../../../core/database/app_database.dart';
import '../../../core/sync/sync_config.dart';
import '../../../core/sync/sync_engine.dart';
import '../domain/session.dart';

const _sessionKey = 'session';
const _tenantKey = 'tenant';

/// Signing in to the pharmacy (POST /api/login, same accounts as the React app) and the session kept on the device.
class AuthRepository {
  AuthRepository({required this.dio, required this.db, required this.cloudUrl});

  final Dio dio;
  final AppDatabase db;
  final String cloudUrl;

  Future<Session?> restore() async {
    final row = await (db.select(db.kv)..where((x) => x.k.equals(_sessionKey))).getSingleOrNull();
    return row == null ? null : Session.fromJson((jsonDecode(row.v) as Map).cast<String, Object?>());
  }

  Future<SignInOutcome> signIn({required String email, required String password, String? pharmacy, String? code}) async {
    final Response<Object?> res;
    try {
      res = await dio.post<Object?>('${syncBase(cloudUrl)}/api/login',
          data: {'email': email.trim(), 'password': password, 'tenant': ?pharmacy, if (code != null && code.isNotEmpty) 'otp': code.trim()},
          options: Options(validateStatus: (_) => true));
    } on DioException {
      return const SignInFailed('No connection to the RxPOS cloud. Connect to the internet to sign in.');
    }
    final j = res.data is Map ? (res.data as Map).cast<String, Object?>() : const <String, Object?>{};
    if (j['twoFactor'] == true) return NeedsCode(code == null || code.isEmpty ? null : j['error'] as String?);
    if (j['choose'] is List) {
      return ChoosePharmacy([
        for (final c in (j['choose'] as List).cast<Map>())
          if (c['code'] != '__owner__') PharmacyChoice(code: '${c['code']}', name: '${c['name']}', role: '${c['role']}'),
      ]);
    }
    if (j['owner'] is Map && j['token'] == null) {
      return const SignInFailed('This is the RxPOS owner\'s account. Open the owner console on rxposug.com.');
    }
    if (res.statusCode == 200 && j['token'] is String) {
      final session = Session.fromLogin(j);
      final problem = await _switchTo(session);
      if (problem != null) return SignInFailed(problem);
      await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: _sessionKey, v: jsonEncode(session.toJson())));
      return SignedIn(session);
    }
    return SignInFailed((j['error'] as String?) ?? 'Sign-in failed (${res.statusCode}).');
  }

  /// Signing in to another pharmacy: this device's copy of the old one is cleared first, but never while it has
  /// changes the cloud has not received.
  Future<String?> _switchTo(Session s) async {
    final row = await (db.select(db.kv)..where((x) => x.k.equals(_tenantKey))).getSingleOrNull();
    if (row == null || row.v == s.tenant) {
      await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: _tenantKey, v: s.tenant));
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
      await (db.delete(db.kv)..where((x) => x.k.isIn(['settings', _sessionKey]))).go();
      await SyncConfig(deviceId: cfg.deviceId).save(db);
      await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: _tenantKey, v: s.tenant));
    });
    return null;
  }

  /// Sign out: the pharmacy's records stay on the device (they still sync after the next sign-in).
  Future<void> signOut() => (db.delete(db.kv)..where((x) => x.k.equals(_sessionKey))).go();

}
