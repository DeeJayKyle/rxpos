import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rxpos/core/platform.dart';
import 'package:rxpos/core/web/classic_gate.dart';

import 'core/data/device_settings.dart';
import 'core/router/app_router.dart';
import 'core/crash/crash_screen.dart';
import 'core/live/live_connection.dart';
import 'core/data/pharmacy_providers.dart';
import 'core/theme/themes.dart';
import 'core/theme/fonts.dart';
import 'core/theme/theme_choice.dart';
import 'features/sync_status/application/sync_controller.dart';

class RxposApp extends ConsumerWidget {
  const RxposApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(syncControllerProvider); // sync runs while the app is open
    ref.watch(liveProvider); // and the live line brings other devices' changes at once
    final look = ref.watch(lookProvider).value ?? const Look();
    final allowed = allowedPalettes(ref.watch(brandingProvider));
    final chosen = allowed.any((p) => p.id == look.theme) ? look.theme : (allowed.firstOrNull ?? palettes.first).id;
    final zoom = double.tryParse(ref.watch(deviceValueProvider(zoomKey)).value ?? '') ?? 1;
    final rotation = ref.watch(deviceValueProvider(rotationKey)).value ?? 'auto';
    if (!kIsWeb && onAndroid) {
      SystemChrome.setPreferredOrientations(switch (rotation) {
        'portrait' => const [DeviceOrientation.portraitUp],
        'landscape' => const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight],
        _ => const <DeviceOrientation>[],
      });
    }
    final crash = ref.watch(appCrashProvider);
    // a design system's palette is always allowed with it; the layout fits the device: a finger on Android, a mouse on Windows
    final design = look.designSystem;
    // this device's fonts (This device → Fonts), used once they are ready
    final (headingFont, bodyFont) = fontsInUse(ref.watch(fontsProvider).value ?? const FontChoice(), ref.watch(loadedFontsProvider));
    final touch = !kIsWeb && (onAndroid || Platform.isIOS);
    final theme = design != null
        ? buildTheme(paletteById(design.palette), surface: design.surface, vivid: look.level == 'vivid', tokens: design.tokens, touch: touch, headingFont: headingFont, bodyFont: bodyFont)
        : buildTheme(paletteById(look.system ? paletteFor(false, allowed) : chosen), accent: look.accent, surface: look.surface, vivid: look.level == 'vivid', touch: touch,
            headingFont: headingFont, bodyFont: bodyFont);
    if (crash != null) return MaterialApp(debugShowCheckedModeBanner: false, title: 'RxPOS', theme: theme, home: CrashScreen(error: crash));
    return MaterialApp.router(
      key: ValueKey('app-${ref.watch(appRestartProvider)}'),
      // in a browser that ran the classic RxPOS, its unsent changes go up first (ClassicGate)
      builder: (context, child) => ClassicGate(child: zoom == 1 ? child! : MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(zoom)), child: child!)),
      title: 'RxPOS',
      debugShowCheckedModeBanner: false,
      // following the system: its light and dark themes, live when it changes
      theme: theme,
      darkTheme: look.system && design == null ? buildTheme(paletteById(paletteFor(true, allowed)), accent: look.accent, surface: look.surface, vivid: look.level == 'vivid', touch: touch,
          headingFont: headingFont, bodyFont: bodyFont) : null,
      themeMode: look.system && design == null ? ThemeMode.system : ThemeMode.light,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
