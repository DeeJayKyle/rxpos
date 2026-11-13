import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../presentation/app_shell.dart';
import '../presentation/nav_history.dart';
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

/// Is [path] one of the app's pages (or sign-in)?
bool knownPage(String path) => path == Routes.signIn || screens.any((s) => s.path == path);

/// Notifies the router when the session changes (sign in / sign out).
class _SessionListenable extends ChangeNotifier {
  void ping() => notifyListeners();
}

@Riverpod(keepAlive: true)
GoRouter appRouter(Ref ref) {
  final refresh = _SessionListenable();
  ref.listen(sessionControllerProvider, (_, _) => refresh.ping());
  final history = ref.read(navHistoryProvider);
  final router = GoRouter(
    initialLocation: Routes.home,
    refreshListenable: refresh,
    redirect: (_, state) {
      final s = ref.read(sessionControllerProvider);
      if (s.isLoading) return null;
      final signedIn = s.value != null;
      if (!signedIn) return state.matchedLocation == Routes.signIn ? null : Routes.signIn;
      if (state.matchedLocation == Routes.signIn) return Routes.home;
      // an address the app has no page for (a pharmacy's own address bookmarked from the classic app, /pharmcare):
      // the dashboard
      if (!knownPage(state.uri.path)) return Routes.home;
      return null;
    },
    routes: [
      GoRoute(path: Routes.signIn, builder: (_, _) => const SignInScreen()),
      ShellRoute(
        navigatorKey: shellNavigatorKey,
        builder: (_, state, child) => AppShell(location: state.matchedLocation, child: child),
        // pages glide (iOS): a new page slides in from the right over the old one drifting left, Back slides the
        // other way, the bottom tabs cross-fade; none when the device asks for less motion
        routes: [
          for (final s in screens)
            GoRoute(
              path: s.path,
              pageBuilder: (ctx, st) {
                final still = MediaQuery.maybeDisableAnimationsOf(ctx) ?? false;
                final time = still ? Duration.zero : navDuration(history.motion);
                return CustomTransitionPage<void>(
                  key: st.pageKey,
                  child: s.builder(st.uri.queryParameters),
                  transitionDuration: time,
                  reverseTransitionDuration: time,
                  transitionsBuilder: (_, a, b, child) => GlideTransition(primary: a, secondary: b, history: history, child: child),
                );
              },
            ),
        ],
      ),
    ],
  );
  // the session's page history (Back, Android's back button, the edge swipe, Alt+← / →) and how pages move
  void moved() => history.visited(router.routerDelegate.currentConfiguration.uri.toString());
  router.routerDelegate.addListener(moved);
  ref.onDispose(() => router.routerDelegate.removeListener(moved));
  return router;
}
