// Colour themes (src/themes.js), surface styles (src/surface.js) and the colour level (src/vivid.js). Each theme is a
// light or dark base with its own palette, inspired by well-known open palettes (Nord, Dracula, Catppuccin, Gruvbox,
// Solarized, Tokyo Night, Rosé Pine, One Dark, GitHub Primer) and by pharmacy / clinic brand colours. Every theme is
// made readable when it is applied: text and buttons are moved towards black or white until they pass WCAG AA (4.5:1).
// The owner chooses which themes each pharmacy may use.
import 'dart:math' as math;

import 'package:flutter/material.dart';

class Palette {
  const Palette(this.id, this.name, this.dark,
      {required this.bg, required this.surface, required this.surface2, required this.border, required this.borderStrong, required this.text,
      required this.muted, required this.primary, required this.primary2, required this.sidebar, required this.sidebar2, this.flat = false, this.inspired = ''});
  final String id, name, inspired;
  final bool dark, flat;
  final int bg, surface, surface2, border, borderStrong, text, muted, primary, primary2, sidebar, sidebar2;

  Palette withPrimary(int p1, int p2) => Palette(id, name, dark,
      bg: bg, surface: surface, surface2: surface2, border: border, borderStrong: borderStrong, text: text, muted: muted, primary: p1, primary2: p2,
      sidebar: sidebar, sidebar2: sidebar2, flat: flat, inspired: inspired);
}

const palettes = [
  Palette('light', 'RxPOS Teal', false, bg: 0xFFF3F6F9, surface: 0xFFFFFFFF, surface2: 0xFFF7F9FB, border: 0xFFE4E9EF, borderStrong: 0xFFCFD8E3, text: 0xFF0E1726, muted: 0xFF64748B, primary: 0xFF0D9488, primary2: 0xFF0891B2, sidebar: 0xFF0B1220, sidebar2: 0xFF111A2E),
  Palette('hybrid-light', 'RxPOS Hybrid Light', false, bg: 0xFFF5F8FC, surface: 0xFFFFFFFF, surface2: 0xFFEDF3F7, border: 0xFFE1E8F0, borderStrong: 0xFFCBD6E2, text: 0xFF142638, muted: 0xFF64748B, primary: 0xFF008C58, primary2: 0xFF0E9F96, sidebar: 0xFF07131B, sidebar2: 0xFF0D1C28, flat: true, inspired: 'Adaptive Hybrid'),
  Palette('clinic-blue', 'Clinic Blue', false, bg: 0xFFF2F6FC, surface: 0xFFFFFFFF, surface2: 0xFFF5F8FD, border: 0xFFDFE7F3, borderStrong: 0xFFC6D3E6, text: 0xFF0C1A33, muted: 0xFF5B6B86, primary: 0xFF1D64D8, primary2: 0xFF0EA5E9, sidebar: 0xFF0B1A36, sidebar2: 0xFF12264B),
  Palette('mint', 'Fresh Mint', false, bg: 0xFFF1F8F5, surface: 0xFFFFFFFF, surface2: 0xFFF4FAF7, border: 0xFFDCEBE4, borderStrong: 0xFFC2DBCF, text: 0xFF0F231B, muted: 0xFF5A7468, primary: 0xFF059669, primary2: 0xFF65A30D, sidebar: 0xFF062419, sidebar2: 0xFF0B3324),
  Palette('sunrise', 'Sunrise', false, bg: 0xFFFBF6F1, surface: 0xFFFFFFFF, surface2: 0xFFFDF9F5, border: 0xFFEFE3D6, borderStrong: 0xFFE2CFBB, text: 0xFF2A1A0E, muted: 0xFF7C6553, primary: 0xFFD97706, primary2: 0xFFE11D48, sidebar: 0xFF2A160A, sidebar2: 0xFF3B2010),
  Palette('lavender', 'Lavender', false, bg: 0xFFEFF1F5, surface: 0xFFFFFFFF, surface2: 0xFFF4F5F9, border: 0xFFDCE0E8, borderStrong: 0xFFCCD0DA, text: 0xFF4C4F69, muted: 0xFF6C6F85, primary: 0xFF8839EF, primary2: 0xFF1E66F5, sidebar: 0xFF1E1E2E, sidebar2: 0xFF292A3E, inspired: 'Catppuccin Latte'),
  Palette('rose-dawn', 'Rose Dawn', false, bg: 0xFFFAF4ED, surface: 0xFFFFFAF3, surface2: 0xFFF8EFE6, border: 0xFFEBDFD3, borderStrong: 0xFFDFDAD9, text: 0xFF575279, muted: 0xFF797593, primary: 0xFFB4637A, primary2: 0xFFD7827E, sidebar: 0xFF191724, sidebar2: 0xFF1F1D2E, inspired: 'Rosé Pine Dawn'),
  Palette('solarized-light', 'Solarized Light', false, bg: 0xFFFDF6E3, surface: 0xFFFFFBEF, surface2: 0xFFF6EFDC, border: 0xFFE8DFC6, borderStrong: 0xFFD9CFB3, text: 0xFF073642, muted: 0xFF657B83, primary: 0xFF268BD2, primary2: 0xFF2AA198, sidebar: 0xFF002B36, sidebar2: 0xFF073642, inspired: 'Solarized'),
  Palette('github-light', 'Clean Grey', false, bg: 0xFFF6F8FA, surface: 0xFFFFFFFF, surface2: 0xFFF6F8FA, border: 0xFFD0D7DE, borderStrong: 0xFFAFB8C1, text: 0xFF1F2328, muted: 0xFF59636E, primary: 0xFF0969DA, primary2: 0xFF8250DF, sidebar: 0xFF24292F, sidebar2: 0xFF32383F, inspired: 'GitHub Primer'),
  Palette('nord-snow', 'Nord Snow', false, bg: 0xFFECEFF4, surface: 0xFFFFFFFF, surface2: 0xFFF2F4F8, border: 0xFFD8DEE9, borderStrong: 0xFFC5CCDA, text: 0xFF2E3440, muted: 0xFF4C566A, primary: 0xFF5E81AC, primary2: 0xFF88C0D0, sidebar: 0xFF2E3440, sidebar2: 0xFF3B4252, inspired: 'Nord'),
  Palette('sand', 'Savanna Sand', false, bg: 0xFFF9F5D7, surface: 0xFFFBF1C7, surface2: 0xFFF2E5BC, border: 0xFFE5D5A8, borderStrong: 0xFFD5C4A1, text: 0xFF3C3836, muted: 0xFF665C54, primary: 0xFFAF3A03, primary2: 0xFF79740E, sidebar: 0xFF282828, sidebar2: 0xFF32302F, inspired: 'Gruvbox Light'),
  Palette('coral', 'Coral Care', false, bg: 0xFFFFF5F4, surface: 0xFFFFFFFF, surface2: 0xFFFFF8F7, border: 0xFFF5DEDB, borderStrong: 0xFFECC7C2, text: 0xFF2B1412, muted: 0xFF80605C, primary: 0xFFE8505B, primary2: 0xFFF59E0B, sidebar: 0xFF2B1215, sidebar2: 0xFF3A1A1E),
  Palette('paper', 'High Contrast Light', false, bg: 0xFFFFFFFF, surface: 0xFFFFFFFF, surface2: 0xFFF3F3F3, border: 0xFF9A9A9A, borderStrong: 0xFF555555, text: 0xFF000000, muted: 0xFF333333, primary: 0xFF0050B3, primary2: 0xFF003A80, sidebar: 0xFF000000, sidebar2: 0xFF1A1A1A, inspired: 'accessibility'),
  Palette('dark', 'RxPOS Night', true, bg: 0xFF070B14, surface: 0xFF0F1624, surface2: 0xFF131C2D, border: 0xFF1E293B, borderStrong: 0xFF2B3A52, text: 0xFFE6EDF7, muted: 0xFF8B9AB3, primary: 0xFF2DD4BF, primary2: 0xFF22D3EE, sidebar: 0xFF050912, sidebar2: 0xFF0B1220),
  Palette('hybrid-dark', 'RxPOS Hybrid Dark', true, bg: 0xFF07131B, surface: 0xFF101D2B, surface2: 0xFF162635, border: 0xFF2B3A49, borderStrong: 0xFF3A4C5E, text: 0xFFF3F7FB, muted: 0xFF9BAFC2, primary: 0xFF20C9C3, primary2: 0xFF16A36A, sidebar: 0xFF050E15, sidebar2: 0xFF0A1721, flat: true, inspired: 'Adaptive Hybrid'),
  Palette('tokyo-night', 'Tokyo Night', true, bg: 0xFF16161E, surface: 0xFF1A1B26, surface2: 0xFF1F2335, border: 0xFF292E42, borderStrong: 0xFF3B4261, text: 0xFFC0CAF5, muted: 0xFF7F88B8, primary: 0xFF7AA2F7, primary2: 0xFFBB9AF7, sidebar: 0xFF13131A, sidebar2: 0xFF1A1B26, inspired: 'Tokyo Night'),
  Palette('nord', 'Nord Polar', true, bg: 0xFF242933, surface: 0xFF2E3440, surface2: 0xFF343B49, border: 0xFF3B4252, borderStrong: 0xFF4C566A, text: 0xFFECEFF4, muted: 0xFFA3ADBF, primary: 0xFF88C0D0, primary2: 0xFF81A1C1, sidebar: 0xFF1F232B, sidebar2: 0xFF2A2F3A, inspired: 'Nord'),
  Palette('dracula', 'Dracula', true, bg: 0xFF21222C, surface: 0xFF282A36, surface2: 0xFF2F3241, border: 0xFF383A4A, borderStrong: 0xFF44475A, text: 0xFFF8F8F2, muted: 0xFFA4A8C4, primary: 0xFFBD93F9, primary2: 0xFFFF79C6, sidebar: 0xFF1B1C24, sidebar2: 0xFF22232E, inspired: 'Dracula'),
  Palette('mocha', 'Mocha', true, bg: 0xFF11111B, surface: 0xFF1E1E2E, surface2: 0xFF232336, border: 0xFF313244, borderStrong: 0xFF45475A, text: 0xFFCDD6F4, muted: 0xFF9399B2, primary: 0xFFCBA6F7, primary2: 0xFF89B4FA, sidebar: 0xFF0D0D15, sidebar2: 0xFF181825, inspired: 'Catppuccin Mocha'),
  Palette('gruvbox', 'Gruvbox Ember', true, bg: 0xFF1D2021, surface: 0xFF282828, surface2: 0xFF2F2C2A, border: 0xFF3C3836, borderStrong: 0xFF504945, text: 0xFFEBDBB2, muted: 0xFFA89984, primary: 0xFFFABD2F, primary2: 0xFFFE8019, sidebar: 0xFF161819, sidebar2: 0xFF1D2021, inspired: 'Gruvbox'),
  Palette('solarized-dark', 'Solarized Dark', true, bg: 0xFF00212B, surface: 0xFF002B36, surface2: 0xFF073642, border: 0xFF0B4352, borderStrong: 0xFF1D5361, text: 0xFFE3DDC8, muted: 0xFF93A1A1, primary: 0xFF2AA198, primary2: 0xFF268BD2, sidebar: 0xFF001A22, sidebar2: 0xFF00212B, inspired: 'Solarized'),
  Palette('one-dark', 'One Dark', true, bg: 0xFF1E2127, surface: 0xFF282C34, surface2: 0xFF2E333C, border: 0xFF3A3F4B, borderStrong: 0xFF4B5263, text: 0xFFDCDFE4, muted: 0xFF9DA5B4, primary: 0xFF61AFEF, primary2: 0xFFC678DD, sidebar: 0xFF191C21, sidebar2: 0xFF21252B, inspired: 'Atom One Dark'),
  Palette('github-dark', 'Graphite', true, bg: 0xFF0D1117, surface: 0xFF161B22, surface2: 0xFF1C2129, border: 0xFF30363D, borderStrong: 0xFF484F58, text: 0xFFE6EDF3, muted: 0xFF9198A1, primary: 0xFF58A6FF, primary2: 0xFF3FB950, sidebar: 0xFF010409, sidebar2: 0xFF0D1117, inspired: 'GitHub Primer'),
  Palette('rose-pine', 'Rosé Night', true, bg: 0xFF191724, surface: 0xFF1F1D2E, surface2: 0xFF26233A, border: 0xFF2A273F, borderStrong: 0xFF403D52, text: 0xFFE0DEF4, muted: 0xFF908CAA, primary: 0xFFEBBCBA, primary2: 0xFFC4A7E7, sidebar: 0xFF141220, sidebar2: 0xFF191724, inspired: 'Rosé Pine'),
  Palette('forest', 'Forest Pharmacy', true, bg: 0xFF07130E, surface: 0xFF0D1F17, surface2: 0xFF12281E, border: 0xFF1B3A2C, borderStrong: 0xFF285240, text: 0xFFE3F5EC, muted: 0xFF89B09D, primary: 0xFF34D399, primary2: 0xFFA3E635, sidebar: 0xFF050E0A, sidebar2: 0xFF0A1912),
  Palette('ocean', 'Deep Ocean', true, bg: 0xFF04121F, surface: 0xFF0A1D30, surface2: 0xFF0F263D, border: 0xFF163452, borderStrong: 0xFF22486E, text: 0xFFE2EEFA, muted: 0xFF86A3C0, primary: 0xFF38BDF8, primary2: 0xFF2DD4BF, sidebar: 0xFF030D17, sidebar2: 0xFF071827),
  Palette('midnight-pro', 'Midnight Pro', true, bg: 0xFF0B0F19, surface: 0xFF0F172A, surface2: 0xFF131C31, border: 0xFF1E293B, borderStrong: 0xFF334155, text: 0xFFE2E8F0, muted: 0xFF94A3B8, primary: 0xFF10B981, primary2: 0xFF14B8A6, sidebar: 0xFF020617, sidebar2: 0xFF0B1220, flat: true, inspired: 'Linear / Vercel'),
  Palette('contrast-dark', 'High Contrast Dark', true, bg: 0xFF000000, surface: 0xFF0A0A0A, surface2: 0xFF141414, border: 0xFF7A7A7A, borderStrong: 0xFFBDBDBD, text: 0xFFFFFFFF, muted: 0xFFD6D6D6, primary: 0xFFFFD60A, primary2: 0xFF4CC9F0, sidebar: 0xFF000000, sidebar2: 0xFF0F0F0F, inspired: 'accessibility'),
];

const premiumTheme = 'midnight-pro';

Palette paletteById(String id) => palettes.firstWhere((p) => p.id == id, orElse: () => palettes.first);

/// Themes a pharmacy may use (set by the owner); all of them when the owner hasn't restricted it.
List<Palette> allowedPalettes(Map? branding) {
  final ids = [for (final x in (branding?['themes'] as List?) ?? const []) '$x'];
  return ids.isEmpty ? palettes : palettes.where((p) => ids.contains(p.id)).toList();
}

/// The palette for a light or dark base: Adaptive Hybrid first, then the owner's default, then the first of that base.
String paletteFor(bool dark, [List<Palette> list = palettes, String? preferred]) =>
    (list.where((t) => t.id == 'hybrid-${dark ? 'dark' : 'light'}').firstOrNull ??
            list.where((t) => t.id == preferred && t.dark == dark).firstOrNull ??
            list.where((t) => t.dark == dark).firstOrNull ??
            list.firstOrNull ??
            palettes.first)
        .id;

/// Accent presets: change only the brand / action colour of a palette; status colours never follow the accent.
const accents = [
  ('emerald', 'Emerald', (0xFF008C58, 0xFF0E9F96), (0xFF16A36A, 0xFF20C9C3)),
  ('ocean', 'Ocean Blue', (0xFF1D64D8, 0xFF267BFF), (0xFF267BFF, 0xFF20C9C3)),
  ('violet', 'Violet', (0xFF6D43E0, 0xFF8456F5), (0xFF8456F5, 0xFF267BFF)),
  ('midnight', 'Midnight Turquoise', (0xFF0B7F86, 0xFF13A3A0), (0xFF20C9C3, 0xFF267BFF)),
];

Palette withAccent(Palette p, String accent) {
  final a = accents.where((x) => x.$1 == accent).firstOrNull;
  if (a == null) return p;
  final (p1, p2) = p.dark ? a.$4 : a.$3;
  return p.withPrimary(p1, p2);
}

/// Surface styles: how panels are drawn, independent of the colours.
const surfaceStyles = [
  ('aurora', 'Aurora', 'Soft gradients and frosted panels, in the style of iOS and Linux desktops (standard)'),
  ('flat', 'Flat', 'The plain clean look'),
  ('glass', 'Glassmorphism', 'Frosted, translucent panels'),
  ('clay', 'Claymorphism', 'Soft, puffy, rounded'),
  ('skeuomorphism', 'Skeuomorphism', 'Tactile, with depth and bevels'),
  ('neumorphism', 'Neumorphism', 'Soft extruded, low contrast'),
];

/// Colour level: Calm (soft accents, standard) or Vivid (solid colour tiles; one meaning per colour everywhere).
const colourLevels = [('calm', 'Calm', 'Soft colour accents (standard)'), ('vivid', 'Vivid', 'Solid colour tiles and buttons')];

/// Vivid tiles: a dark-to-darker gradient of each colour so white text keeps AA on every part of it.
const vivid = {
  'teal': (0xFF115E59, 0xFF0F766E),
  'orange': (0xFF9A3412, 0xFFC2410C),
  'violet': (0xFF5B21B6, 0xFF6D28D9),
  'blue': (0xFF1E40AF, 0xFF1D4ED8),
  'amber': (0xFF854D0E, 0xFFA16207),
  'red': (0xFF9F1239, 0xFFBE123C),
  'green': (0xFF065F46, 0xFF047857),
};

// ---- contrast ----
double _lum(int c) {
  double ch(int v) {
    final x = v / 255;
    return x <= 0.03928 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
  }

  return 0.2126 * ch(c >> 16 & 255) + 0.7152 * ch(c >> 8 & 255) + 0.0722 * ch(c & 255);
}

double contrast(int a, int b) {
  final x = _lum(a), y = _lum(b);
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
}

int mix(int a, int b, double t) {
  int ch(int s) => ((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * t).round();
  return 0xFF000000 | ch(16) << 16 | ch(8) << 8 | ch(0);
}

/// Move a colour towards black or white until it reads on every background given.
int readable(int fg, List<int> bgs, int toward, [double min = 4.5]) {
  var c = fg;
  for (var i = 0; i < 30 && bgs.map((b) => contrast(c, b)).reduce(math.min) < min; i++) {
    c = mix(c, toward, 0.06);
  }
  return c;
}

/// The button colours and their text colour (white or dark ink, whichever reads better; deepened until it passes).
({int a, int b, int on}) buttonColours(int p1, int p2, bool dark) {
  const ink = 0xFF0B1220, white = 0xFFFFFFFF;
  double score(int on, int a, int b) => math.min(contrast(on, a), contrast(on, b));
  final on = !dark || score(white, p1, p2) >= score(ink, p1, p2) ? white : ink;
  final toward = on == white ? 0xFF000000 : white;
  var a = p1, b = p2;
  for (var i = 0; i < 30 && score(on, a, b) < 4.5; i++) {
    if (contrast(on, a) < 4.5) a = mix(a, toward, 0.05);
    if (contrast(on, b) < 4.5) b = mix(b, toward, 0.05);
  }
  return (a: a, b: b, on: on);
}

/// The Aurora backdrop behind the app: the page colour with soft glows of the theme's colours ([on] false: plain).
class Backdrop extends ThemeExtension<Backdrop> {
  const Backdrop({this.on = false, this.base = Colors.white, this.glowA = Colors.transparent, this.glowB = Colors.transparent, this.glowC = Colors.transparent});
  final bool on;
  final Color base, glowA, glowB, glowC;
  @override
  Backdrop copyWith({bool? on}) => Backdrop(on: on ?? this.on, base: base, glowA: glowA, glowB: glowB, glowC: glowC);
  @override
  Backdrop lerp(Backdrop? other, double t) => t < .5 ? this : (other ?? this);
}

/// The colour level as screens read it, from the theme's extensions.
class LookLevel extends ThemeExtension<LookLevel> {
  const LookLevel({this.vivid = false});
  final bool vivid;
  @override
  LookLevel copyWith({bool? vivid}) => LookLevel(vivid: vivid ?? this.vivid);
  @override
  LookLevel lerp(LookLevel? other, double t) => t < .5 ? this : (other ?? this);
}

/// The Vivid tile colours for a colour a screen uses (the one closest in hue; teal when none).
(Color, Color) vividFor(Color? c) {
  if (c == null) return (Color(vivid['teal']!.$1), Color(vivid['teal']!.$2));
  final h = HSVColor.fromColor(c).hue;
  var best = 'teal';
  var gap = 999.0;
  for (final e in vivid.entries) {
    final d = (HSVColor.fromColor(Color(e.value.$2)).hue - h).abs();
    final dd = math.min(d, 360 - d);
    if (dd < gap) {
      gap = dd;
      best = e.key;
    }
  }
  return (Color(vivid[best]!.$1), Color(vivid[best]!.$2));
}

/// The Flutter theme for a palette, an accent, a surface style and the colour level.
ThemeData buildTheme(Palette base, {String accent = '', String surface = 'flat', bool vivid = false}) {
  final p = withAccent(base, accent);
  final btn = buttonColours(p.primary, p.primary2, p.dark);
  final muted = readable(p.muted, [p.bg, p.surface, p.surface2], p.dark ? 0xFFFFFFFF : 0xFF000000);
  final primaryText = readable(p.primary, [p.surface, p.surface2], p.dark ? 0xFFFFFFFF : 0xFF000000);
  final scheme = ColorScheme(
    brightness: p.dark ? Brightness.dark : Brightness.light,
    primary: Color(btn.a),
    onPrimary: Color(btn.on),
    primaryContainer: Color(p.dark ? mix(p.primary, 0xFF000000, .55) : mix(p.primary, 0xFFFFFFFF, .84)),
    onPrimaryContainer: Color(p.dark ? mix(p.primary, 0xFFFFFFFF, .25) : mix(p.primary, 0xFF000000, .35)),
    secondary: Color(btn.b),
    onSecondary: Color(btn.on),
    tertiary: Color(primaryText),
    onTertiary: Color(btn.on),
    error: Color(p.dark ? 0xFFF87171 : 0xFFB91C1C),
    onError: Color(p.dark ? 0xFF0B1220 : 0xFFFFFFFF),
    surface: Color(p.surface),
    onSurface: Color(p.text),
    onSurfaceVariant: Color(muted),
    surfaceContainerLowest: Color(p.bg),
    surfaceContainerLow: Color(p.surface2),
    surfaceContainer: Color(p.surface2),
    surfaceContainerHigh: Color(mix(p.surface2, p.dark ? 0xFFFFFFFF : 0xFF000000, .04)),
    surfaceContainerHighest: Color(mix(p.surface2, p.dark ? 0xFFFFFFFF : 0xFF000000, .08)),
    outline: Color(p.borderStrong),
    outlineVariant: Color(p.border),
  );
  final aurora = surface == 'aurora';
  final radius = switch (surface) { 'clay' => 22.0, 'neumorphism' => 18.0, 'glass' || 'aurora' => 16.0, _ => 12.0 };
  final cardColor = switch (surface) {
    'glass' => Color(p.surface).withValues(alpha: p.dark ? .62 : .72),
    'aurora' => Color(p.surface).withValues(alpha: p.dark ? .66 : .78),
    'neumorphism' => Color(p.bg),
    _ => Color(p.surface),
  };
  final side = switch (surface) {
    'flat' => BorderSide(color: Color(p.border)),
    'glass' => BorderSide(color: Color(p.dark ? 0x33FFFFFF : 0x99FFFFFF)),
    'aurora' => BorderSide(color: Color(p.dark ? 0x1FFFFFFF : 0xCCFFFFFF)),
    'skeuomorphism' => BorderSide(color: Color(p.borderStrong), width: 1.2),
    _ => BorderSide.none,
  };
  // figures of equal width everywhere, so amounts line up in lists and totals; headings a little heavier
  const tabular = [FontFeature.tabularFigures()];
  final m3 = ThemeData(useMaterial3: true, brightness: p.dark ? Brightness.dark : Brightness.light).textTheme; // sizes are added by Theme.of
  TextStyle? tab(TextStyle? x, [FontWeight? w]) => x?.copyWith(fontFeatures: tabular, fontWeight: w ?? x.fontWeight);
  final text = m3.copyWith(
    displaySmall: tab(m3.displaySmall, FontWeight.w700),
    headlineLarge: tab(m3.headlineLarge, FontWeight.w800),
    headlineMedium: tab(m3.headlineMedium, FontWeight.w800),
    headlineSmall: tab(m3.headlineSmall, FontWeight.w800),
    titleLarge: tab(m3.titleLarge, FontWeight.w700),
    titleMedium: tab(m3.titleMedium, FontWeight.w600),
    titleSmall: tab(m3.titleSmall, FontWeight.w600),
    bodyLarge: tab(m3.bodyLarge),
    bodyMedium: tab(m3.bodyMedium),
    bodySmall: tab(m3.bodySmall)?.copyWith(color: Color(muted)),
    labelLarge: tab(m3.labelLarge, FontWeight.w600),
    labelMedium: tab(m3.labelMedium, FontWeight.w600),
    labelSmall: tab(m3.labelSmall),
  );
  final control = RoundedRectangleBorder(borderRadius: BorderRadius.circular(aurora ? 12 : 10));
  // Aurora: the main buttons are a gradient of the two brand colours (iOS / GNOME style), flat when disabled
  final gradientFill = !aurora
      ? null
      : (BuildContext _, Set<WidgetState> st, Widget? child) => st.contains(WidgetState.disabled)
          ? child!
          : DecoratedBox(
              decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(btn.a), Color(btn.b)], begin: Alignment.topLeft, end: Alignment.bottomRight)),
              child: child,
            );
  final label = text.labelLarge;
  OutlineInputBorder field(Color c, [double w = 1]) => OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c, width: w));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    extensions: [
      LookLevel(vivid: vivid),
      Backdrop(
        on: aurora,
        base: Color(p.bg),
        glowA: Color(p.primary).withValues(alpha: p.dark ? .20 : .16),
        glowB: Color(p.primary2).withValues(alpha: p.dark ? .16 : .13),
        glowC: Color(p.dark ? 0xFF8B5CF6 : 0xFFA78BFA).withValues(alpha: p.dark ? .12 : .10),
      ),
    ],
    scaffoldBackgroundColor: Color(p.bg),
    dividerColor: Color(p.border),
    cardTheme: CardThemeData(
      color: cardColor,
      surfaceTintColor: Colors.transparent,
      elevation: switch (surface) { 'clay' => 6, 'skeuomorphism' => 3, 'neumorphism' => 4, _ => 0 },
      shadowColor: surface == 'neumorphism' ? Color(p.dark ? 0xFF000000 : 0xFFA3B1C6) : null,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius), side: side),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: aurora ? Color(p.surface).withValues(alpha: p.dark ? .55 : .62) : Color(p.surface),
      foregroundColor: Color(p.text),
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: aurora ? Color(p.border).withValues(alpha: .5) : Color(p.border))),
      titleTextStyle: text.titleLarge?.copyWith(fontSize: 20, fontWeight: FontWeight.w700, color: Color(p.text)),
    ),
    textTheme: text,
    // one look for every text field: outlined, lightly filled, the label always readable, errors in the error colour
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Color(p.dark ? p.surface2 : p.surface),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: field(Color(p.borderStrong)),
      enabledBorder: field(Color(p.borderStrong)),
      focusedBorder: field(scheme.primary, 2),
      errorBorder: field(scheme.error),
      focusedErrorBorder: field(scheme.error, 2),
      disabledBorder: field(Color(p.border)),
      labelStyle: TextStyle(color: Color(muted)),
      floatingLabelStyle: TextStyle(color: Color(primaryText), fontWeight: FontWeight.w600),
      hintStyle: TextStyle(color: Color(muted)),
      prefixIconColor: Color(muted),
      suffixIconColor: Color(muted),
    ),
    // buttons: at least 44 px high (easy to hit on a phone and with a mouse), one corner radius for all of them
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(64, 44), shape: control, textStyle: label, backgroundBuilder: gradientFill)),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(minimumSize: const Size(64, 44), shape: control, textStyle: label)),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(64, 44), shape: control, textStyle: label, side: BorderSide(color: Color(p.borderStrong))),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 40), shape: control, textStyle: label, foregroundColor: Color(primaryText))),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(40, 40))),
    segmentedButtonTheme: SegmentedButtonThemeData(style: SegmentedButton.styleFrom(minimumSize: const Size(48, 40), shape: control, side: BorderSide(color: Color(p.borderStrong)))),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(aurora ? 20 : 8)),
      // the chosen chip (payment method, filter) stands out by its border as well as its fill
      side: WidgetStateBorderSide.resolveWith((st) => BorderSide(color: st.contains(WidgetState.selected) ? scheme.primary : Color(p.borderStrong), width: st.contains(WidgetState.selected) ? 1.5 : 1)),
      labelStyle: text.labelLarge?.copyWith(color: Color(p.text)),
      selectedColor: scheme.primaryContainer,
      checkmarkColor: scheme.onPrimaryContainer,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Color(p.surface),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius + 4)),
      titleTextStyle: text.titleLarge?.copyWith(fontSize: 20, fontWeight: FontWeight.w700, color: Color(p.text)),
    ),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: Color(p.surface), surfaceTintColor: Colors.transparent, showDragHandle: true),
    popupMenuTheme: PopupMenuThemeData(color: Color(p.surface), surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Color(p.border)))),
    menuTheme: MenuThemeData(style: MenuStyle(backgroundColor: WidgetStatePropertyAll(Color(p.surface)), surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent))),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      width: 520,
      backgroundColor: Color(p.dark ? mix(p.surface2, 0xFFFFFFFF, .12) : p.sidebar),
      contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
      actionTextColor: Color(p.dark ? p.primary : mix(p.primary, 0xFFFFFFFF, .45)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: Color(p.dark ? mix(p.surface2, 0xFFFFFFFF, .15) : p.sidebar), borderRadius: BorderRadius.circular(6)),
      textStyle: text.bodySmall?.copyWith(color: Colors.white),
      waitDuration: const Duration(milliseconds: 400),
    ),
    listTileTheme: ListTileThemeData(iconColor: Color(muted), selectedColor: scheme.onPrimaryContainer, selectedTileColor: scheme.primaryContainer),
    dividerTheme: DividerThemeData(color: Color(p.border), space: 1, thickness: 1),
    checkboxTheme: CheckboxThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4))),
    // a clear ring around whatever the keyboard is on (Tab / arrow keys at the till)
    focusColor: scheme.primary.withValues(alpha: p.dark ? .22 : .14),
    scrollbarTheme: ScrollbarThemeData(radius: const Radius.circular(8), thickness: const WidgetStatePropertyAll(8), thumbColor: WidgetStatePropertyAll(Color(p.borderStrong))),
  );
}
