// Colour themes (src/themes.js), surface styles (src/surface.js) and the colour level (src/vivid.js). Each theme is a
// light or dark base with its own palette; since Nov 2026 the top 10, three colours each, in three groups. Every theme is
// made readable when it is applied: text and buttons are moved towards black or white until they pass WCAG AA (4.5:1).
// The owner chooses which themes each pharmacy may use.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'design_tokens.dart';
import '../../theme/rxpos_theme.dart';

export 'design_tokens.dart';

/// A theme's shades of its two colours (src/themes.js duoVars), each readable where it is used.
class Duo {
  const Duo({required this.ok, required this.warn, required this.danger, required this.info, required this.violet, required this.pill, required this.pillOn,
      required this.logo2, required this.rowTint, required this.headTint, required this.hues});
  final int ok, warn, danger, info, violet, pill, pillOn, logo2;
  /// table row and heading tints (percent)
  final int rowTint, headTint;
  /// the eight table colours
  final List<int> hues;
}

class Palette {
  const Palette(this.id, this.name, this.dark,
      {required this.bg, required this.surface, required this.surface2, required this.border, required this.borderStrong, required this.text,
      required this.muted, required this.primary, required this.primary2, required this.sidebar, required this.sidebar2, this.flat = false, this.inspired = '', this.sidebarText, this.group = '', this.duo});
  final String id, name, inspired;
  /// the theme menu's group (paletteGroups)
  final String group;
  /// the menu's text colour where the palette sets its own (light menus: Soft Grey, Sage Garden)
  final int? sidebarText;
  final bool dark, flat;
  final int bg, surface, surface2, border, borderStrong, text, muted, primary, primary2, sidebar, sidebar2;
  /// the two-colour shades (src/themes.js duoVars): warnings, table colours and tints, the menu's pill
  final Duo? duo;

  Palette withPrimary(int p1, int p2) => Palette(id, name, dark,
      bg: bg, surface: surface, surface2: surface2, border: border, borderStrong: borderStrong, text: text, muted: muted, primary: p1, primary2: p2,
      sidebar: sidebar, sidebar2: sidebar2, flat: flat, inspired: inspired, sidebarText: sidebarText, group: group, duo: duo);
}

/// The 15 two-colour themes in five sets (17 Nov 2026, the owner's review; generated from src/themes.js, so both apps
/// show the same colours): colour 1 strong (the menu's pill, buttons, headings, warnings), colour 2 the soft page.
const paletteGroups = ['Blues', 'Greens', 'Purples', 'Warm & Lime', 'Dark & Calm'];
const palettes = [
  Palette('electric-blue', 'Electric Blue', false, bg: 0xFFDFE8FF, surface: 0xFFFFFFFF, surface2: 0xFFEFF4FF, border: 0x1F062E99, borderStrong: 0x3D062E99, text: 0xFF020C29, muted: 0xFF676D7F, primary: 0xFF0A4DFF, primary2: 0xFF0942DB, sidebar: 0xFF101A3A, sidebar2: 0xFF0E1632, flat: true, inspired: 'Deep blue menu, bright blue pills', group: 'Blues',
      duo: Duo(ok: 0xFF0945E3, warn: 0xFF062E99, danger: 0xFF03174D, info: 0xFF0944E0, violet: 0xFF083ECC, pill: 0xFF1958FF, pillOn: 0xFFFFFFFF, logo2: 0xFF101A3A, rowTint: 6, headTint: 22, hues: [0xFF0A4DFF, 0xFF101A3A, 0xFF0736B3, 0xFF0D349D, 0xFF0941D9, 0xFF0D152E, 0xFF062A8C, 0xFF0C3EC4])),
  Palette('sky-blue', 'Sky Blue', false, bg: 0xFFE8F5FD, surface: 0xFFFFFFFF, surface2: 0xFFF4FAFE, border: 0x1F227195, borderStrong: 0x3D227195, text: 0xFF091E28, muted: 0xFF6B787E, primary: 0xFF38BDF8, primary2: 0xFF30A3D5, sidebar: 0xFF0C1B2B, sidebar2: 0xFF0A1725, flat: true, inspired: 'Deep navy menu, sky-blue pills', group: 'Blues',
      duo: Duo(ok: 0xFF216E90, warn: 0xFF206A8C, danger: 0xFF11394A, info: 0xFF206C8D, violet: 0xFF216F92, pill: 0xFF38BDF8, pillOn: 0xFF0B1220, logo2: 0xFF0C1B2B, rowTint: 6, headTint: 22, hues: [0xFF257BA1, 0xFF0C1B2B, 0xFF257CA4, 0xFF226C92, 0xFF257DA5, 0xFF0A1622, 0xFF1F6888, 0xFF267CA5])),
  Palette('ocean-cyan', 'Ocean Cyan', false, bg: 0xFFE3F6FA, surface: 0xFFFFFFFF, surface2: 0xFFF1FBFD, border: 0x1F046D7F, borderStrong: 0x3D046D7F, text: 0xFF011D22, muted: 0xFF67777A, primary: 0xFF06B6D4, primary2: 0xFF059DB6, sidebar: 0xFF0B2530, sidebar2: 0xFF092029, flat: true, inspired: 'Deep ocean menu, cyan pills', group: 'Blues',
      duo: Duo(ok: 0xFF067083, warn: 0xFF046D7F, danger: 0xFF023740, info: 0xFF056F81, violet: 0xFF056B7D, pill: 0xFF06B6D4, pillOn: 0xFF0B1220, logo2: 0xFF0B2530, rowTint: 6, headTint: 22, hues: [0xFF067D92, 0xFF0B2530, 0xFF047F94, 0xFF096E82, 0xFF058195, 0xFF091E26, 0xFF036475, 0xFF087B90])),
  Palette('forest-green', 'Forest Green', false, bg: 0xFFDCEFE3, surface: 0xFFFFFFFF, surface2: 0xFFEEF7F1, border: 0x1F12542F, borderStrong: 0x3D12542F, text: 0xFF05160C, muted: 0xFF69736D, primary: 0xFF1E8C4E, primary2: 0xFF1A7843, sidebar: 0xFF0F2419, sidebar2: 0xFF0D1F16, flat: true, inspired: 'Deep green menu, green pills', group: 'Greens',
      duo: Duo(ok: 0xFF17683A, warn: 0xFF12542F, danger: 0xFF092A17, info: 0xFF176D3D, violet: 0xFF17693A, pill: 0xFF2C9359, pillOn: 0xFF0B1220, logo2: 0xFF0F2419, rowTint: 6, headTint: 22, hues: [0xFF1C8449, 0xFF0F2419, 0xFF156237, 0xFF175834, 0xFF1A7742, 0xFF0C1D14, 0xFF114D2B, 0xFF1A6D3E])),
  Palette('emerald-mint', 'Emerald Mint', false, bg: 0xFFE4F7EF, surface: 0xFFFFFFFF, surface2: 0xFFF2FBF7, border: 0x1F0A6F4D, borderStrong: 0x3D0A6F4D, text: 0xFF031E15, muted: 0xFF687873, primary: 0xFF10B981, primary2: 0xFF0E9F6F, sidebar: 0xFF0B221A, sidebar2: 0xFF091D16, flat: true, inspired: 'Deep green menu, emerald pills', group: 'Greens',
      duo: Duo(ok: 0xFF087250, warn: 0xFF0A6F4D, danger: 0xFF053827, info: 0xFF08704F, violet: 0xFF097451, pill: 0xFF10B981, pillOn: 0xFF0B1220, logo2: 0xFF0B221A, rowTint: 6, headTint: 22, hues: [0xFF0A8059, 0xFF0B221A, 0xFF0B825A, 0xFF0E6E4E, 0xFF0B835B, 0xFF091B15, 0xFF096647, 0xFF0E845C])),
  Palette('mint-teal', 'Mint Teal', false, bg: 0xFFCFE6E6, surface: 0xFFFFFFFF, surface2: 0xFFE7F3F3, border: 0x1F095353, borderStrong: 0x3D095353, text: 0xFF021616, muted: 0xFF677373, primary: 0xFF0F8A8A, primary2: 0xFF0D7777, sidebar: 0xFF0F2222, sidebar2: 0xFF0D1D1D, flat: true, inspired: 'Teal on mint, the RxPOS colour', group: 'Greens',
      duo: Duo(ok: 0xFF0A6666, warn: 0xFF095353, danger: 0xFF052929, info: 0xFF0B6B6B, violet: 0xFF0B6767, pill: 0xFF1D9191, pillOn: 0xFF0B1220, logo2: 0xFF0F2222, rowTint: 6, headTint: 22, hues: [0xFF0E8282, 0xFF0F2222, 0xFF0B6161, 0xFF0F5656, 0xFF0D7575, 0xFF0C1B1B, 0xFF084C4C, 0xFF0F6B6B])),
  Palette('royal-purple', 'Royal Purple', false, bg: 0xFFF4F1FD, surface: 0xFFFFFFFF, surface2: 0xFFFAF8FE, border: 0x1F412C8B, borderStrong: 0x3D412C8B, text: 0xFF110C25, muted: 0xFF706D7C, primary: 0xFF6D4AE8, primary2: 0xFF5E40C8, sidebar: 0xFF1E1433, sidebar2: 0xFF1A112C, flat: true, inspired: 'Deep purple menu, violet pills', group: 'Purples',
      duo: Duo(ok: 0xFF5C3EC3, warn: 0xFF412C8B, danger: 0xFF211646, info: 0xFF6041CC, violet: 0xFF573BBA, pill: 0xFF6D4AE8, pillOn: 0xFFFFFFFF, logo2: 0xFF1E1433, rowTint: 4, headTint: 16, hues: [0xFF6D4AE8, 0xFF1E1433, 0xFF4C34A2, 0xFF462F8E, 0xFF5D3FC5, 0xFF181029, 0xFF3C2980, 0xFF553AB2])),
  Palette('lavender', 'Lavender', false, bg: 0xFFE4DCFF, surface: 0xFFFFFFFF, surface2: 0xFFF2EEFF, border: 0x1F46318D, borderStrong: 0x3D46318D, text: 0xFF130D26, muted: 0xFF716E7D, primary: 0xFF7451EB, primary2: 0xFF6446CA, sidebar: 0xFF1F1A33, sidebar2: 0xFF1B162C, flat: true, inspired: 'Violet on lavender', group: 'Purples',
      duo: Duo(ok: 0xFF6144C5, warn: 0xFF46318D, danger: 0xFF231847, info: 0xFF6043C3, violet: 0xFF5D41BC, pill: 0xFF7451EB, pillOn: 0xFFFFFFFF, logo2: 0xFF1F1A33, rowTint: 6, headTint: 22, hues: [0xFF7451EB, 0xFF1F1A33, 0xFF5139A5, 0xFF4A368F, 0xFF6345C8, 0xFF191529, 0xFF402D81, 0xFF5B41B4])),
  Palette('midnight-indigo', 'Midnight Indigo', false, bg: 0xFFE6E6FB, surface: 0xFFFFFFFF, surface2: 0xFFF3F3FD, border: 0x1F373790, borderStrong: 0x3D373790, text: 0xFF0F0F26, muted: 0xFF6F6F7D, primary: 0xFF5B5BF0, primary2: 0xFF4E4ECE, sidebar: 0xFF1B1D2E, sidebar2: 0xFF171928, flat: true, inspired: 'Midnight menu, indigo pills', group: 'Purples',
      duo: Duo(ok: 0xFF4C4CC9, warn: 0xFF373790, danger: 0xFF1B1B48, info: 0xFF4B4BC6, violet: 0xFF4949C0, pill: 0xFF5B5BF0, pillOn: 0xFFFFFFFF, logo2: 0xFF1B1D2E, rowTint: 6, headTint: 22, hues: [0xFF5B5BF0, 0xFF1B1D2E, 0xFF4040A8, 0xFF3B3C8F, 0xFF4D4DCC, 0xFF161725, 0xFF323284, 0xFF4848B6])),
  Palette('amber-gold', 'Amber Gold', false, bg: 0xFFFDF6E3, surface: 0xFFFFFFFF, surface2: 0xFFFEFBF1, border: 0x1F936B01, borderStrong: 0x3D936B01, text: 0xFF271D00, muted: 0xFF7D7766, primary: 0xFFF5B301, primary2: 0xFFD39A01, sidebar: 0xFF241C0A, sidebar2: 0xFF1F1809, flat: true, inspired: 'Deep brown menu, gold pills with dark words', group: 'Warm & Lime',
      duo: Duo(ok: 0xFF856201, warn: 0xFF8A6501, danger: 0xFF4A3600, info: 0xFF846101, violet: 0xFF876201, pill: 0xFFF5B301, pillOn: 0xFF0B1220, logo2: 0xFF241C0A, rowTint: 6, headTint: 22, hues: [0xFF956E01, 0xFF241C0A, 0xFF986F01, 0xFF8D6806, 0xFF996F01, 0xFF1D1608, 0xFF876201, 0xFF976F04])),
  Palette('night-lime', 'Charcoal Lime', false, bg: 0xFFF4F4F0, surface: 0xFFFFFFFF, surface2: 0xFFFAFAF8, border: 0x1F78913F, borderStrong: 0x3D78913F, text: 0xFF202711, muted: 0xFF797D70, primary: 0xFFC8F169, primary2: 0xFFACCF5A, sidebar: 0xFF1F1F2A, sidebar2: 0xFF1B1B24, flat: true, inspired: 'Charcoal menu, lime pills and buttons with dark words', group: 'Warm & Lime',
      duo: Duo(ok: 0xFF617533, warn: 0xFF5E7131, danger: 0xFF3C4820, info: 0xFF5F7231, violet: 0xFF627634, pill: 0xFFC8F169, pillOn: 0xFF0B1220, logo2: 0xFF1F1F2A, rowTint: 4, headTint: 16, hues: [0xFF667A35, 0xFF1F1F2A, 0xFF677C37, 0xFF667842, 0xFF687D37, 0xFF191922, 0xFF677D37, 0xFF677B3B])),
  Palette('charcoal-lime', 'Lime Charcoal', false, bg: 0xFFEEF7D6, surface: 0xFFFFFFFF, surface2: 0xFFF7FBEB, border: 0x1F131319, borderStrong: 0x3D131319, text: 0xFF050507, muted: 0xFF69696A, primary: 0xFF1F1F2A, primary2: 0xFF1B1B24, sidebar: 0xFFC8F169, sidebar2: 0xFFBCE363, flat: true, inspired: 'Lime menu, charcoal pills', sidebarText: 0xFF1F1F2A, group: 'Warm & Lime',
      duo: Duo(ok: 0xFF1D1D28, warn: 0xFF131319, danger: 0xFF09090D, info: 0xFF1B1B25, violet: 0xFF191922, pill: 0xFF1F1F2A, pillOn: 0xFFFFFFFF, logo2: 0xFF14141B, rowTint: 6, headTint: 22, hues: [0xFF1F1F2A, 0xFF667A35, 0xFF16161D, 0xFF667842, 0xFF1A1A24, 0xFF687D37, 0xFF111117, 0xFF525E3D])),
  Palette('navy-teal', 'RxPOS Navy Teal', true, bg: 0xFF0A2233, surface: 0xFF162D3D, surface2: 0xFF203645, border: 0x1AFFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E9EB, muted: 0xFF939DA5, primary: 0xFF14B8A6, primary2: 0xFF119E8F, sidebar: 0xFF0F2A44, sidebar2: 0xFF0D243A, flat: true, inspired: 'Navy and teal: the RxPOS till', group: 'Dark & Calm',
      duo: Duo(ok: 0xFF51CBBD, warn: 0xFF5BCDC1, danger: 0xFFA1E3DB, info: 0xFF53CBBE, violet: 0xFF59CCC0, pill: 0xFF14B8A6, pillOn: 0xFF0B1220, logo2: 0xFF0F2A44, rowTint: 6, headTint: 22, hues: [0xFF0E7F73, 0xFF0F2A44, 0xFF0E8174, 0xFF127175, 0xFF0E8276, 0xFF0C2236, 0xFF0B655B, 0xFF117D79])),
  Palette('steel-blue', 'Steel Blue', false, bg: 0xFFEDF1F6, surface: 0xFFFFFFFF, surface2: 0xFFF6F8FB, border: 0x1F2F4A67, borderStrong: 0x3D2F4A67, text: 0xFF0D141C, muted: 0xFF6E7277, primary: 0xFF4F7CAC, primary2: 0xFF446B94, sidebar: 0xFF161C26, sidebar2: 0xFF131821, flat: true, inspired: 'Slate menu, steel-blue pills: calm for long shifts', group: 'Dark & Calm',
      duo: Duo(ok: 0xFF3F6287, warn: 0xFF2F4A67, danger: 0xFF182534, info: 0xFF3E6085, violet: 0xFF3F638A, pill: 0xFF4A75A2, pillOn: 0xFFFFFFFF, logo2: 0xFF161C26, rowTint: 6, headTint: 22, hues: [0xFF4A75A2, 0xFF161C26, 0xFF375778, 0xFF334C69, 0xFF436992, 0xFF12161E, 0xFF2B445F, 0xFF3E5F84])),
  Palette('sage', 'Sage', false, bg: 0xFFE3EEE1, surface: 0xFFFFFFFF, surface2: 0xFFF1F7F0, border: 0x1F1C4029, borderStrong: 0x3D1C4029, text: 0xFF08110B, muted: 0xFF6B706D, primary: 0xFF2F6B45, primary2: 0xFF285C3B, sidebar: 0xFF18241B, sidebar2: 0xFF151F17, flat: true, inspired: 'Deep sage menu, green pills', group: 'Dark & Calm',
      duo: Duo(ok: 0xFF2D6642, warn: 0xFF1C4029, danger: 0xFF0E2015, info: 0xFF295E3D, violet: 0xFF265637, pill: 0xFF477C5B, pillOn: 0xFFFFFFFF, logo2: 0xFF18241B, rowTint: 6, headTint: 22, hues: [0xFF2F6B45, 0xFF18241B, 0xFF214B30, 0xFF244830, 0xFF285B3B, 0xFF131D16, 0xFF1A3B26, 0xFF285638])),
];
/// Themes retired → the new theme closest to each (a saved choice or an owner's list keeps working).
const retiredPalettes = {
  'daylight-clinical': 'mint-teal',
  'cobalt': 'electric-blue',
  'royal-violet': 'royal-purple',
  'sunrise': 'amber-gold',
  'charcoal-sky': 'steel-blue',
  'lime-studio': 'charcoal-lime',
  'aqua-navy': 'ocean-cyan',
  'cobalt-blue': 'electric-blue',
  'sunny-orange': 'amber-gold',
  'oled': 'navy-teal',
  'midnight-pro': 'navy-teal',
  'light': 'mint-teal',
  'hybrid-light': 'mint-teal',
  'solarized-light': 'mint-teal',
  'clinic-blue': 'sky-blue',
  'mint': 'emerald-mint',
  'rose-dawn': 'amber-gold',
  'sand': 'amber-gold',
  'coral': 'amber-gold',
  'github-light': 'steel-blue',
  'nord-snow': 'electric-blue',
  'soft-grey': 'steel-blue',
  'teal-glass': 'mint-teal',
  'paper': 'mint-teal',
  'dark': 'navy-teal',
  'hybrid-dark': 'navy-teal',
  'tokyo-night': 'navy-teal',
  'nord': 'navy-teal',
  'dracula': 'navy-teal',
  'mocha': 'navy-teal',
  'solarized-dark': 'navy-teal',
  'one-dark': 'navy-teal',
  'rose-pine': 'navy-teal',
  'forest': 'navy-teal',
  'ocean': 'navy-teal',
  'gruvbox': 'navy-teal',
  'github-dark': 'navy-teal',
  'gold-night': 'navy-teal',
  'ember-forge': 'navy-teal',
  'contrast-dark': 'navy-teal',
};

/// A theme id as it is now (a retired one → its replacement).
String currentPaletteId(String id) => retiredPalettes[id] ?? id;

/// The design systems' own palettes (design_systems.dart): used only through a design system, so the owner's choice
/// of themes and the theme list stay those of the React app.
const designPalettes = <Palette>[]; // retired with the design systems (17 Nov 2026)

const premiumTheme = 'navy-teal';

/// A palette by id: one of the 10, a design system's own (some share an old theme's id, e.g. Lavender Dream), or the
/// kept theme a retired id moved to.
Palette paletteById(String id) =>
    palettes.where((p) => p.id == id).firstOrNull ?? designPalettes.where((p) => p.id == id).firstOrNull ?? palettes.where((p) => p.id == currentPaletteId(id)).firstOrNull ?? palettes.first;

/// Themes a pharmacy may use (set by the owner); all of them when the owner hasn't restricted it.
List<Palette> allowedPalettes(Map? branding) {
  final ids = [for (final x in (branding?['themes'] as List?) ?? const []) currentPaletteId('$x')];
  return ids.isEmpty ? palettes : palettes.where((p) => ids.contains(p.id)).toList();
}

/// The palette for a light or dark base: OLED Black / Daylight Clinical first, then Adaptive Hybrid, then the owner's
/// default, then the first of that base (src/themes.js paletteFor).
String paletteFor(bool dark, [List<Palette> list = palettes, String? preferred]) =>
    (list.where((t) => t.id == (dark ? oledPaletteId : daylightClinicalPaletteId)).firstOrNull ??
            list.where((t) => t.id == currentPaletteId(preferred ?? '') && t.dark == dark).firstOrNull ??
            list.where((t) => t.dark == dark).firstOrNull ??
            list.firstOrNull ??
            palettes.first)
        .id;

/// Accent presets: change only the brand / action colour of a palette; status colours never follow the accent.
const accents = <(String, String, (int, int), (int, int))>[]; // retired: only the 15 themes' own colours (17 Nov 2026)

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
/// A dark colour for snack bars and tooltips on light themes: the sidebar's, or the text colour when the sidebar is light
int _ink(Palette p) => _lum(p.sidebar) > .4 ? p.text : p.sidebar;

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
  // whichever reads better (lime, gold and sky buttons take dark ink, as src/themes.js)
  final on = score(white, p1, p2) >= score(ink, p1, p2) ? white : ink;
  final toward = on == white ? 0xFF000000 : white;
  var a = p1, b = p2;
  for (var i = 0; i < 30 && score(on, a, b) < 4.5; i++) {
    if (contrast(on, a) < 4.5) a = mix(a, toward, 0.05);
    if (contrast(on, b) < 4.5) b = mix(b, toward, 0.05);
  }
  return (a: a, b: b, on: on);
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

/// The theme's tones for meanings (src/themes.js duoVars): ok, warn, danger, info and a second accent, each with a soft
/// fill; on the two-colour themes they are shades of the theme's own colour (the owner's choice, 17 Nov 2026), and their
/// words and icons tell them apart. Also the table colours and tints. Read with `context.tones`.
class Tones extends ThemeExtension<Tones> {
  const Tones({required this.ok, required this.warn, required this.danger, required this.info, required this.violet, required this.surface,
      this.hues = const [], this.rowTint = 7, this.headTint = 16});
  final Color ok, warn, danger, info, violet, surface;
  final List<Color> hues;
  final int rowTint, headTint;
  Color soft(Color c, [double a = .14]) => Color.alphaBlend(c.withValues(alpha: a), surface);
  Color get okSoft => soft(ok);
  Color get warnSoft => soft(warn, .18);
  Color get dangerSoft => soft(danger, .2);
  Color get infoSoft => soft(info);
  Color get violetSoft => soft(violet);
  @override
  Tones copyWith() => this;
  @override
  Tones lerp(Tones? other, double t) => t < .5 ? this : (other ?? this);
}

/// The tones of a palette: its two-colour shades, or the classic fixed colours for a design system's own palette.
Tones tonesOf(Palette p) {
  final d = p.duo;
  if (d != null) {
    return Tones(ok: Color(d.ok), warn: Color(d.warn), danger: Color(d.danger), info: Color(d.info), violet: Color(d.violet), surface: Color(p.surface),
        hues: [for (final h in d.hues) Color(h)], rowTint: d.rowTint, headTint: d.headTint);
  }
  return Tones(
    ok: Color(p.dark ? 0xFF34D399 : 0xFF047857), warn: Color(p.dark ? 0xFFFB923C : 0xFFC2410C), danger: Color(p.dark ? 0xFFFB7185 : 0xFFBE123C),
    info: Color(p.dark ? 0xFF60A5FA : 0xFF1D4ED8), violet: Color(p.dark ? 0xFFA78BFA : 0xFF6D28D9), surface: Color(p.surface));
}

extension TonesOfContext on BuildContext {
  /// this theme's tones (ok, warn, danger, info, violet)
  Tones get tones => Theme.of(this).extension<Tones>() ?? tonesOf(palettes.first);
}

/// The menu's colours (src/styles.css .sidebar): the palette's two menu colours top to bottom, its text colour, and the
/// brand colour for the page you are on, as the React app paints them.
class SideColors extends ThemeExtension<SideColors> {
  const SideColors({required this.top, required this.bottom, required this.text, required this.active, required this.dark, Color? pill, Color? pillOn})
      : pill = pill ?? active, pillOn = pillOn ?? (dark ? const Color(0xFF0B1220) : Colors.white);
  final Color top, bottom, text, active;
  /// the open page's solid pill and its words (src/themes.js menuPill)
  final Color pill, pillOn;
  /// a dark menu (light text on it)
  final bool dark;
  @override
  SideColors copyWith({Color? top, Color? bottom, Color? text, Color? active, bool? dark}) =>
      SideColors(top: top ?? this.top, bottom: bottom ?? this.bottom, text: text ?? this.text, active: active ?? this.active, dark: dark ?? this.dark, pill: pill, pillOn: pillOn);
  @override
  SideColors lerp(SideColors? other, double t) => t < .5 ? this : (other ?? this);
}

/// The menu colours of a palette: React's --sidebar-text (#aab6ca on the standard navy) or the palette's own.
SideColors sideColorsOf(Palette p) {
  // a menu takes white words unless it is light (orange, lime, sage: src/themes.js lightMenu)
  final dark = _lum(p.sidebar) <= .22;
  final text = p.sidebarText ?? (dark ? readable(0xFFAAB6CA, [p.sidebar, p.sidebar2], 0xFFFFFFFF) : p.text);
  final active = readable(p.primary, [p.sidebar, p.sidebar2], dark ? 0xFFFFFFFF : 0xFF000000, 3);
  final d = p.duo;
  return SideColors(top: Color(p.sidebar), bottom: Color(p.sidebar2), text: Color(text), active: Color(active), dark: dark,
      pill: d == null ? null : Color(d.pill), pillOn: d == null ? null : Color(d.pillOn));
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

/// The tokens of a surface style (when no design system sets them).
DesignTokens surfaceTokens(String surface, Palette p) => switch (surface) {
      'aurora' => DesignTokens(radius: 16, controlRadius: 12, chipRadius: 20, glassAlpha: p.dark ? .66 : .78, glows: [
          Color(p.primary).withValues(alpha: p.dark ? .20 : .16),
          Color(p.primary2).withValues(alpha: p.dark ? .16 : .13),
          Color(p.dark ? 0xFF8B5CF6 : 0xFFA78BFA).withValues(alpha: p.dark ? .12 : .10),
        ]),
      'glass' => DesignTokens(radius: 16, glassAlpha: p.dark ? .62 : .72),
      'clay' => const DesignTokens(radius: 22, controlRadius: 14, chipRadius: 14),
      'neumorphism' => const DesignTokens(radius: 18, controlRadius: 12, chipRadius: 12),
      _ => const DesignTokens(),
    };

/// The Flutter theme for a palette, an accent, a surface style, the colour level and the design tokens ([tokens]: a
/// design system's; otherwise the surface style's), laid out for a finger ([touch], Android) or a mouse (Windows).
/// [headingFont] and [bodyFont]: this device's chosen fonts (fonts.dart), once they are ready; null keeps the look's own.
ThemeData buildTheme(Palette base, {String accent = '', String surface = 'flat', bool vivid = false, DesignTokens? tokens, bool touch = false,
    String? headingFont, String? bodyFont}) {
  final p = withAccent(base, accent);
  // the next-gen palettes keep their flat bento cards whatever surface style is chosen (no glow on OLED black)
  // the two default themes keep their flat bento cards; the others follow the chosen surface style (as the React app)
  final nextGen = tokens == null && nextGenPalettes.contains(base.id);
  if (nextGen) surface = 'flat';
  final tk = (tokens ?? (nextGen ? nextGenTokens(dark: p.dark) : surfaceTokens(surface, p))).onDevice(touch: touch);
  final btn = buttonColours(p.primary, p.primary2, p.dark);
  final muted = readable(p.muted, [p.bg, p.surface, p.surface2], p.dark ? 0xFFFFFFFF : 0xFF000000);
  // brand-coloured text must also read on the backdrop the translucent panels let through
  // ... and on the tinted page itself (links such as Edit widgets sit on it)
  final behind = [p.surface, p.surface2, p.bg, if (tk.glassAlpha != null) ...tk.backdrop.map((c) => c.toARGB32())];
  final primaryText = readable(p.primary, behind, p.dark ? 0xFFFFFFFF : 0xFF000000);
  final errorColour = p.dark ? 0xFFF87171 : 0xFFB91C1C;
  // a container: a pale (dark themes: deep) tint of [c], its text deepened (lightened) until it passes AA on it
  (Color, Color) box(int c) {
    final bg = p.dark ? mix(c, 0xFF000000, .62) : mix(c, 0xFFFFFFFF, .85);
    final on = readable(p.dark ? mix(c, 0xFFFFFFFF, .6) : mix(c, 0xFF000000, .45), [bg], p.dark ? 0xFFFFFFFF : 0xFF000000);
    return (Color(bg), Color(on));
  }

  final errorBox = box(errorColour), secondaryBox = box(btn.b), tertiaryBox = box(primaryText);
  // snack bars and tooltips: dark ink on light themes, the text colour on dark ones; their text checked against it
  final inverse = p.dark ? p.text : readable(_ink(p), const [0xFFFFFFFF], 0xFF000000);
  final onInverse = readable(p.dark ? p.surface : 0xFFFFFFFF, [inverse], p.dark ? 0xFF000000 : 0xFFFFFFFF);
  final scheme = ColorScheme(
    brightness: p.dark ? Brightness.dark : Brightness.light,
    primary: Color(btn.a),
    onPrimary: Color(btn.on),
    primaryContainer: Color(p.dark ? mix(p.primary, 0xFF000000, .55) : mix(p.primary, 0xFFFFFFFF, .84)),
    onPrimaryContainer: Color(p.dark ? mix(p.primary, 0xFFFFFFFF, .25) : mix(p.primary, 0xFF000000, .35)),
    secondary: Color(btn.b),
    onSecondary: Color(btn.on),
    secondaryContainer: secondaryBox.$1,
    onSecondaryContainer: secondaryBox.$2,
    tertiary: Color(primaryText),
    onTertiary: Color(btn.on),
    tertiaryContainer: tertiaryBox.$1,
    onTertiaryContainer: tertiaryBox.$2,
    error: Color(errorColour),
    onError: Color(p.dark ? 0xFF0B1220 : 0xFFFFFFFF),
    errorContainer: errorBox.$1,
    onErrorContainer: errorBox.$2,
    inverseSurface: Color(inverse),
    onInverseSurface: Color(onInverse),
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
  final glass = tk.glassAlpha != null && tk.hasBackdrop;
  // iOS-like grouped cards: rounded at least 14 (designs that are square or nearly so on purpose keep their corners)
  final radius = tk.radius >= 10 ? math.max(tk.radius, 14.0) : tk.radius;
  // see-through panels over the backdrop: a light veil on deep colours (Sunset), the panel colour elsewhere
  final cardColor = tk.glassAlpha != null
      ? (p.dark && tk.glassAlpha! < .3 ? Colors.white.withValues(alpha: tk.glassAlpha!) : Color(p.surface).withValues(alpha: tk.glassAlpha!))
      : surface == 'neumorphism'
          ? Color(p.bg)
          : Color(p.surface);
  final edge = tk.ink ?? tk.glow?.withValues(alpha: .55);
  final side = edge != null
      ? BorderSide(color: edge, width: tk.borderWidth)
      : switch (surface) {
          'flat' => BorderSide(color: Color(p.border), width: tk.borderWidth),
          'glass' || 'aurora' => BorderSide(color: Color(p.dark ? 0x1FFFFFFF : 0xCCFFFFFF)),
          'skeuomorphism' => BorderSide(color: Color(p.borderStrong), width: 1.2),
          _ => BorderSide.none,
        };
  // figures of equal width everywhere, so amounts line up in lists and totals; headings in the design's weight and font
  const tabular = [FontFeature.tabularFigures(), FontFeature.liningFigures()]; // lining: 0 never looks like o (old-style fonts such as Playfair)
  final m3 = ThemeData(useMaterial3: true, brightness: p.dark ? Brightness.dark : Brightness.light).textTheme; // sizes are added by Theme.of
  TextStyle? tab(TextStyle? x, [FontWeight? w]) => x?.copyWith(fontFeatures: tabular, fontWeight: w ?? x.fontWeight, fontFamily: bodyFont);
  final headFamily = headingFont ?? tk.headingFamily;
  TextStyle? head(TextStyle? x, [FontWeight? w]) => tab(x, w ?? tk.headingWeight)
      ?.copyWith(fontFamily: headFamily, fontFamilyFallback: headFamily == null || headingFont != null ? null : const ['Georgia', 'Noto Serif', 'serif'], letterSpacing: tk.headingSpacing);
  TextStyle? body(TextStyle? x) => tk.textScale == 1 || x?.fontSize == null ? tab(x) : tab(x)?.copyWith(fontSize: x!.fontSize! * tk.textScale);
  final text = m3.copyWith(
    displaySmall: head(m3.displaySmall, FontWeight.w700),
    headlineLarge: head(m3.headlineLarge),
    headlineMedium: head(m3.headlineMedium),
    headlineSmall: head(m3.headlineSmall),
    titleLarge: head(m3.titleLarge, tk.headingWeight == FontWeight.w800 ? FontWeight.w700 : tk.headingWeight),
    titleMedium: tab(m3.titleMedium, FontWeight.w600),
    titleSmall: tab(m3.titleSmall, FontWeight.w600),
    bodyLarge: body(m3.bodyLarge),
    bodyMedium: body(m3.bodyMedium),
    bodySmall: body(m3.bodySmall)?.copyWith(color: Color(muted)),
    labelLarge: tab(m3.labelLarge, FontWeight.w600),
    labelMedium: tab(m3.labelMedium, FontWeight.w600),
    labelSmall: tab(m3.labelSmall),
  );
  final hard = tk.hardShadow > 0;
  OutlinedBorder shapeOf(double r, [BorderSide s = BorderSide.none]) =>
      hard ? HardShadowBorder(borderRadius: BorderRadius.circular(r), side: s, offset: tk.hardShadow / 2, color: tk.ink ?? Colors.black) : RoundedRectangleBorder(borderRadius: BorderRadius.circular(r), side: s);
  final control = shapeOf(tk.controlRadius, tk.ink == null ? BorderSide.none : BorderSide(color: tk.ink!, width: tk.borderWidth));
  final label = text.labelLarge;
  final aurora = surface == 'aurora' && tokens == null;
  // the main buttons are a gradient of the two brand colours on the gradient looks (iOS / GNOME style), flat when disabled
  final gradientFill = !(glass || aurora)
      ? null
      : (BuildContext _, Set<WidgetState> st, Widget? child) => st.contains(WidgetState.disabled)
          ? child!
          : DecoratedBox(
              decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(btn.a), Color(btn.b)], begin: Alignment.topLeft, end: Alignment.bottomRight)),
              child: child,
            );
  final tap = tk.tapTarget;
  final focusRing = tk.glow ?? scheme.primary;
  OutlineInputBorder field(Color c, [double w = 1]) => OutlineInputBorder(borderRadius: BorderRadius.circular(tk.controlRadius), borderSide: BorderSide(color: c, width: w));
  final fieldEdge = tk.ink ?? Color(p.borderStrong);
  return ThemeData(
    useMaterial3: true,
    fontFamily: bodyFont,
    colorScheme: scheme,
    // a finger needs room (Android); a mouse is precise (Windows)
    visualDensity: tk.touch ? VisualDensity.standard : const VisualDensity(horizontal: 0, vertical: -.5),
    materialTapTargetSize: tk.touch ? MaterialTapTargetSize.padded : MaterialTapTargetSize.shrinkWrap,
    extensions: [LookLevel(vivid: vivid), tk.copyWith(backdrop: tk.backdrop, glows: tk.glows), sideColorsOf(p), tonesOf(p)],
    scaffoldBackgroundColor: Color(p.bg),
    dividerColor: Color(p.border),
    cardTheme: CardThemeData(
      color: cardColor,
      surfaceTintColor: Colors.transparent,
      // a soft shadow under light cards (iOS), none on dark ones
      elevation: tk.softShadow != null ? 8 : tk.glow != null && !hard ? 2 : switch (surface) { 'clay' => 6, 'skeuomorphism' => 3, 'neumorphism' => 4, _ => hard || p.dark ? 0 : 1.5 },
      shadowColor: tk.softShadow ?? tk.glow ?? (surface == 'neumorphism' ? Color(p.dark ? 0xFF000000 : 0xFFA3B1C6) : const Color(0x330F172A)),
      // a hard shadow needs room beside the card
      margin: hard ? EdgeInsets.fromLTRB(4, 4, 4 + tk.hardShadow, 4 + tk.hardShadow) : null,
      shape: shapeOf(radius, side),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: glass || aurora ? Color(p.surface).withValues(alpha: p.dark ? .55 : .62) : Color(p.surface),
      foregroundColor: Color(p.text),
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: tk.ink ?? (glass || aurora ? Color(p.border).withValues(alpha: .5) : Color(p.border)), width: tk.ink != null ? tk.borderWidth : 1)),
      titleTextStyle: text.titleLarge?.copyWith(fontSize: 20, color: Color(p.text)),
    ),
    textTheme: text,
    // one look for every text field: outlined, lightly filled, the label always readable, errors in the error colour
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: glass ? cardColor : Color(p.dark ? p.surface2 : p.surface),
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: ((tap - 20) / 2).clamp(12, 22)),
      border: field(fieldEdge, tk.borderWidth),
      enabledBorder: field(fieldEdge, tk.borderWidth),
      focusedBorder: field(focusRing, tk.borderWidth + 1),
      errorBorder: field(scheme.error),
      focusedErrorBorder: field(scheme.error, 2),
      disabledBorder: field(Color(p.border)),
      labelStyle: TextStyle(color: Color(muted)),
      floatingLabelStyle: TextStyle(color: Color(primaryText), fontWeight: FontWeight.w600),
      hintStyle: TextStyle(color: Color(muted)),
      prefixIconColor: Color(muted),
      suffixIconColor: Color(muted),
    ),
    // every button at least the device's tap target (44 px with a mouse, 48 dp with a finger, 64 for Target Tap)
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: Size(64, tap), shape: control, textStyle: label, backgroundBuilder: gradientFill,
        elevation: tk.glow != null ? 3 : null, shadowColor: tk.glow)),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(minimumSize: Size(64, tap), shape: control, textStyle: label)),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: Size(64, tap), shape: control, textStyle: label, foregroundColor: tk.ink ?? Color(p.text), backgroundColor: tk.ink == null ? Color(p.surface) : null, side: BorderSide(color: tk.ink ?? tk.glow?.withValues(alpha: .6) ?? Color(p.borderStrong), width: tk.borderWidth)),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: Size(48, tap - 4), shape: shapeOf(tk.controlRadius), textStyle: label, foregroundColor: Color(primaryText))),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: Size(tap - 4, tap - 4))),
    // segmented controls (iOS): a soft grey groove, the chosen segment lifted in the panel colour
    // tabs that fit (the owner's request, 2026-11-15): no tick taking room in the chosen segment, tighter padding, one
    // line of text
    // React's .tabs: one panel-coloured strip under a hairline, the chosen tab a soft grey with bold text in the text colour
    segmentedButtonTheme: SegmentedButtonThemeData(selectedIcon: const SizedBox.shrink(), style: SegmentedButton.styleFrom(minimumSize: Size(40, tap - 4), padding: const EdgeInsets.symmetric(horizontal: 12), shape: control,
        side: BorderSide(color: tk.ink ?? Color(p.border), width: tk.borderWidth),
        backgroundColor: Color(p.surface), foregroundColor: Color(muted), selectedBackgroundColor: Color(mix(p.surface, p.text, p.dark ? .10 : .045)), selectedForegroundColor: Color(p.text),
        textStyle: label?.copyWith(fontWeight: FontWeight.w600))),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(tk.chipRadius)),
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: ((tap - 36) / 2).clamp(4, 14)),
      // the chosen chip (payment method, filter) stands out by its border as well as its fill
      side: WidgetStateBorderSide.resolveWith((st) => BorderSide(
          color: st.contains(WidgetState.selected) ? focusRing : (tk.ink ?? Color(p.borderStrong)),
          width: st.contains(WidgetState.selected) ? tk.borderWidth + .5 : tk.borderWidth)),
      labelStyle: text.labelLarge?.copyWith(color: Color(p.text)),
      selectedColor: scheme.primaryContainer,
      checkmarkColor: scheme.onPrimaryContainer,
      showCheckmark: false, // React's filter tabs: the chosen one is filled, no tick
      elevation: 0,
      selectedShadowColor: tk.glow,
      pressElevation: tk.glow != null ? 4 : null,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Color(p.surface),
      surfaceTintColor: Colors.transparent,
      // React's .modal: 20 px corners under a hairline, an 18 px bold title
      shape: shapeOf(radius + (radius == 0 ? 0 : 2), BorderSide(color: tk.ink ?? Color(p.border), width: tk.borderWidth)),
      titleTextStyle: text.titleLarge?.copyWith(fontSize: 18, fontWeight: FontWeight.w700, color: Color(p.text)),
    ),
    // sheets rise from the bottom with rounded top corners and a grab handle (iOS)
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: Color(p.surface), surfaceTintColor: Colors.transparent, showDragHandle: true,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(radius == 0 ? 0 : math.max(radius, 16))))),
    // switches as iOS draws them: a white knob on a track of the brand colour (off: a soft grey), no outline
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.disabled) ? Color(p.dark ? 0xFF6B7280 : 0xFFF1F5F9) : Colors.white),
      trackColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.selected) ? scheme.primary.withValues(alpha: st.contains(WidgetState.disabled) ? .4 : 1) : scheme.surfaceContainerHighest),
      trackOutlineColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.selected) ? Colors.transparent : Color(p.borderStrong)),
      thumbIcon: const WidgetStatePropertyAll(null),
    ),
    popupMenuTheme: PopupMenuThemeData(color: Color(p.surface), surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(tk.controlRadius), side: BorderSide(color: tk.ink ?? Color(p.border), width: tk.borderWidth))),
    menuTheme: MenuThemeData(style: MenuStyle(backgroundColor: WidgetStatePropertyAll(Color(p.surface)), surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent))),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      width: tk.touch ? null : 520,
      backgroundColor: Color(p.dark ? mix(p.surface2, 0xFFFFFFFF, .12) : _ink(p)),
      contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
      actionTextColor: Color(p.dark ? p.primary : mix(p.primary, 0xFFFFFFFF, .45)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(tk.controlRadius)),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: Color(p.dark ? mix(p.surface2, 0xFFFFFFFF, .15) : _ink(p)), borderRadius: BorderRadius.circular(6)),
      textStyle: text.bodySmall?.copyWith(color: Colors.white),
      waitDuration: const Duration(milliseconds: 400),
    ),
    listTileTheme: ListTileThemeData(iconColor: Color(muted), selectedColor: scheme.onPrimaryContainer, selectedTileColor: scheme.primaryContainer, minTileHeight: tk.touch || tap > 48 ? tap + 4 : null),
    dividerTheme: DividerThemeData(color: tk.ink ?? Color(p.border), space: 1, thickness: tk.ink != null ? tk.borderWidth / 2 : 1),
    checkboxTheme: CheckboxThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(tk.radius == 0 ? 0 : 4))),
    // a clear ring around whatever the keyboard is on (Tab / arrow keys at the till)
    focusColor: focusRing.withValues(alpha: p.dark ? .22 : .14),
    scrollbarTheme: ScrollbarThemeData(radius: const Radius.circular(8), thickness: WidgetStatePropertyAll(tk.touch ? 4 : 8), thumbColor: WidgetStatePropertyAll(Color(p.borderStrong))),
  );
}
