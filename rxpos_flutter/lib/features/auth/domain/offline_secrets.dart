// Device-bound offline sign-in (src/offline.js, RxPOS security 0.2). Password hashes are not synced to devices; each
// device keeps, only for the people who sign in on it, a slow salted verifier of their password with this device's
// own random salt, and optionally a quick PIN (4–8 digits, five tries, then the password is needed). Nothing here is
// synced or sent to the cloud. A device signs someone in offline only within 30 days of their last sign-in on it
// with the internet.
import 'dart:convert';
import 'dart:isolate';
import 'dart:math';

import '../../../core/rules/passwords.dart';

const offlineDays = 30;
const offlineExpired = 'It has been more than $offlineDays days since you last signed in on this device with the internet. Connect once to sign in again.';
const pinMaxTries = 5;

/// Hashing costs (lowered in tests). The cost used is stored with each verifier, so changing these never locks anyone out.
int passwordIterations = 100000, pinIterations = 310000;

class OfflineError implements Exception {
  const OfflineError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Where the verifiers live (this device's key–value table; a JSON map of "tenant:userId" → entry).
abstract class SecretsStore {
  Future<String?> read();
  Future<void> write(String json);
}

class OfflineSecrets {
  OfflineSecrets(this.store, {DateTime Function()? now, Random? random}) : _now = now ?? DateTime.now, _random = random ?? Random.secure();
  final SecretsStore store;
  final DateTime Function() _now;
  final Random _random;

  static String _slot(String tenant, String userId) => '$tenant:$userId';

  Future<Map<String, Object?>> _all() async {
    try {
      final v = await store.read();
      return v == null ? {} : (jsonDecode(v) as Map).cast<String, Object?>();
    } catch (_) {
      return {};
    }
  }

  Future<void> _save(Map<String, Object?> all) => store.write(jsonEncode(all));

  String _salt() => base64.encode(List<int>.generate(16, (_) => _random.nextInt(256)));

  static Future<String> _hash(String secret, String salt, int iter) => Isolate.run(() => pbkdf2Hex(secret, salt, iterations: iter));

  bool _within(Map e) {
    final at = e['at'];
    return at is! num || _now().millisecondsSinceEpoch - at < offlineDays * 86400000;
  }

  /// Remember a person's password on this device so they can sign in offline later (after any password sign-in).
  Future<void> remember(String tenant, String userId, String password) async {
    if (userId.isEmpty || password.isEmpty) return;
    final salt = _salt();
    final hash = await _hash(password, salt, passwordIterations);
    final all = await _all();
    final e = ((all[_slot(tenant, userId)] as Map?) ?? {}).cast<String, Object?>();
    all[_slot(tenant, userId)] = {...e, 'pw': {'salt': salt, 'iter': passwordIterations, 'hash': hash}, 'at': _now().millisecondsSinceEpoch};
    await _save(all);
  }

  Future<bool> hasOffline(String tenant, String userId) async {
    final e = (await _all())[_slot(tenant, userId)];
    return e is Map && (e['pw'] != null || e['legacy'] != null);
  }

  /// Check a password offline; throws [OfflineError] when the 30 days are up. An older synced hash the device still
  /// holds ([legacyUser]: the user record with hash / salt / algo) is accepted once and replaced by a verifier.
  Future<bool> verify(String tenant, String userId, String password, {Map<String, Object?>? legacyUser}) async {
    final all = await _all();
    final e = (all[_slot(tenant, userId)] as Map?)?.cast<String, Object?>();
    if (e == null) {
      if (legacyUser != null && verifyPassword(legacyUser, password)) {
        await remember(tenant, userId, password);
        return true;
      }
      return false;
    }
    if (!_within(e)) throw const OfflineError(offlineExpired);
    final pw = e['pw'] as Map?;
    if (pw != null && await _hash(password, '${pw['salt']}', (pw['iter'] as num).toInt()) == pw['hash']) return true;
    return false;
  }

  Future<void> forget(String tenant, String userId) async {
    final all = await _all();
    all.remove(_slot(tenant, userId));
    await _save(all);
  }

  Future<bool> hasPin(String tenant, String userId) async => ((await _all())[_slot(tenant, userId)] as Map?)?['pin'] != null;

  Future<void> setPin(String tenant, String userId, String pin) async {
    if (userId.isEmpty || !RegExp(r'^\d{4,8}$').hasMatch(pin)) throw const OfflineError('A PIN is 4 to 8 digits.');
    final salt = _salt();
    final hash = await _hash(pin, salt, pinIterations);
    final all = await _all();
    final e = ((all[_slot(tenant, userId)] as Map?) ?? {}).cast<String, Object?>();
    all[_slot(tenant, userId)] = {...e, 'pin': {'salt': salt, 'iter': pinIterations, 'hash': hash, 'tries': 0}};
    await _save(all);
  }

  Future<void> clearPin(String tenant, String userId) async {
    final all = await _all();
    final e = (all[_slot(tenant, userId)] as Map?)?.cast<String, Object?>();
    if (e == null || e['pin'] == null) return;
    e.remove('pin');
    all[_slot(tenant, userId)] = e;
    await _save(all);
  }

  /// Check a PIN offline: (ok, tries left). After [pinMaxTries] wrong PINs the PIN is forgotten.
  Future<({bool ok, int left})> verifyPin(String tenant, String userId, String pin) async {
    final all = await _all();
    final e = (all[_slot(tenant, userId)] as Map?)?.cast<String, Object?>();
    final p = (e?['pin'] as Map?)?.cast<String, Object?>();
    if (e == null || p == null) return (ok: false, left: 0);
    if (!_within(e)) throw const OfflineError(offlineExpired);
    final ok = await _hash(pin, '${p['salt']}', (p['iter'] as num).toInt()) == p['hash'];
    if (ok) {
      e['pin'] = {...p, 'tries': 0};
    } else {
      final tries = ((p['tries'] as num?) ?? 0).toInt() + 1;
      if (pinMaxTries - tries <= 0) {
        e.remove('pin');
      } else {
        e['pin'] = {...p, 'tries': tries};
      }
      all[_slot(tenant, userId)] = e;
      await _save(all);
      return (ok: false, left: max(0, pinMaxTries - tries));
    }
    all[_slot(tenant, userId)] = e;
    await _save(all);
    return (ok: true, left: pinMaxTries);
  }
}
