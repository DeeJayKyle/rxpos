// RxPOS next-gen look (2026-11-13), the same as the web app's src/styles/rxpos-nextgen.css: Bento grid cards,
// typography-led minimalism, True OLED Dark ('oled': a pitch-black #000000 canvas, raised #0B0E14 cards, white
// 1 px hairlines at 10 %, bio-teal #2DD4BF) and Daylight Clinical ('daylight-clinical': #F5F7FA canvas, #FFFFFF
// cards, clinical teal #0D9488). The palettes themselves are in core/theme/themes.dart with every other palette;
// here are the shared measures and the flat bento tokens those two palettes use whatever surface style is chosen
// (glows and frosted panels would light up an OLED screen's black).
import 'package:flutter/material.dart';

import '../core/theme/design_tokens.dart';

/// The palette ids (also in src/themes.js)
const oledPaletteId = 'oled';
const daylightClinicalPaletteId = 'daylight-clinical';
const nextGenPalettes = {oledPaletteId, daylightClinicalPaletteId};

/// Bento measures
const double kBentoRadius = 18;
const double kBentoRadiusLarge = 20;
const double kBentoGap = 16;
const double kMinTouch = 48; // WCAG / Material minimum touch target
/// The counter layout switches to the wide split screen at this width (Windows, landscape tablets)
const double kWideCounter = 900;

/// Flat bento tokens for the two next-gen palettes: 18 px corners, hairlines, no glow, no translucency
DesignTokens nextGenTokens({required bool dark}) => DesignTokens(
      radius: kBentoRadius,
      controlRadius: 12,
      chipRadius: 20,
      tapTarget: kMinTouch,
      gap: 12,
      cardPadding: 14,
      headingWeight: FontWeight.w700,
      headingSpacing: -0.2,
    );

/// Hairline borders of the two palettes
const oledHairline = Color(0x1AFFFFFF); // rgba(255, 255, 255, 0.10)
const daylightHairline = Color(0x140F172A); // rgba(15, 23, 42, 0.08)

/// Figures of equal width: UGX amounts, change, stock counts line up (the app's text theme already uses them; this is
/// for a TextStyle built by hand)
TextStyle tabular(TextStyle? s) => (s ?? const TextStyle()).copyWith(fontFeatures: const [FontFeature.tabularFigures(), FontFeature.liningFigures()]);

/// The tight uppercase micro-label of clinical metadata (batch, expiry): 11 px, 0.06 em
TextStyle microLabel(BuildContext context) => TextStyle(
      fontSize: 11,
      letterSpacing: 11 * 0.06,
      fontWeight: FontWeight.w700,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
