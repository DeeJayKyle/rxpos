import 'package:rxpos/core/web/tab_session_stub.dart' if (dart.library.js_interop) 'package:rxpos/core/web/tab_session_web.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart' show Provider;

import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/entities/people.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/rules/permissions.dart';
import '../data/auth_repository.dart';
import '../data/platform_unlock.dart';
import '../domain/device_unlock.dart';
import '../domain/session.dart';
import 'dart:convert';
import '../../../core/data/device_settings.dart' show deviceValueProvider;

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
      rememberStaff(ref, out.session.tenant, out.session.userId).ignore(); // E9: the sign-in page's recent staff
    }
    return out;
  }

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    ref.read(authTokenProvider.notifier).set(null);
    state = const AsyncData(null);
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

/// UI batch 3, E9 (as src/offline.js rememberStaff): the staff who signed in on this device lately, ids only, newest
/// first, at most 6. Nobody who never signed in here is ever shown.
Future<void> rememberStaff(Ref ref, String tenant, String userId) async {
  if (userId.isEmpty) return;
  final key = 'recent-staff:$tenant';
  final cur = recentStaffOf(await ref.read(deviceValueProvider(key).future));
  await ref.read(deviceValueProvider(key).notifier).set(jsonEncode([userId, ...cur.where((x) => x != userId)].take(6).toList()));
}

List<String> recentStaffOf(String? raw) {
  try {
    return [for (final x in (jsonDecode(raw ?? '[]') as List)) '$x'];
  } catch (_) {
    return const [];
  }
}
