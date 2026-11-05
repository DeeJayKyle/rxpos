import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/sales_pos/presentation/pos_screen.dart';
import '../../features/stock/presentation/add_stock_screen.dart';
import '../../features/sync_status/presentation/sync_screen.dart';
import '../presentation/app_shell.dart';

part 'app_router.g.dart';

/// Same paths as the React app, so links and habits carry over.
abstract final class Routes {
  static const signIn = '/sign-in';
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
    initialLocation: Routes.pos,
    refreshListenable: refresh,
    redirect: (_, state) {
      final s = ref.read(sessionControllerProvider);
      if (s.isLoading) return null;
      final signedIn = s.value != null;
      if (!signedIn) return state.matchedLocation == Routes.signIn ? null : Routes.signIn;
      if (state.matchedLocation == Routes.signIn) return Routes.pos;
      return null;
    },
    routes: [
      GoRoute(path: Routes.signIn, builder: (_, _) => const SignInScreen()),
      ShellRoute(
        builder: (_, state, child) => AppShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: Routes.pos, builder: (_, _) => const PosScreen(key: ValueKey('retail'))),
          GoRoute(path: Routes.wholesale, builder: (_, _) => const PosScreen(key: ValueKey('wholesale'), wholesale: true)),
          GoRoute(path: Routes.addStock, builder: (_, _) => const AddStockScreen()),
          GoRoute(path: Routes.sync, builder: (_, _) => const SyncScreen()),
        ],
      ),
    ],
  );
}
