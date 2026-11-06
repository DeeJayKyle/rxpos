import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../presentation/app_shell.dart';
import '../presentation/screens.dart';

part 'app_router.g.dart';

/// Same paths as the React app, so links and habits carry over.
abstract final class Routes {
  static const signIn = '/sign-in';
  static const home = '/';
  static const pos = '/pos';
  static const wholesale = '/pos/wholesale';
  static const addStock = '/add-stock';
  static const sync = '/sync';
}

/// Notifies the router when the session changes (sign in / sign out).
class _SessionListenable extends ChangeNotifier {
  void ping() => notifyListeners();
}

@Riverpod(keepAlive: true)
GoRouter appRouter(Ref ref) {
  final refresh = _SessionListenable();
  ref.listen(sessionControllerProvider, (_, _) => refresh.ping());
  return GoRouter(
    initialLocation: Routes.home,
    refreshListenable: refresh,
    redirect: (_, state) {
      final s = ref.read(sessionControllerProvider);
      if (s.isLoading) return null;
      final signedIn = s.value != null;
      if (!signedIn) return state.matchedLocation == Routes.signIn ? null : Routes.signIn;
      if (state.matchedLocation == Routes.signIn) return Routes.home;
      return null;
    },
    routes: [
      GoRoute(path: Routes.signIn, builder: (_, _) => const SignInScreen()),
      ShellRoute(
        builder: (_, state, child) => AppShell(location: state.matchedLocation, child: child),
        routes: [for (final s in screens) GoRoute(path: s.path, builder: (_, st) => s.builder(st.uri.queryParameters))],
      ),
    ],
  );
}
