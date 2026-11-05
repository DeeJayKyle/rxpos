import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/sales_pos/presentation/pos_screen.dart';
import '../../features/stock/presentation/add_stock_screen.dart';
import '../../features/sync_status/presentation/sync_screen.dart';

part 'app_router.g.dart';

/// Same paths as the React app, so links and habits carry over.
abstract final class Routes {
  static const signIn = '/sign-in';
  static const pos = '/pos';
  static const wholesale = '/pos/wholesale';
  static const addStock = '/add-stock';
  static const sync = '/sync';
}

@Riverpod(keepAlive: true)
GoRouter appRouter(Ref ref) => GoRouter(
      initialLocation: Routes.signIn,
      routes: [
        GoRoute(path: Routes.signIn, builder: (_, _) => const SignInScreen()),
        GoRoute(path: Routes.pos, builder: (_, _) => const PosScreen()),
        GoRoute(path: Routes.wholesale, builder: (_, _) => const PosScreen(wholesale: true)),
        GoRoute(path: Routes.addStock, builder: (_, _) => const AddStockScreen()),
        GoRoute(path: Routes.sync, builder: (_, _) => const SyncScreen()),
      ],
      // Milestone 1 adds the redirect: not signed in → sign-in; signed in → the till.
    );
