// Design tokens: every size, border, shadow, glow, tap target, spacing and font choice a look needs, in one place.
// The theme (themes.dart buildTheme) turns them into Flutter's component themes, and screens that draw their own
// pieces (the till's medicine cards, the backdrop, the hardware status bar) read them from Theme.of(context). A design
// system (design_systems.dart) is a palette + a surface style + one of these; the device's own defaults (a mouse on
// Windows, a finger on Android) come from [DesignTokens.forDevice].
import 'dart:math' as math;

import 'package:flutter/material.dart';

class DesignTokens extends ThemeExtension<DesignTokens> {
  const DesignTokens({
    this.radius = 12,
    this.controlRadius = 10,
    this.chipRadius = 8,
    this.borderWidth = 1,
    this.ink,
    this.hardShadow = 0,
    this.glow,
    this.tapTarget = 44,
    this.gap = 8,
    this.cardPadding = 10,
    this.tileWidth = 230,
    this.tileHeight = 122,
    this.headingWeight = FontWeight.w800,
    this.headingFamily,
    this.headingSpacing = 0,
    this.textScale = 1,
    this.glassAlpha,
    this.backdrop = const [],
    this.glows = const [],
    this.grid,
    this.hud = false,
    this.colorCoded = false,
    this.splitPane = false,
    this.touch = false,
    this.motionMs = 180,
  });

  /// corner radius of cards and panels; of buttons and fields; of chips
  final double radius, controlRadius, chipRadius;
  /// border width of cards, fields and outlined buttons
  final double borderWidth;
  /// a hard border colour (Neo-Brutalist, Bauhaus: black); null: the palette's border
  final Color? ink;
  /// offset of a hard, unblurred shadow under cards and buttons (0: none)
  final double hardShadow;
  /// the glow of focused fields, chosen chips and cards (Nightlife, Retrowave); null: none
  final Color? glow;
  /// the smallest size anything you tap may be
  final double tapTarget;
  /// space between cards; padding inside cards
  final double gap, cardPadding;
  /// the till's medicine cards: widest a card may be, and its height
  final double tileWidth, tileHeight;
  final FontWeight headingWeight;
  /// the headings' font (an editorial serif for Bauhaus); null: the app's font
  final String? headingFamily;
  final double headingSpacing;
  /// body text a little larger (outdoor reading, large tap targets)
  final double textScale;
  /// cards let the backdrop through at this opacity; null: solid
  final double? glassAlpha;
  /// the backdrop: a gradient (top-left → bottom-right) and soft glows of colour; empty: the plain page colour
  final List<Color> backdrop, glows;
  /// lines of a horizon grid over the backdrop (Retrowave); null: none
  final Color? grid;
  /// the hardware status bar (printer, scanner, connection) and its alert banners
  final bool hud;
  /// the till's medicine cards marked with the colour of their therapeutic area
  final bool colorCoded;
  /// the till keeps the sale and payment fully in view beside the medicines (no folding, a wider sale)
  final bool splitPane;
  /// laid out for a finger (Android) rather than a mouse
  final bool touch;
  /// how long page and panel changes take (0 when the device asks for less motion)
  final int motionMs;

  /// The device's own defaults: a finger needs 48 dp targets (Android), a mouse 44 px (Windows).
  static DesignTokens forDevice({required bool touch}) => DesignTokens(touch: touch, tapTarget: touch ? 48 : 44, gap: touch ? 10 : 8);

  /// These tokens on a device: tap targets never below what the device needs.
  DesignTokens onDevice({required bool touch}) => copyWith(touch: touch, tapTarget: math.max(tapTarget, touch ? 48 : 44));

  bool get hasBackdrop => backdrop.isNotEmpty || glows.isNotEmpty;

  @override
  DesignTokens copyWith({
    double? radius, double? controlRadius, double? chipRadius, double? borderWidth, Color? ink, double? hardShadow, Color? glow, double? tapTarget,
    double? gap, double? cardPadding, double? tileWidth, double? tileHeight, FontWeight? headingWeight, String? headingFamily, double? headingSpacing,
    double? textScale, double? glassAlpha, List<Color>? backdrop, List<Color>? glows, Color? grid, bool? hud, bool? colorCoded, bool? splitPane,
    bool? touch, int? motionMs,
  }) =>
      DesignTokens(
        radius: radius ?? this.radius, controlRadius: controlRadius ?? this.controlRadius, chipRadius: chipRadius ?? this.chipRadius,
        borderWidth: borderWidth ?? this.borderWidth, ink: ink ?? this.ink, hardShadow: hardShadow ?? this.hardShadow, glow: glow ?? this.glow,
        tapTarget: tapTarget ?? this.tapTarget, gap: gap ?? this.gap, cardPadding: cardPadding ?? this.cardPadding, tileWidth: tileWidth ?? this.tileWidth,
        tileHeight: tileHeight ?? this.tileHeight, headingWeight: headingWeight ?? this.headingWeight, headingFamily: headingFamily ?? this.headingFamily,
        headingSpacing: headingSpacing ?? this.headingSpacing, textScale: textScale ?? this.textScale, glassAlpha: glassAlpha ?? this.glassAlpha,
        backdrop: backdrop ?? this.backdrop, glows: glows ?? this.glows, grid: grid ?? this.grid, hud: hud ?? this.hud, colorCoded: colorCoded ?? this.colorCoded,
        splitPane: splitPane ?? this.splitPane, touch: touch ?? this.touch, motionMs: motionMs ?? this.motionMs,
      );

  @override
  DesignTokens lerp(DesignTokens? other, double t) => t < .5 ? this : (other ?? this);
}

/// The tokens in force (the defaults when a theme has none).
DesignTokens tokensOf(BuildContext context) => Theme.of(context).extension<DesignTokens>() ?? const DesignTokens();

/// Colours of the therapeutic areas for colour-coded medicine cards (Target Tap): distinct hues, each kept as a stripe
/// beside the name so the name itself keeps full contrast.
const areaColors = <String, Color>{
  'Anti-infectives': Color(0xFF2563EB),
  'Antimalarials': Color(0xFF16A34A),
  'Anti-TB': Color(0xFF0F766E),
  'Antivirals & HIV': Color(0xFFDB2777),
  'Antifungals': Color(0xFF65A30D),
  'Antiparasitics & deworming': Color(0xFF92400E),
  'Pain, fever & inflammation': Color(0xFFDC2626),
  'Cardiovascular': Color(0xFFBE123C),
  'Diabetes & hormones': Color(0xFF7C3AED),
  'Respiratory & allergy': Color(0xFF0891B2),
  'Gastrointestinal': Color(0xFFD97706),
  'Nervous system & mental health': Color(0xFF4F46E5),
  'Vitamins, minerals & nutrition': Color(0xFFCA8A04),
  'Fluids & electrolytes': Color(0xFF0284C7),
  'Skin': Color(0xFFC2410C),
  'Eye, ear & nose': Color(0xFF0D9488),
  "Women's health & family planning": Color(0xFFC026D3),
  "Urology & men's health": Color(0xFF1D4ED8),
  'Muscle & joint': Color(0xFF9333EA),
  'Medical supplies': Color(0xFF475569),
  'Other': Color(0xFF94A3B8),
};

/// A card border with a hard, unblurred shadow beside it (Neo-Brutalist): the shadow is drawn only outside the card,
/// so it never covers what is on the card.
class HardShadowBorder extends RoundedRectangleBorder {
  const HardShadowBorder({super.side, super.borderRadius, this.offset = 4, this.color = Colors.black});
  final double offset;
  final Color color;

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    if (offset > 0) {
      final card = borderRadius.resolve(textDirection).toRRect(rect);
      final shadow = card.shift(Offset(offset, offset));
      canvas.drawPath(Path.combine(PathOperation.difference, Path()..addRRect(shadow), Path()..addRRect(card)), Paint()..color = color);
    }
    super.paint(canvas, rect, textDirection: textDirection);
  }

  @override
  HardShadowBorder copyWith({BorderSide? side, BorderRadiusGeometry? borderRadius}) =>
      HardShadowBorder(side: side ?? this.side, borderRadius: borderRadius ?? this.borderRadius, offset: offset, color: color);

  @override
  ShapeBorder scale(double t) => HardShadowBorder(side: side.scale(t), borderRadius: borderRadius * t, offset: offset * t, color: color);
}
