import 'package:rxpos/core/web/tab_session_stub.dart' if (dart.library.js_interop) 'package:rxpos/core/web/tab_session_web.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart' show Provider, Ref;

import '../../../core/data/device_settings.dart';
import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/entities/people.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/rules/permissions.dart';
import '../data/auth_repository.dart';
import '../data/platform_unlock.dart';
import '../domain/device_unlock.dart';
import '../domain/session.dart';

part 'session_controller.g.dart';

/// The system's fingerprint / face / Windows Hello check and secure storage (overridden in tests)
final systemCheckProvider = Provider<SystemCheck>((_) => PlatformCheck());
final keyVaultProvider = Provider<KeyVault>((_) => PlatformVault());

@Riverpod(keepAlive: true)
AuthRepository authRepository(Ref ref) => AuthRepository(
    dio: ref.watch(dioProvider), db: ref.watch(appDatabaseProvider), cloudUrl: ref.watch(appConfigProvider).cloudUrl, check: ref.watch(systemCheckProvider), vault: ref.watch(keyVaultProvider));

/// The signed-in session (restored from the device at start-up, so the till opens without internet).
@Riverpod(keepAlive: true)
class SessionController extends _$SessionController {
  @override
  Future<Session?> build() async {
    final s = await ref.read(authRepositoryProvider).restore(appStart: true);
    ref.read(authTokenProvider.notifier).set(s?.token);
    // E9: this device's recent staff (the apps only): kept when a session is restored or ended, calm moments with no
    // other sign-in writes in flight
    if (s != null && !kIsWeb) await rememberStaff(ref, s).catchError((_) {});
    return s;
  }

  Future<SignInOutcome> signIn({required String email, required String password, String? pharmacy, String? code, bool remember = true, bool allowSwitch = false}) async =>
      _done(await ref.read(authRepositoryProvider).signIn(email: email, password: password, pharmacy: pharmacy, code: code, remember: remember, allowSwitch: allowSwitch));

  Future<SignInOutcome> signInWithPin(String login, String pin, {bool remember = true}) async => _done(await ref.read(authRepositoryProvider).signInWithPin(login, pin, remember: remember));

  Future<SignInOutcome> signInWithUnlock(String login, {bool remember = true}) async => _done(await ref.read(authRepositoryProvider).signInWithUnlock(login, remember: remember));

  SignInOutcome _done(SignInOutcome out) {
    if (out is SignedIn) {
      markTabSignedIn(); // a browser keeps this sign-in for the tab
      ref.read(authTokenProvider.notifier).set(out.session.token);
      state = AsyncData(out.session);
    }
    return out;
  }

  Future<void> signOut() async {
    final was = state.value;
    await ref.read(authRepositoryProvider).signOut();
    ref.read(authTokenProvider.notifier).set(null);
    state = const AsyncData(null);
    if (was != null && !kIsWeb) unawaited(rememberStaff(ref, was).catchError((_) {}));
  }
}

/// What the signed-in person may do: their role's permissions, from the pharmacy's roles (src/access.js).
@riverpod
Stream<Set<String>> permissions(Ref ref) async* {
  final session = await ref.watch(sessionControllerProvider.future);
  if (session == null) {
    yield const {};
    return;
  }
  yield* ref.watch(recordStoreProvider).watch('roles').map((rows) => permissionsOf(rows.map(Role.fromRecord), session.role));
}

/// E9 (1.13; src/components/PinPad.jsx): who signed in on this device lately, newest first, at most 6, names and ids
/// only (never a password or PIN). Kept per pharmacy, on this device only.
String recentStaffKey(String tenant) => 'recent-staff:$tenant';
List<Map<String, Object?>> recentStaffOf(String? raw) {
  try {
    return [for (final x in (jsonDecode(raw ?? '[]') as List)) (x as Map).cast<String, Object?>()].take(6).toList();
  } catch (_) {
    return const [];
  }
}

Future<void> rememberStaff(Ref ref, Session s) async {
  final db = ref.read(appDatabaseProvider);
  final k = 'device:${recentStaffKey(s.tenant)}';
  final old = (await (db.select(db.kv)..where((x) => x.k.equals(k))).getSingleOrNull())?.v;
  final list = recentStaffOf(old).where((x) => x['id'] != s.userId);
  await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: k, v: jsonEncode([{'id': s.userId, 'name': s.userName, 'login': s.email}, ...list].take(6).toList())));
  ref.invalidate(deviceValueProvider(recentStaffKey(s.tenant)));
}
