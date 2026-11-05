import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/entities/people.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/rules/permissions.dart';
import '../data/auth_repository.dart';
import '../domain/session.dart';

part 'session_controller.g.dart';

@Riverpod(keepAlive: true)
AuthRepository authRepository(Ref ref) =>
    AuthRepository(dio: ref.watch(dioProvider), db: ref.watch(appDatabaseProvider), cloudUrl: ref.watch(appConfigProvider).cloudUrl);

/// The signed-in session (restored from the device at start-up, so the till opens without internet).
@Riverpod(keepAlive: true)
class SessionController extends _$SessionController {
  @override
  Future<Session?> build() async {
    final s = await ref.read(authRepositoryProvider).restore();
    ref.read(authTokenProvider.notifier).set(s?.token);
    return s;
  }

  Future<SignInOutcome> signIn({required String email, required String password, String? pharmacy, String? code}) async {
    final out = await ref.read(authRepositoryProvider).signIn(email: email, password: password, pharmacy: pharmacy, code: code);
    if (out is SignedIn) {
      ref.read(authTokenProvider.notifier).set(out.session.token);
      state = AsyncData(out.session);
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
