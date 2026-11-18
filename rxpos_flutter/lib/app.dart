import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rxpos/core/platform.dart';
import 'package:rxpos/core/web/classic_gate.dart';

import 'core/data/device_settings.dart';
import 'core/theme/line_colors.dart' show TableDensity;
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
    final preview = ref.watch(themePreviewProvider);
    final chosen = preview != null && allowed.any((p) => p.id == preview) ? preview : allowed.any((p) => p.id == look.theme) ? look.theme : (allowed.firstOrNull ?? palettes.first).id;
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
    // a finger on a phone or tablet, including the web app opened on one (there the browser reports the device's platform)
    final touch = kIsWeb
        ? defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS
        : onAndroid || Platform.isIOS;
    var theme = design != null
        ? buildTheme(paletteById(design.palette), surface: design.surface, vivid: look.level == 'vivid', tokens: design.tokens, touch: touch, headingFont: headingFont, bodyFont: bodyFont)
        : buildTheme(paletteById(look.system && preview == null ? paletteFor(false, allowed) : chosen), accent: look.accent, surface: look.surface, vivid: look.level == 'vivid', touch: touch,
            headingFont: headingFont, bodyFont: bodyFont);
    // compact tables (This device): 36 px rows in lists and tables
    final compact = ref.watch(deviceValueProvider(compactTablesKey)).value == '1';
    ThemeData dense(ThemeData t) => !compact ? t : t.copyWith(extensions: [...t.extensions.values, const TableDensity(compact: true)], listTileTheme: t.listTileTheme.copyWith(dense: true, minTileHeight: 36, minVerticalPadding: 2));
    theme = dense(theme);
    // a theme previewed from the theme menu shows whatever the system's mode
    final followSystem = look.system && design == null && preview == null;
    if (crash != null) return MaterialApp(debugShowCheckedModeBanner: false, title: 'RxPOS', theme: theme, home: CrashScreen(error: crash));
    return MaterialApp.router(
      key: ValueKey('app-${ref.watch(appRestartProvider)}'),
      // in a browser that ran the classic RxPOS, its unsent changes go up first (ClassicGate)
      // the zoom multiplies the system's text size (accessibility setting) instead of replacing it
      builder: (context, child) => ClassicGate(child: zoom == 1 ? child! : MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: _zoomed(MediaQuery.textScalerOf(context), zoom)), child: child!)),
      title: 'RxPOS',
      debugShowCheckedModeBanner: false,
      // following the system: its light and dark themes, live when it changes
      theme: theme,
      darkTheme: followSystem ? dense(buildTheme(paletteById(paletteFor(true, allowed)), accent: look.accent, surface: look.surface, vivid: look.level == 'vivid', touch: touch,
          headingFont: headingFont, bodyFont: bodyFont)) : null,
      themeMode: followSystem ? ThemeMode.system : ThemeMode.light,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}

/// The system's text scale times this device's zoom (measured at body size, where Android's scaling is non-linear).
TextScaler _zoomed(TextScaler system, double zoom) => TextScaler.linear(system.scale(_bodySize) / _bodySize * zoom);

const _bodySize = 14.0;
