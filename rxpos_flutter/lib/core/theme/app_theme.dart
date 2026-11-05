import 'package:flutter/material.dart';

/// RxPOS colours: the teal brand (light) and Midnight Pro (dark, #0B0F19 canvas, emerald actions).
class AppTheme {
  static const teal = Color(0xFF0D9488);
  static const midnight = Color(0xFF0B0F19);
  static const emerald = Color(0xFF10B981);

  static ThemeData light() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: teal, surface: const Color(0xFFF8FAFC)),
        visualDensity: VisualDensity.standard,
      );

  static ThemeData midnightPro() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: emerald, brightness: Brightness.dark, surface: const Color(0xFF0F172A)),
        scaffoldBackgroundColor: midnight,
      );
}
