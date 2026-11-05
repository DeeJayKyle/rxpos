import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_choice.dart';
import 'features/sync_status/application/sync_controller.dart';

class RxposApp extends ConsumerWidget {
  const RxposApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(syncControllerProvider); // sync runs while the app is open
    final premium = ref.watch(premiumUiProvider).value ?? false;
    return MaterialApp.router(
      title: 'RxPOS',
      debugShowCheckedModeBanner: false,
      theme: premium ? AppTheme.midnightPro() : AppTheme.light(),
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
