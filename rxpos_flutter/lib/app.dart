import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/data/device_settings.dart';
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
    final zoom = double.tryParse(ref.watch(deviceValueProvider(zoomKey)).value ?? '') ?? 1;
    final rotation = ref.watch(deviceValueProvider(rotationKey)).value ?? 'auto';
    if (!kIsWeb && Platform.isAndroid) {
      SystemChrome.setPreferredOrientations(switch (rotation) {
        'portrait' => const [DeviceOrientation.portraitUp],
        'landscape' => const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight],
        _ => const <DeviceOrientation>[],
      });
    }
    return MaterialApp.router(
      builder: (context, child) => zoom == 1 ? child! : MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(zoom)), child: child!),
      title: 'RxPOS',
      debugShowCheckedModeBanner: false,
      theme: premium ? AppTheme.midnightPro() : AppTheme.light(),
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
