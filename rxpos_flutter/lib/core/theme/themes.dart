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

/// A Pharmacy theme's glossy dashboard (src/themes.js glossyVars, src/styles/glossy.css): the four figure cards each in
/// its own colour, the welcome banner and the menu's gradient, each readable (AA). Read with `Theme.of(context).extension<Glossy>()`.
class Glossy extends ThemeExtension<Glossy> {
  const Glossy({required this.kpi, required this.hero, required this.sideTop, required this.sideBottom, required this.chartLine});
  /// six colours per figure card, four cards: gradient a, b, the words, the line under the figure, the icon's tile, the icon
  final List<int> kpi;
  /// the welcome banner: gradient a, b and its words
  final List<int> hero;
  final int sideTop, sideBottom;
  /// the daily chart's line, the number of sales (readable at AA on cards; its badges' words are the card colour)
  final int chartLine;
  /// figure card [slot] (0–3; later ones take the colours again)
  ({Color a, Color b, Color on, Color sub, Color tile, Color icon}) card(int slot) {
    final i = (slot % 4) * 6;
    return (a: Color(kpi[i]), b: Color(kpi[i + 1]), on: Color(kpi[i + 2]), sub: Color(kpi[i + 3]), tile: Color(kpi[i + 4]), icon: Color(kpi[i + 5]));
  }
  @override
  Glossy copyWith() => this;
  @override
  Glossy lerp(Glossy? other, double t) => t < .5 ? this : (other ?? this);
}

class Palette {
  const Palette(this.id, this.name, this.dark,
      {required this.bg, required this.surface, required this.surface2, required this.border, required this.borderStrong, required this.text,
      required this.muted, required this.primary, required this.primary2, required this.sidebar, required this.sidebar2, this.flat = false, this.inspired = '', this.sidebarText, this.group = '', this.duo, this.glossy});
  final String id, name, inspired;
  /// the theme menu's group (paletteGroups)
  final String group;
  /// the menu's text colour where the palette sets its own (light menus: Soft Grey, Sage Garden)
  final int? sidebarText;
  final bool dark, flat;
  final int bg, surface, surface2, border, borderStrong, text, muted, primary, primary2, sidebar, sidebar2;
  /// the two-colour shades (src/themes.js duoVars): warnings, table colours and tints, the menu's pill
  final Duo? duo;
  /// the Pharmacy themes' glossy dashboard (null for the others)
  final Glossy? glossy;

  Palette withPrimary(int p1, int p2) => Palette(id, name, dark,
      bg: bg, surface: surface, surface2: surface2, border: border, borderStrong: borderStrong, text: text, muted: muted, primary: p1, primary2: p2,
      sidebar: sidebar, sidebar2: sidebar2, flat: flat, inspired: inspired, sidebarText: sidebarText, group: group, duo: duo, glossy: glossy);
}

/// The 41 themes in six sets (17 Nov 2026, the owner's review; four dark ones and real status colours since
/// 1.14.0). Generated from src/themes.js by `node tools/flutter-palettes.mjs`, so both apps show the same colours:
/// colour 1 strong (the menu's pill, buttons, headings), colour 2 the soft page; OK, warnings and danger green, amber, red.
const paletteGroups = ['Blues', 'Greens & Teals', 'Purples', 'Warm', 'Neutral & Lime', 'Dark', 'Multi-colour'];
const palettes = [
  Palette('electric-blue', 'Electric Blue', false, bg: 0xFFF2F6FF, surface: 0xFFFFFFFF, surface2: 0xFFEFF4FF, border: 0x1F062E99, borderStrong: 0x3D062E99, text: 0xFF020C29, muted: 0xFF676D7F, primary: 0xFF0A4DFF, primary2: 0xFF0942DB, sidebar: 0xFF101A3A, sidebar2: 0xFF0E1632, flat: true, inspired: 'Deep blue menu, bright blue pills', group: 'Blues',
      duo: Duo(ok: 0xFF046448, warn: 0xFF8C4108, danger: 0xFFB31138, info: 0xFF0944E0, violet: 0xFF083ECC, pill: 0xFF1958FF, pillOn: 0xFFFFFFFF, logo2: 0xFF101A3A, rowTint: 3, headTint: 10, hues: [0xFF0A4DFF, 0xFF101A3A, 0xFF0736B3, 0xFF0D349D, 0xFF0941D9, 0xFF0D152E, 0xFF062A8C, 0xFF0C3EC4]), glossy: Glossy(kpi: [0xFF0A4DFF, 0xFF0737B8, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF101A3A, 0xFF0B45E1, 0xFFFFFFFF], sideTop: 0xFF0E2871, sideBottom: 0xFF0A1126, chartLine: 0xFFB83877)),
  Palette('sky-blue', 'Sky Blue', false, bg: 0xFFF6FBFE, surface: 0xFFFFFFFF, surface2: 0xFFF4FAFE, border: 0x1F227195, borderStrong: 0x3D227195, text: 0xFF091E28, muted: 0xFF6B787E, primary: 0xFF38BDF8, primary2: 0xFF30A3D5, sidebar: 0xFF0C1B2B, sidebar2: 0xFF0A1725, flat: true, inspired: 'Deep navy menu, sky-blue pills', group: 'Blues',
      duo: Duo(ok: 0xFF047152, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF206C8D, violet: 0xFF216F92, pill: 0xFF38BDF8, pillOn: 0xFF0B1220, logo2: 0xFF0C1B2B, rowTint: 3, headTint: 10, hues: [0xFF257BA1, 0xFF0C1B2B, 0xFF257CA4, 0xFF226C92, 0xFF257DA5, 0xFF0A1622, 0xFF1F6888, 0xFF267CA5]), glossy: Glossy(kpi: [0xFF38BDF8, 0xFF2888B3, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0C1B2B, 0xFF257AA0, 0xFFFFFFFF], sideTop: 0xFF184864, sideBottom: 0xFF08121C, chartLine: 0xFFC43C7F)),
  Palette('ocean-cyan', 'Ocean Cyan', false, bg: 0xFFF4FBFD, surface: 0xFFFFFFFF, surface2: 0xFFF1FBFD, border: 0x1F046D7F, borderStrong: 0x3D046D7F, text: 0xFF011D22, muted: 0xFF67777A, primary: 0xFF06B6D4, primary2: 0xFF059DB6, sidebar: 0xFF0B2530, sidebar2: 0xFF092029, flat: true, inspired: 'Deep ocean menu, cyan pills', group: 'Blues',
      duo: Duo(ok: 0xFF047152, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF056F81, violet: 0xFF056B7D, pill: 0xFF06B6D4, pillOn: 0xFF0B1220, logo2: 0xFF0B2530, rowTint: 3, headTint: 10, hues: [0xFF067D92, 0xFF0B2530, 0xFF047F94, 0xFF096E82, 0xFF058195, 0xFF091E26, 0xFF036475, 0xFF087B90]), glossy: Glossy(kpi: [0xFF06B6D4, 0xFF11899E, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0B2530, 0xFF078299, 0xFFFFFFFF], sideTop: 0xFF0A4E5E, sideBottom: 0xFF07181F, chartLine: 0xFFC43C7F)),
  Palette('steel-blue', 'Steel Blue', false, bg: 0xFFF8F9FB, surface: 0xFFFFFFFF, surface2: 0xFFF6F8FB, border: 0x1F2F4A67, borderStrong: 0x3D2F4A67, text: 0xFF0D141C, muted: 0xFF6E7277, primary: 0xFF4F7CAC, primary2: 0xFF446B94, sidebar: 0xFF161C26, sidebar2: 0xFF131821, flat: true, inspired: 'Slate menu, steel-blue pills: calm for long shifts', group: 'Blues',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFBE123C, info: 0xFF3E6085, violet: 0xFF3F638A, pill: 0xFF4A75A2, pillOn: 0xFFFFFFFF, logo2: 0xFF161C26, rowTint: 3, headTint: 10, hues: [0xFF4A75A2, 0xFF161C26, 0xFF375778, 0xFF334C69, 0xFF436992, 0xFF12161E, 0xFF2B445F, 0xFF3E5F84]), glossy: Glossy(kpi: [0xFF4B76A3, 0xFF39597C, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFF59E0B, 0xFFB07208, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220], hero: [0xFF161C26, 0xFF466E98, 0xFFFFFFFF], sideTop: 0xFF26374C, sideBottom: 0xFF0E1219, chartLine: 0xFF956108)),
  Palette('pharmacy-blue', 'Pharmacy Blue', false, bg: 0xFFF7F9FE, surface: 0xFFFFFFFF, surface2: 0xFFF5F8FE, border: 0x1F163B8D, borderStrong: 0x3D163B8D, text: 0xFF061026, muted: 0xFF6A707D, primary: 0xFF2563EB, primary2: 0xFF2055CA, sidebar: 0xFF0B2A5C, sidebar2: 0xFF09244F, flat: true, inspired: 'Glossy dashboard: deep blue menu, four-colour figure cards', group: 'Blues',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFB31138, info: 0xFF1F52C3, violet: 0xFF1E4FBC, pill: 0xFF4A7DEE, pillOn: 0xFF0B1220, logo2: 0xFF0B2A5C, rowTint: 3, headTint: 10, hues: [0xFF2563EB, 0xFF0B2A5C, 0xFF1A45A5, 0xFF1847A4, 0xFF1F54C8, 0xFF09224A, 0xFF143681, 0xFF1D52C0]), glossy: Glossy(kpi: [0xFF2563EB, 0xFF1B47A9, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFE3F4E9, 0xFFC7E9D4, 0xFF083E1C, 0xFF0D5F2B, 0xFF16A34A, 0xFFFFFFFF, 0xFFEFE7FD, 0xFFE0D0FB, 0xFF2F165A, 0xFF482289, 0xFF7C3AED, 0xFFFFFFFF, 0xFFFEF3E2, 0xFFFDE8C4, 0xFF5D3C04, 0xFF8E5C06, 0xFFCB8408, 0xFFFFFFFF], hero: [0xFF0B2A5C, 0xFF215AD6, 0xFFFFFFFF], sideTop: 0xFF123A84, sideBottom: 0xFF071B3C, chartLine: 0xFF956108)),
  Palette('navy-sky', 'Midnight Navy & Sky', false, bg: 0xFFF9FBFD, surface: 0xFFFFFFFF, surface2: 0xFFF8FAFC, border: 0x1F185496, borderStrong: 0x3D185496, text: 0xFF061628, muted: 0xFF6A737E, primary: 0xFF288CFA, primary2: 0xFF2278D7, sidebar: 0xFF103766, sidebar2: 0xFF0E2F58, flat: true, inspired: 'Midnight navy menu, blue and sky charts', group: 'Blues',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF1B60AC, violet: 0xFF1C63B1, pill: 0xFF288CFA, pillOn: 0xFF0B1220, logo2: 0xFF103766, rowTint: 3, headTint: 10, hues: [0xFF2275D0, 0xFF257BA1, 0xFF1C62AF, 0xFF1C62B0, 0xFF2070C8, 0xFF0D2C52, 0xFF164D8A, 0xFF2173CE]), glossy: Glossy(kpi: [0xFF2072CC, 0xFF1D65B4, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFF59E0B, 0xFFB07208, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220], hero: [0xFF103766, 0xFF2073CE, 0xFFFFFFFF], sideTop: 0xFF174F8F, sideBottom: 0xFF0A2442, chartLine: 0xFF9F6708)),
  Palette('emerald-mint', 'Emerald Mint', false, bg: 0xFFF4FCF9, surface: 0xFFFFFFFF, surface2: 0xFFF2FBF7, border: 0x1F0A6F4D, borderStrong: 0x3D0A6F4D, text: 0xFF031E15, muted: 0xFF687873, primary: 0xFF10B981, primary2: 0xFF0E9F6F, sidebar: 0xFF0B221A, sidebar2: 0xFF091D16, flat: true, inspired: 'Deep green menu, emerald pills', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF047152, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF08704F, violet: 0xFF097451, pill: 0xFF10B981, pillOn: 0xFF0B1220, logo2: 0xFF0B221A, rowTint: 3, headTint: 10, hues: [0xFF0A8059, 0xFF0B221A, 0xFF0B825A, 0xFF0E6E4E, 0xFF0B835B, 0xFF091B15, 0xFF096647, 0xFF0E845C]), glossy: Glossy(kpi: [0xFF10B981, 0xFF24916D, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0B221A, 0xFF0B845D, 0xFFFFFFFF], sideTop: 0xFF0C4C37, sideBottom: 0xFF071611, chartLine: 0xFFC43C7F)),
  Palette('mint-teal', 'Mint Teal', false, bg: 0xFFECF5F5, surface: 0xFFFFFFFF, surface2: 0xFFE7F3F3, border: 0x1F095353, borderStrong: 0x3D095353, text: 0xFF021616, muted: 0xFF677373, primary: 0xFF0F8A8A, primary2: 0xFF0D7777, sidebar: 0xFF0F2222, sidebar2: 0xFF0D1D1D, flat: true, inspired: 'Teal on mint, the RxPOS colour', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFBE123C, info: 0xFF0B6B6B, violet: 0xFF0B6767, pill: 0xFF1D9191, pillOn: 0xFF0B1220, logo2: 0xFF0F2222, rowTint: 3, headTint: 10, hues: [0xFF0E8282, 0xFF0F2222, 0xFF0B6161, 0xFF0F5656, 0xFF0D7575, 0xFF0C1B1B, 0xFF084C4C, 0xFF0F6B6B]), glossy: Glossy(kpi: [0xFF0E8383, 0xFF0B6363, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0F2222, 0xFF0F7A7A, 0xFFFFFFFF], sideTop: 0xFF0F3F3F, sideBottom: 0xFF0A1616, chartLine: 0xFFB83877)),
  Palette('sage', 'Sage', false, bg: 0xFFF4F8F3, surface: 0xFFFFFFFF, surface2: 0xFFF1F7F0, border: 0x1F1C4029, borderStrong: 0x3D1C4029, text: 0xFF08110B, muted: 0xFF6B706D, primary: 0xFF2F6B45, primary2: 0xFF285C3B, sidebar: 0xFF18241B, sidebar2: 0xFF151F17, flat: true, inspired: 'Deep sage menu, green pills', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFB31138, info: 0xFF295E3D, violet: 0xFF265637, pill: 0xFF477C5B, pillOn: 0xFFFFFFFF, logo2: 0xFF18241B, rowTint: 3, headTint: 10, hues: [0xFF2F6B45, 0xFF18241B, 0xFF214B30, 0xFF244830, 0xFF285B3B, 0xFF131D16, 0xFF1A3B26, 0xFF285638]), glossy: Glossy(kpi: [0xFF2F6B45, 0xFF224D32, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF18241B, 0xFF2C603F, 0xFFFFFFFF], sideTop: 0xFF1E3827, sideBottom: 0xFF101712, chartLine: 0xFFA21CAF)),
  Palette('mist-teal-lilac', 'Mist Gray, Teal & Lilac', false, bg: 0xFFFAFBFB, surface: 0xFFFFFFFF, surface2: 0xFFF9FAFB, border: 0x1F0C6E64, borderStrong: 0x3D0C6E64, text: 0xFF031D1B, muted: 0xFF687776, primary: 0xFF14B8A6, primary2: 0xFF119E8F, sidebar: 0xFF134E4A, sidebar2: 0xFF104340, flat: true, inspired: 'Mist page, teal figures, lilac comparisons', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF047152, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF0C6F65, violet: 0xFF0C7368, pill: 0xFF14B8A6, pillOn: 0xFF0B1220, logo2: 0xFF134E4A, rowTint: 3, headTint: 10, hues: [0xFF0E7F73, 0xFF656EC2, 0xFF0E8174, 0xFF148378, 0xFF0E8276, 0xFF0F3E3B, 0xFF0B655B, 0xFF117E73]), glossy: Glossy(kpi: [0xFF14B8A6, 0xFF259085, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF134E4A, 0xFF0F8276, 0xFFFFFFFF], sideTop: 0xFF136C64, sideBottom: 0xFF0C3330, chartLine: 0xFFC43C7F)),
  Palette('pharmacy-green', 'Pharmacy Green', false, bg: 0xFFF8FBF9, surface: 0xFFFFFFFF, surface2: 0xFFF7FBF8, border: 0x1F0D622C, borderStrong: 0x3D0D622C, text: 0xFF041A0C, muted: 0xFF68766D, primary: 0xFF16A34A, primary2: 0xFF138C40, sidebar: 0xFF0B3D24, sidebar2: 0xFF09341F, flat: true, inspired: 'Glossy dashboard: deep green menu, four-colour figure cards', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF0F6F33, violet: 0xFF0F6C31, pill: 0xFF16A34A, pillOn: 0xFF0B1220, logo2: 0xFF0B3D24, rowTint: 3, headTint: 10, hues: [0xFF13873E, 0xFF0B3D24, 0xFF0F7234, 0xFF117037, 0xFF12833B, 0xFF09311D, 0xFF0C5A29, 0xFF13843F]), glossy: Glossy(kpi: [0xFF12853D, 0xFF107535, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFE5ECFD, 0xFFCBDAFA, 0xFF0E2659, 0xFF153988, 0xFF2563EB, 0xFFFFFFFF, 0xFFEFE7FD, 0xFFE0D0FB, 0xFF2F165A, 0xFF482289, 0xFF7C3AED, 0xFFFFFFFF, 0xFFFEF3E2, 0xFFFDE8C4, 0xFF5D3C04, 0xFF8E5C06, 0xFFCB8408, 0xFFFFFFFF], hero: [0xFF0B3D24, 0xFF12863E, 0xFFFFFFFF], sideTop: 0xFF0E5A2F, sideBottom: 0xFF072817, chartLine: 0xFF9F6708)),
  Palette('royal-purple', 'Royal Purple', false, bg: 0xFFFBF9FE, surface: 0xFFFFFFFF, surface2: 0xFFFAF8FE, border: 0x1F412C8B, borderStrong: 0x3D412C8B, text: 0xFF110C25, muted: 0xFF706D7C, primary: 0xFF6D4AE8, primary2: 0xFF5E40C8, sidebar: 0xFF1E1433, sidebar2: 0xFF1A112C, flat: true, inspired: 'Deep purple menu, violet pills', group: 'Purples',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFB31138, info: 0xFF6041CC, violet: 0xFF573BBA, pill: 0xFF6D4AE8, pillOn: 0xFFFFFFFF, logo2: 0xFF1E1433, rowTint: 3, headTint: 10, hues: [0xFF6D4AE8, 0xFF1E1433, 0xFF4C34A2, 0xFF462F8E, 0xFF5D3FC5, 0xFF181029, 0xFF3C2980, 0xFF553AB2]), glossy: Glossy(kpi: [0xFF6D4AE8, 0xFF4E35A7, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1E1433, 0xFF6142CD, 0xFFFFFFFF], sideTop: 0xFF342366, sideBottom: 0xFF140D21, chartLine: 0xFFC43C7F)),
  Palette('pharmacy-purple', 'Pharmacy Purple', false, bg: 0xFFFAF9FE, surface: 0xFFFFFFFF, surface2: 0xFFF9F7FE, border: 0x1F4A238E, borderStrong: 0x3D4A238E, text: 0xFF140926, muted: 0xFF726B7D, primary: 0xFF7C3AED, primary2: 0xFF6B32CC, sidebar: 0xFF2A1257, sidebar2: 0xFF240F4B, flat: true, inspired: 'Glossy dashboard: deep purple menu, four-colour figure cards', group: 'Purples',
      duo: Duo(ok: 0xFF046448, warn: 0xFF8C4108, danger: 0xFFB31138, info: 0xFF6D33D1, violet: 0xFF632EBE, pill: 0xFF8446EE, pillOn: 0xFFFFFFFF, logo2: 0xFF2A1257, rowTint: 3, headTint: 10, hues: [0xFF7C3AED, 0xFF2A1257, 0xFF5729A6, 0xFF5326A2, 0xFF6931C9, 0xFF220E46, 0xFF442082, 0xFF632EC0]), glossy: Glossy(kpi: [0xFF7C3AED, 0xFF592AAB, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFE5ECFD, 0xFFCBDAFA, 0xFF0E2659, 0xFF153988, 0xFF2563EB, 0xFFFFFFFF, 0xFFE3F4E9, 0xFFC7E9D4, 0xFF083E1C, 0xFF0D5F2B, 0xFF16A34A, 0xFFFFFFFF, 0xFFFEF3E2, 0xFFFDE8C4, 0xFF5D3C04, 0xFF8E5C06, 0xFFCB8408, 0xFFFFFFFF], hero: [0xFF2A1257, 0xFF7034D7, 0xFFFFFFFF], sideTop: 0xFF411D81, sideBottom: 0xFF1B0C39, chartLine: 0xFF956108)),
  Palette('alabaster-indigo-coral', 'Alabaster, Indigo & Coral', false, bg: 0xFFFDFDFB, surface: 0xFFFFFFFF, surface2: 0xFFFDFCFB, border: 0x1F2F2A89, borderStrong: 0x3D2F2A89, text: 0xFF0D0B25, muted: 0xFF6E6D7C, primary: 0xFF4F46E5, primary2: 0xFF443CC5, sidebar: 0xFF1E1B4B, sidebar2: 0xFF1A1741, flat: true, inspired: 'Alabaster page, indigo figures, coral series', group: 'Purples',
      duo: Duo(ok: 0xFF046448, warn: 0xFF8C4108, danger: 0xFFB31138, info: 0xFF463ECA, violet: 0xFF3F38B7, pill: 0xFF645BE8, pillOn: 0xFFFFFFFF, logo2: 0xFF1E1B4B, rowTint: 3, headTint: 10, hues: [0xFF4F46E5, 0xFFC73C54, 0xFF3731A0, 0xFF373198, 0xFF433CC3, 0xFF18163C, 0xFF2B277E, 0xFF4039B7]), glossy: Glossy(kpi: [0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1E1B4B, 0xFF4840CE, 0xFFFFFFFF], sideTop: 0xFF2C2776, sideBottom: 0xFF141231, chartLine: 0xFFC43C7F)),
  Palette('royal-iris-butter', 'Royal Iris & Butter Yellow', false, bg: 0xFFFFFFFF, surface: 0xFFFFFFFF, surface2: 0xFFFFFFFF, border: 0xFFE5E7EB, borderStrong: 0x3D230762, text: 0xFF111827, muted: 0xFF70747D, primary: 0xFF3A0CA3, primary2: 0xFF320A8C, sidebar: 0xFF3A0CA3, sidebar2: 0xFF320A8C, flat: true, inspired: 'Royal iris menu, butter-yellow badges, dark ink', group: 'Purples',
      duo: Duo(ok: 0xFF045E44, warn: 0xFF843D08, danger: 0xFF9E0F32, info: 0xFF330B8F, violet: 0xFF2E0A82, pill: 0xFFFFF275, pillOn: 0xFF0B1220, logo2: 0xFF26086A, rowTint: 3, headTint: 10, hues: [0xFF3A0CA3, 0xFF817000, 0xFF290872, 0xFF3A0CA3, 0xFF310A8B, 0xFF2E0A82, 0xFF20075A, 0xFF3A0CA3]), glossy: Glossy(kpi: [0xFF3A0CA3, 0xFF2A0975, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF3A0CA3, 0xFF3A0CA3, 0xFFFFFFFF], sideTop: 0xFF3A0CA3, sideBottom: 0xFF26086A, chartLine: 0xFFC43C7F)),
  Palette('night-lime', 'Lime on Charcoal', false, bg: 0xFFFBFBF9, surface: 0xFFFFFFFF, surface2: 0xFFFAFAF8, border: 0x1F78913F, borderStrong: 0x3D78913F, text: 0xFF202711, muted: 0xFF797D70, primary: 0xFFC8F169, primary2: 0xFFACCF5A, sidebar: 0xFF1F1F2A, sidebar2: 0xFF1B1B24, flat: true, inspired: 'Charcoal menu, lime pills and buttons with dark words', group: 'Neutral & Lime',
      duo: Duo(ok: 0xFF047152, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF657934, violet: 0xFF627634, pill: 0xFFC8F169, pillOn: 0xFF0B1220, logo2: 0xFF1F1F2A, rowTint: 3, headTint: 10, hues: [0xFF667A35, 0xFF1F1F2A, 0xFF677C37, 0xFF667842, 0xFF687D37, 0xFF191922, 0xFF677D37, 0xFF677B3B]), glossy: Glossy(kpi: [0xFFC8F169, 0xFF90AE4C, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1F1F2A, 0xFF697E3A, 0xFFFFFFFF], sideTop: 0xFF4E5A3C, sideBottom: 0xFF14141B, chartLine: 0xFFA21CAF)),
  Palette('charcoal-lime', 'Charcoal on Lime', false, bg: 0xFFF8FCEF, surface: 0xFFFFFFFF, surface2: 0xFFF7FBEB, border: 0x1F131319, borderStrong: 0x3D131319, text: 0xFF050507, muted: 0xFF69696A, primary: 0xFF1F1F2A, primary2: 0xFF1B1B24, sidebar: 0xFFC8F169, sidebar2: 0xFFBCE363, flat: true, inspired: 'Lime menu, charcoal pills', sidebarText: 0xFF1F1F2A, group: 'Neutral & Lime',
      duo: Duo(ok: 0xFF045E44, warn: 0xFF843D08, danger: 0xFF9E0F32, info: 0xFF1B1B25, violet: 0xFF191922, pill: 0xFF1F1F2A, pillOn: 0xFFFFFFFF, logo2: 0xFF14141B, rowTint: 3, headTint: 10, hues: [0xFF1F1F2A, 0xFF667A35, 0xFF16161D, 0xFF667842, 0xFF1A1A24, 0xFF687D37, 0xFF111117, 0xFF525E3D]), glossy: Glossy(kpi: [0xFF1F1F2A, 0xFF16161E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFFC8F169, 0xFF7B8078, 0xFF0B1220], sideTop: 0xFF99B657, sideBottom: 0xFF829D44, chartLine: 0xFFA21CAF)),
  Palette('pharmacy-amber', 'Pharmacy Amber', false, bg: 0xFFFEFBF6, surface: 0xFFFFFFFF, surface2: 0xFFFEFBF4, border: 0x1F935F07, borderStrong: 0x3D935F07, text: 0xFF271902, muted: 0xFF7D7567, primary: 0xFFF59E0B, primary2: 0xFFD38809, sidebar: 0xFF3B2606, sidebar2: 0xFF332105, flat: true, inspired: 'Glossy dashboard: deep brown menu, four-colour figure cards', group: 'Warm',
      duo: Duo(ok: 0xFF047152, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF8C5A08, violet: 0xFF905C08, pill: 0xFFF59E0B, pillOn: 0xFF0B1220, logo2: 0xFF3B2606, rowTint: 3, headTint: 10, hues: [0xFF9F6708, 0xFF3B2606, 0xFFA26808, 0xFF986209, 0xFFA36808, 0xFF2F1E05, 0xFF875706, 0xFF9D6608]), glossy: Glossy(kpi: [0xFFF59E0B, 0xFFB07208, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFE3F4E9, 0xFFC7E9D4, 0xFF083E1C, 0xFF0D5F2B, 0xFF16A34A, 0xFFFFFFFF, 0xFFE5ECFD, 0xFFCBDAFA, 0xFF0E2659, 0xFF153988, 0xFF2563EB, 0xFFFFFFFF, 0xFFEFE7FD, 0xFFE0D0FB, 0xFF2F165A, 0xFF482289, 0xFF7C3AED, 0xFFFFFFFF], hero: [0xFF3B2606, 0xFFA0670A, 0xFFFFFFFF], sideTop: 0xFF6F4807, sideBottom: 0xFF261904, chartLine: 0xFF7C3AED)),
  Palette('sandstone-terracotta', 'Sandstone & Terracotta', false, bg: 0xFFFBFAF9, surface: 0xFFFFFFFF, surface2: 0xFFFAF9F7, border: 0x1F8C3507, borderStrong: 0x3D8C3507, text: 0xFF292524, muted: 0xFF7F7C7C, primary: 0xFFEA580C, primary2: 0xFFC94C0A, sidebar: 0xFF292524, sidebar2: 0xFF23201F, flat: true, inspired: 'Sandstone page, espresso menu, terracotta accents', group: 'Warm',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFBE123C, info: 0xFFA13C08, violet: 0xFFA53E08, pill: 0xFFEA580C, pillOn: 0xFF0B1220, logo2: 0xFF292524, rowTint: 3, headTint: 10, hues: [0xFFC34909, 0xFF292524, 0xFFA43E08, 0xFF8A3F18, 0xFFC74B0A, 0xFF211E1D, 0xFF813007, 0xFFB04913]), glossy: Glossy(kpi: [0xFFC84C0A, 0xFFA83F09, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF292524, 0xFFC34C0F, 0xFFFFFFFF], sideTop: 0xFF5F331D, sideBottom: 0xFF1B1817, chartLine: 0xFFA21CAF)),
  Palette('mono-scarlet', 'Pure Monochrome & Scarlet', false, bg: 0xFFFDFDFD, surface: 0xFFFFFFFF, surface2: 0xFFFDFDFD, border: 0x1F0E0E10, borderStrong: 0x3D0E0E10, text: 0xFF040404, muted: 0xFF686868, primary: 0xFF18181B, primary2: 0xFF151517, sidebar: 0xFF18181B, sidebar2: 0xFF151517, flat: true, inspired: 'Black and white, a scarlet second series', group: 'Neutral & Lime',
      duo: Duo(ok: 0xFF045840, warn: 0xFF7C3908, danger: 0xFF9E0F32, info: 0xFF151518, violet: 0xFF131316, pill: 0xFF6A6A6B, pillOn: 0xFFFFFFFF, logo2: 0xFF101012, rowTint: 3, headTint: 10, hues: [0xFF18181B, 0xFFD43C3C, 0xFF111113, 0xFF18181B, 0xFF141417, 0xFF131316, 0xFF0D0D0F, 0xFF18181B]), glossy: Glossy(kpi: [0xFF18181B, 0xFF111113, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF18181B, 0xFF18181B, 0xFFFFFFFF], sideTop: 0xFF18181B, sideBottom: 0xFF101012, chartLine: 0xFFA21CAF)),
  Palette('ubuntu-yaru', 'Ubuntu Yaru', false, bg: 0xFFFCFAF9, surface: 0xFFFFFFFF, surface2: 0xFFFBF9F8, border: 0x1F8C3213, borderStrong: 0x3D8C3213, text: 0xFF250D05, muted: 0xFF7C6E69, primary: 0xFFE95420, primary2: 0xFFC8481C, sidebar: 0xFF2C001E, sidebar2: 0xFF26001A, flat: true, inspired: 'Ubuntu orange on an aubergine menu (pairs with the Ubuntu style)', group: 'Warm',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF954508, danger: 0xFFBE123C, info: 0xFFA03A16, violet: 0xFFA53B17, pill: 0xFFE95420, pillOn: 0xFF0B1220, logo2: 0xFF2C001E, rowTint: 3, headTint: 10, hues: [0xFFCE4A1C, 0xFF2C001E, 0xFFA33B16, 0xFF8B2A1F, 0xFFC6471B, 0xFF230018, 0xFF802E12, 0xFFB03B1F]), glossy: Glossy(kpi: [0xFFC8481C, 0xFFA83C17, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF2C001E, 0xFFCD4720, 0xFFFFFFFF], sideTop: 0xFF61181F, sideBottom: 0xFF1D0014, chartLine: 0xFFA21CAF)),
  Palette('navy-teal', 'RxPOS Navy Teal', true, bg: 0xFF0A2233, surface: 0xFF1E3443, surface2: 0xFF2C404E, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E9EB, muted: 0xFF939DA5, primary: 0xFF14B8A6, primary2: 0xFF119E8F, sidebar: 0xFF0F2A44, sidebar2: 0xFF0D243A, flat: true, inspired: 'Navy and teal: the RxPOS till', group: 'Dark',
      duo: Duo(ok: 0xFF4BD8A5, warn: 0xFFFBBF24, danger: 0xFFF8AEAE, info: 0xFF67D1C6, violet: 0xFF6CD2C8, pill: 0xFF14B8A6, pillOn: 0xFF0B1220, logo2: 0xFF0F2A44, rowTint: 3, headTint: 10, hues: [0xFF0E7F73, 0xFF0F2A44, 0xFF0E8174, 0xFF127175, 0xFF0E8276, 0xFF0C2236, 0xFF0B655B, 0xFF117D79]), glossy: Glossy(kpi: [0xFF14B8A6, 0xFF259085, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0F2A44, 0xFF117F7D, 0xFFFFFFFF], sideTop: 0xFF10525F, sideBottom: 0xFF0A1B2C, chartLine: 0xFFF389BD)),
  Palette('midnight-blue', 'Midnight Blue', true, bg: 0xFF0B1324, surface: 0xFF1F2636, surface2: 0xFF2C3342, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E7E9, muted: 0xFF93969E, primary: 0xFF60A5FA, primary2: 0xFF538ED7, sidebar: 0xFF0A1A33, sidebar2: 0xFF09162C, flat: true, inspired: 'Night-blue page, bright blue pills', group: 'Dark',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89E9E, info: 0xFF83B9FB, violet: 0xFF80B7FB, pill: 0xFF60A5FA, pillOn: 0xFF0B1220, logo2: 0xFF0A1A33, rowTint: 3, headTint: 10, hues: [0xFF4372AD, 0xFF0A1A33, 0xFF4374AF, 0xFF356097, 0xFF4475B1, 0xFF081529, 0xFF355B8A, 0xFF4274B3]), glossy: Glossy(kpi: [0xFF60A5FA, 0xFF5784BC, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFF59E0B, 0xFFB07208, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220], hero: [0xFF0A1A33, 0xFF4274B4, 0xFFFFFFFF], sideTop: 0xFF22416B, sideBottom: 0xFF071121, chartLine: 0xFFF59E0B)),
  Palette('graphite-amber', 'Graphite Amber', true, bg: 0xFF16161B, surface: 0xFF29292D, surface2: 0xFF36363A, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E8E8, muted: 0xFF98989A, primary: 0xFFFBBF24, primary2: 0xFFD8A41F, sidebar: 0xFF24242C, sidebar2: 0xFF1F1F26, flat: true, inspired: 'Graphite page, amber pills with dark words', group: 'Dark',
      duo: Duo(ok: 0xFF60DCAF, warn: 0xFFFBBF24, danger: 0xFFF8B3B3, info: 0xFFFBC73E, violet: 0xFFFCCC50, pill: 0xFFFBBF24, pillOn: 0xFF0B1220, logo2: 0xFF24242C, rowTint: 3, headTint: 10, hues: [0xFF906E15, 0xFF24242C, 0xFF926F16, 0xFF907228, 0xFF936F16, 0xFF1D1D23, 0xFF8A6914, 0xFF92711E]), glossy: Glossy(kpi: [0xFFFBBF24, 0xFFB58A1A, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF24242C, 0xFF8F701F, 0xFFFFFFFF], sideTop: 0xFF604F2A, sideBottom: 0xFF17171D, chartLine: 0xFFCD85D4)),
  Palette('pharmacy-night', 'Pharmacy Night', true, bg: 0xFF06130D, surface: 0xFF1A2620, surface2: 0xFF28332D, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E7, muted: 0xFF919694, primary: 0xFF22C55E, primary2: 0xFF1DA951, sidebar: 0xFF0A2A1A, sidebar2: 0xFF092416, flat: true, inspired: 'Glossy dashboard at night: deep green, four-colour figure cards', group: 'Dark',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89E9E, info: 0xFF3DCC71, violet: 0xFF4ED17E, pill: 0xFF22C55E, pillOn: 0xFF0B1220, logo2: 0xFF0A2A1A, rowTint: 3, headTint: 10, hues: [0xFF178841, 0xFF0A2A1A, 0xFF17823E, 0xFF16783C, 0xFF17833F, 0xFF082215, 0xFF136C34, 0xFF188542]), glossy: Glossy(kpi: [0xFF0F7234, 0xFF09441F, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF1A45A5, 0xFF102A63, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF5729A6, 0xFF341864, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA36908, 0xFF674205, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0A2A1A, 0xFF198843, 0xFFFFFFFF], sideTop: 0xFF11552D, sideBottom: 0xFF071B11, chartLine: 0xFFF59E0B)),
  Palette('terminal', 'Terminal', true, bg: 0xFF050805, surface: 0xFF0A120A, surface2: 0xFF192019, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFC8FFD4, muted: 0xFF7EA185, primary: 0xFF33FF66, primary2: 0xFF2CDB58, sidebar: 0xFF000000, sidebar2: 0xFF000000, flat: true, inspired: 'Green on black, fixed-width type, a blinking caret (1.17.0)', group: 'Dark',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89898, info: 0xFF4BFF78, violet: 0xFF5CFF85, pill: 0xFF33FF66, pillOn: 0xFF0B1220, logo2: 0xFF000000, rowTint: 3, headTint: 10, hues: [0xFF198134, 0xFF000000, 0xFF1A8434, 0xFF1A8033, 0xFF1A8435, 0xFF000000, 0xFF1A8435, 0xFF1A8434]), glossy: Glossy(kpi: [0xFF33FF66, 0xFF25B849, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF000000, 0xFF1B8836, 0xFFFFFFFF], sideTop: 0xFF0E471D, sideBottom: 0xFF000000, chartLine: 0xFFBF63C8)),
  Palette('twilight-violet', 'Twilight Slate & Soft Violet', true, bg: 0xFF13111C, surface: 0xFF1E1B2E, surface2: 0xFF2C293B, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E7E8, muted: 0xFF96969A, primary: 0xFF8B5CF6, primary2: 0xFF784FD4, sidebar: 0xFF0E0C16, sidebar2: 0xFF0C0A13, flat: true, inspired: 'Dark: twilight page, soft violet, pink series', group: 'Dark',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87A7A, info: 0xFFAF90F7, violet: 0xFFAD8CF8, pill: 0xFF9266F7, pillOn: 0xFF0B1220, logo2: 0xFF0E0C16, rowTint: 3, headTint: 10, hues: [0xFF8356E7, 0xFFC43C7F, 0xFF6140AC, 0xFF4D3486, 0xFF764ED1, 0xFF0B0A12, 0xFF4C3387, 0xFF6644B3]), glossy: Glossy(kpi: [0xFF8457EA, 0xFF6442B1, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0E0C16, 0xFF5F40A8, 0xFFFFFFFF], sideTop: 0xFF312255, sideBottom: 0xFF09080E, chartLine: 0xFFEE5DA5)),
  Palette('graphite-lime', 'Graphite & Lime Spark', true, bg: 0xFF1A1D24, surface: 0xFF23262F, surface2: 0xFF30333B, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFF8FAFC, muted: 0xFFA4A6AA, primary: 0xFFB6FF2E, primary2: 0xFF9DDB28, sidebar: 0xFF14161C, sidebar2: 0xFF111318, flat: true, inspired: 'Dark: graphite page, high-visibility lime', group: 'Dark',
      duo: Duo(ok: 0xFF7BE2BD, warn: 0xFFFBC73D, danger: 0xFFF8C0C0, info: 0xFFBFFF47, violet: 0xFFC5FF58, pill: 0xFFB6FF2E, pillOn: 0xFF0B1220, logo2: 0xFF14161C, rowTint: 3, headTint: 10, hues: [0xFF5C8117, 0xFF14161C, 0xFF577C16, 0xFF597B21, 0xFF597C17, 0xFF101216, 0xFF587C17, 0xFF5C801D]), glossy: Glossy(kpi: [0xFFB6FF2E, 0xFF83B821, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF14161C, 0xFF5C7F1D, 0xFFFFFFFF], sideTop: 0xFF415721, sideBottom: 0xFF0D0E12, chartLine: 0xFFCD85D4)),
  Palette('cool-crisp', 'Cool & Crisp', false, bg: 0xFFFCFDFE, surface: 0xFFFFFFFF, surface2: 0xFFFCFDFE, border: 0x1F234E94, borderStrong: 0x3D234E94, text: 0xFF091527, muted: 0xFF6B737D, primary: 0xFF3B82F6, primary2: 0xFF3370D4, sidebar: 0xFF0F172A, sidebar2: 0xFF0D1424, flat: true, inspired: 'Light shell, blue, teal, indigo, amber and rose charts', group: 'Multi-colour',
      duo: Duo(ok: 0xFF046A4D, warn: 0xFF9F4908, danger: 0xFFBE123C, info: 0xFF2B5FB4, violet: 0xFF295CAE, pill: 0xFF3B82F6, pillOn: 0xFF0B1220, logo2: 0xFF0F172A, rowTint: 3, headTint: 10, hues: [0xFF3473D9, 0xFF0E7F73, 0xFF5D60E3, 0xFF9F6708, 0xFFD73753, 0xFF0C1222, 0xFF204887, 0xFF2E62B9]), glossy: Glossy(kpi: [0xFF3270D3, 0xFF2A5EB1, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFE3F6F4, 0xFFC7EEEA, 0xFF08463F, 0xFF0C6B60, 0xFF12A393, 0xFFFFFFFF, 0xFFECEDFD, 0xFFDADAFC, 0xFF26275C, 0xFF393B8C, 0xFF6366F1, 0xFFFFFFFF, 0xFFFEF3E2, 0xFFFDE8C4, 0xFF5D3C04, 0xFF8E5C06, 0xFFCB8408, 0xFFFFFFFF], hero: [0xFF0F172A, 0xFF3472D7, 0xFFFFFFFF], sideTop: 0xFF1B3563, sideBottom: 0xFF0A0F1B, chartLine: 0xFF9F6708)),
  Palette('vibrant-neon', 'Vibrant Neon', true, bg: 0xFF0F172A, surface: 0xFF222A3B, surface2: 0xFF2F3747, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E8EA, muted: 0xFF9599A1, primary: 0xFF22D3EE, primary2: 0xFF1DB5CD, sidebar: 0xFF0B1222, sidebar2: 0xFF090F1D, flat: true, inspired: 'Dark shell, cyan, violet, emerald, pink and yellow charts', group: 'Multi-colour',
      duo: Duo(ok: 0xFF56DAAA, warn: 0xFFFBBF24, danger: 0xFFF8B3B3, info: 0xFF3DD8F0, violet: 0xFF4EDCF1, pill: 0xFF22D3EE, pillOn: 0xFF0B1220, logo2: 0xFF0B1222, rowTint: 3, headTint: 10, hues: [0xFF158192, 0xFF7B66B8, 0xFF20815D, 0xFFB35485, 0xFF817224, 0xFF090E1B, 0xFF137483, 0xFF177F93]), glossy: Glossy(kpi: [0xFF22D3EE, 0xFF1898AB, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA78BFA, 0xFF8573BC, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF34D399, 0xFF25986E, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFF472B6, 0xFFB8638F, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220], hero: [0xFF0B1222, 0xFF188197, 0xFFFFFFFF], sideTop: 0xFF11485B, sideBottom: 0xFF070C16, chartLine: 0xFFF472B6)),
  Palette('neon-indigo', 'Neon Indigo', true, bg: 0xFF17144D, surface: 0xFF221E66, surface2: 0xFF2F2C6F, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E8ED, muted: 0xFF9997B0, primary: 0xFF6D5DFC, primary2: 0xFF5E50D9, sidebar: 0xFF1C1959, sidebar2: 0xFF18164D, flat: true, inspired: 'Deep indigo dashboard, neon figure cards, cyan and pink charts', group: 'Multi-colour',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88A8A, info: 0xFFA79DFC, violet: 0xFFA99FFD, pill: 0xFF6D5DFC, pillOn: 0xFFFFFFFF, logo2: 0xFF1C1959, rowTint: 3, headTint: 10, hues: [0xFF377E8C, 0xFFC43C7F, 0xFF8356E7, 0xFF158192, 0xFF9F6708, 0xFF161447, 0xFF3C338B, 0xFF5549CB]), glossy: Glossy(kpi: [0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF14B8C4, 0xFF1A8A93, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1C1959, 0xFF5145C3, 0xFFFFFFFF], sideTop: 0xFF332C87, sideBottom: 0xFF12103A, chartLine: 0xFFF179B4)),
];
/// The dark twin of every light theme (1.17.0, src/themes.js THEME_TWINS): id = the light theme's id + '-dark'. Not in
/// the theme list: Dark and System move between a theme and its twin.
const paletteTwins = [
  Palette('electric-blue-dark', 'Electric Blue (dark)', true, bg: 0xFF01091F, surface: 0xFF151D31, surface2: 0xFF232B3D, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E6E9, muted: 0xFF8F929C, primary: 0xFF0A4DFF, primary2: 0xFF0942DB, sidebar: 0xFF0B1229, sidebar2: 0xFF090F23, flat: true, inspired: 'The dark twin of Electric Blue', group: 'Blues',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87171, info: 0xFF6A92FF, violet: 0xFF6691FF, pill: 0xFF0A4DFF, pillOn: 0xFFFFFFFF, logo2: 0xFF0B1229, rowTint: 3, headTint: 10, hues: [0xFF0A4DFF, 0xFF0B1229, 0xFF0736B3, 0xFF0B3094, 0xFF0941D9, 0xFF090E21, 0xFF062A8C, 0xFF0A3BBF]), glossy: Glossy(kpi: [0xFF0A4DFF, 0xFF0737B8, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0B1229, 0xFF0A38B4, 0xFFFFFFFF], sideTop: 0xFF0B2365, sideBottom: 0xFF070C1B, chartLine: 0xFFEE5DA5)),
  Palette('sky-blue-dark', 'Sky Blue (dark)', true, bg: 0xFF07171E, surface: 0xFF1B2A30, surface2: 0xFF29373C, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E8E9, muted: 0xFF91999C, primary: 0xFF38BDF8, primary2: 0xFF30A3D5, sidebar: 0xFF08131E, sidebar2: 0xFF07101A, flat: true, inspired: 'The dark twin of Sky Blue', group: 'Blues',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF8A4A4, info: 0xFF5BC8F9, violet: 0xFF60CAF9, pill: 0xFF38BDF8, pillOn: 0xFF0B1220, logo2: 0xFF08131E, rowTint: 3, headTint: 10, hues: [0xFF257BA1, 0xFF08131E, 0xFF257CA4, 0xFF20688B, 0xFF257DA5, 0xFF060F18, 0xFF1F6888, 0xFF257AA2]), glossy: Glossy(kpi: [0xFF38BDF8, 0xFF2888B3, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF08131E, 0xFF257CA3, 0xFFFFFFFF], sideTop: 0xFF15435B, sideBottom: 0xFF050C14, chartLine: 0xFFF179B4)),
  Palette('ocean-cyan-dark', 'Ocean Cyan (dark)', true, bg: 0xFF011619, surface: 0xFF15292B, surface2: 0xFF233638, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E8E8, muted: 0xFF8F9899, primary: 0xFF06B6D4, primary2: 0xFF059DB6, sidebar: 0xFF081A22, sidebar2: 0xFF07161D, flat: true, inspired: 'The dark twin of Ocean Cyan', group: 'Blues',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89E9E, info: 0xFF3DC7DD, violet: 0xFF38C5DD, pill: 0xFF06B6D4, pillOn: 0xFF0B1220, logo2: 0xFF081A22, rowTint: 3, headTint: 10, hues: [0xFF067D92, 0xFF081A22, 0xFF047F94, 0xFF07687B, 0xFF058195, 0xFF06151B, 0xFF036475, 0xFF077F95]), glossy: Glossy(kpi: [0xFF06B6D4, 0xFF11899E, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF081A22, 0xFF077F96, 0xFFFFFFFF], sideTop: 0xFF074654, sideBottom: 0xFF051116, chartLine: 0xFFF070AF)),
  Palette('steel-blue-dark', 'Steel Blue (dark)', true, bg: 0xFF090F15, surface: 0xFF1D2228, surface2: 0xFF2B2F35, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E8, muted: 0xFF929598, primary: 0xFF4F7CAC, primary2: 0xFF446B94, sidebar: 0xFF0F141B, sidebar2: 0xFF0D1117, flat: true, inspired: 'The dark twin of Steel Blue', group: 'Blues',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87A7A, info: 0xFF86A5C6, violet: 0xFF8AA8C8, pill: 0xFF4A75A2, pillOn: 0xFFFFFFFF, logo2: 0xFF0F141B, rowTint: 3, headTint: 10, hues: [0xFF4A75A2, 0xFF0F141B, 0xFF375778, 0xFF2F4864, 0xFF436992, 0xFF0C1016, 0xFF2B445F, 0xFF3C5D81]), glossy: Glossy(kpi: [0xFF4B76A3, 0xFF39597C, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFF59E0B, 0xFFB07208, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220], hero: [0xFF0F141B, 0xFF395879, 0xFFFFFFFF], sideTop: 0xFF213144, sideBottom: 0xFF0A0D12, chartLine: 0xFFF59E0B)),
  Palette('pharmacy-blue-dark', 'Pharmacy Blue (dark)', true, bg: 0xFF040C1C, surface: 0xFF181F2E, surface2: 0xFF262C3B, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E8, muted: 0xFF90949A, primary: 0xFF2563EB, primary2: 0xFF2055CA, sidebar: 0xFF081D40, sidebar2: 0xFF071937, flat: true, inspired: 'The dark twin of Pharmacy Blue', group: 'Blues',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87171, info: 0xFF739AF2, violet: 0xFF6E98F2, pill: 0xFF2563EB, pillOn: 0xFFFFFFFF, logo2: 0xFF081D40, rowTint: 3, headTint: 10, hues: [0xFF2563EB, 0xFF081D40, 0xFF1A45A5, 0xFF174096, 0xFF1F54C8, 0xFF061733, 0xFF143681, 0xFF1C4EB8]), glossy: Glossy(kpi: [0xFF1A45A5, 0xFF102A63, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0F7234, 0xFF09441F, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF5729A6, 0xFF341864, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA36908, 0xFF674205, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF081D40, 0xFF1B4BAF, 0xFFFFFFFF], sideTop: 0xFF103170, sideBottom: 0xFF05132A, chartLine: 0xFFF59E0B)),
  Palette('navy-sky-dark', 'Midnight Navy & Sky (dark)', true, bg: 0xFF05111E, surface: 0xFF192430, surface2: 0xFF27313C, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E9, muted: 0xFF91969C, primary: 0xFF288CFA, primary2: 0xFF2278D7, sidebar: 0xFF0B2747, sidebar2: 0xFF09223D, flat: true, inspired: 'The dark twin of Midnight Navy & Sky', group: 'Blues',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88A8A, info: 0xFF6BB0FB, violet: 0xFF67AEFB, pill: 0xFF288CFA, pillOn: 0xFF0B1220, logo2: 0xFF0B2747, rowTint: 3, headTint: 10, hues: [0xFF2275D0, 0xFF257BA1, 0xFF1C62AF, 0xFF1A5AA1, 0xFF2070C8, 0xFF091F39, 0xFF164D8A, 0xFF1F6EC4]), glossy: Glossy(kpi: [0xFF2072CC, 0xFF1D65B4, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFF59E0B, 0xFFB07208, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220], hero: [0xFF0B2747, 0xFF1E69BB, 0xFFFFFFFF], sideTop: 0xFF134379, sideBottom: 0xFF07192E, chartLine: 0xFFF59E0B)),
  Palette('emerald-mint-dark', 'Emerald Mint (dark)', true, bg: 0xFF02160F, surface: 0xFF162922, surface2: 0xFF24362F, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E8E7, muted: 0xFF8F9895, primary: 0xFF10B981, primary2: 0xFF0E9F6F, sidebar: 0xFF081812, sidebar2: 0xFF07150F, flat: true, inspired: 'The dark twin of Emerald Mint', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89898, info: 0xFF46C89D, violet: 0xFF40C79A, pill: 0xFF10B981, pillOn: 0xFF0B1220, logo2: 0xFF081812, rowTint: 3, headTint: 10, hues: [0xFF0A8059, 0xFF081812, 0xFF0B825A, 0xFF0C694A, 0xFF0B835B, 0xFF06130E, 0xFF096647, 0xFF0D815A]), glossy: Glossy(kpi: [0xFF10B981, 0xFF24916D, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF081812, 0xFF0D815A, 0xFFFFFFFF], sideTop: 0xFF0A4531, sideBottom: 0xFF05100C, chartLine: 0xFFF070AF)),
  Palette('mint-teal-dark', 'Mint Teal (dark)', true, bg: 0xFF021111, surface: 0xFF162424, surface2: 0xFF243131, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E7, muted: 0xFF8F9696, primary: 0xFF0F8A8A, primary2: 0xFF0D7777, sidebar: 0xFF0B1818, sidebar2: 0xFF091515, flat: true, inspired: 'The dark twin of Mint Teal', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88282, info: 0xFF65B3B3, violet: 0xFF60B1B1, pill: 0xFF1D9191, pillOn: 0xFF0B1220, logo2: 0xFF0B1818, rowTint: 3, headTint: 10, hues: [0xFF0E8282, 0xFF0B1818, 0xFF0B6161, 0xFF0D5151, 0xFF0D7575, 0xFF091313, 0xFF084C4C, 0xFF0E6868]), glossy: Glossy(kpi: [0xFF0E8383, 0xFF0B6363, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0B1818, 0xFF0E6262, 0xFFFFFFFF], sideTop: 0xFF0C3838, sideBottom: 0xFF071010, chartLine: 0xFFEF67AA)),
  Palette('sage-dark', 'Sage (dark)', true, bg: 0xFF060D08, surface: 0xFF1A201C, surface2: 0xFF282D2A, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E6, muted: 0xFF919492, primary: 0xFF2F6B45, primary2: 0xFF285C3B, sidebar: 0xFF111913, sidebar2: 0xFF0F1610, flat: true, inspired: 'The dark twin of Sage', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87171, info: 0xFF799F87, violet: 0xFF7DA38A, pill: 0xFF3B7450, pillOn: 0xFFFFFFFF, logo2: 0xFF111913, rowTint: 3, headTint: 10, hues: [0xFF2F6B45, 0xFF111913, 0xFF214B30, 0xFF20422C, 0xFF285B3B, 0xFF0E140F, 0xFF1A3B26, 0xFF265236]), glossy: Glossy(kpi: [0xFF2F6B45, 0xFF224D32, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF111913, 0xFF254E34, 0xFFFFFFFF], sideTop: 0xFF193021, sideBottom: 0xFF0B100C, chartLine: 0xFFC775CE)),
  Palette('mist-teal-lilac-dark', 'Mist Gray, Teal & Lilac (dark)', true, bg: 0xFF021614, surface: 0xFF162927, surface2: 0xFF243634, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E8E8, muted: 0xFF8F9897, primary: 0xFF14B8A6, primary2: 0xFF119E8F, sidebar: 0xFF0D3734, sidebar2: 0xFF0B2F2D, flat: true, inspired: 'The dark twin of Mist Gray, Teal & Lilac', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89E9E, info: 0xFF48C8BA, violet: 0xFF43C6B8, pill: 0xFF14B8A6, pillOn: 0xFF0B1220, logo2: 0xFF0D3734, rowTint: 3, headTint: 10, hues: [0xFF0E7F73, 0xFF656EC2, 0xFF0E8174, 0xFF11786D, 0xFF0E8276, 0xFF0A2C2A, 0xFF0B655B, 0xFF108075]), glossy: Glossy(kpi: [0xFF14B8A6, 0xFF259085, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0D3734, 0xFF118478, 0xFFFFFFFF], sideTop: 0xFF0F5B54, sideBottom: 0xFF082422, chartLine: 0xFFF070AF)),
  Palette('pharmacy-green-dark', 'Pharmacy Green (dark)', true, bg: 0xFF031409, surface: 0xFF17271D, surface2: 0xFF25342B, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E8E6, muted: 0xFF909792, primary: 0xFF16A34A, primary2: 0xFF138C40, sidebar: 0xFF082B19, sidebar2: 0xFF072516, flat: true, inspired: 'The dark twin of Pharmacy Green', group: 'Greens & Teals',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88A8A, info: 0xFF55BC7B, violet: 0xFF5BBD7F, pill: 0xFF16A34A, pillOn: 0xFF0B1220, logo2: 0xFF082B19, rowTint: 3, headTint: 10, hues: [0xFF13873E, 0xFF082B19, 0xFF0F7234, 0xFF0F6732, 0xFF12833B, 0xFF062214, 0xFF0C5A29, 0xFF127F3B]), glossy: Glossy(kpi: [0xFF0F7234, 0xFF09441F, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF1A45A5, 0xFF102A63, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF5729A6, 0xFF341864, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA36908, 0xFF674205, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF082B19, 0xFF117939, 0xFFFFFFFF], sideTop: 0xFF0C4D27, sideBottom: 0xFF051C10, chartLine: 0xFFF59E0B)),
  Palette('royal-purple-dark', 'Royal Purple (dark)', true, bg: 0xFF0D091C, surface: 0xFF201D2E, surface2: 0xFF2D2B3B, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E6E8, muted: 0xFF94929A, primary: 0xFF6D4AE8, primary2: 0xFF5E40C8, sidebar: 0xFF150E24, sidebar2: 0xFF120C1F, flat: true, inspired: 'The dark twin of Royal Purple', group: 'Purples',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87171, info: 0xFFA18AF0, violet: 0xFFA48EF1, pill: 0xFF6D4AE8, pillOn: 0xFFFFFFFF, logo2: 0xFF150E24, rowTint: 3, headTint: 10, hues: [0xFF6D4AE8, 0xFF150E24, 0xFF4C34A2, 0xFF412C86, 0xFF5D3FC5, 0xFF110B1D, 0xFF3C2980, 0xFF5338AD]), glossy: Glossy(kpi: [0xFF6D4AE8, 0xFF4E35A7, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF150E24, 0xFF4E35A3, 0xFFFFFFFF], sideTop: 0xFF2E1F5B, sideBottom: 0xFF0E0917, chartLine: 0xFFEF67AA)),
  Palette('pharmacy-purple-dark', 'Pharmacy Purple (dark)', true, bg: 0xFF0F071C, surface: 0xFF221B2E, surface2: 0xFF2F293B, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E6E8, muted: 0xFF95919A, primary: 0xFF7C3AED, primary2: 0xFF6B32CC, sidebar: 0xFF1D0D3D, sidebar2: 0xFF190B34, flat: true, inspired: 'The dark twin of Pharmacy Purple', group: 'Purples',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87171, info: 0xFFAF88F5, violet: 0xFFAD83F5, pill: 0xFF7C3AED, pillOn: 0xFFFFFFFF, logo2: 0xFF1D0D3D, rowTint: 3, headTint: 10, hues: [0xFF7C3AED, 0xFF1D0D3D, 0xFF5729A6, 0xFF4D2495, 0xFF6931C9, 0xFF170A31, 0xFF442082, 0xFF602DB8]), glossy: Glossy(kpi: [0xFF5729A6, 0xFF341864, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF1A45A5, 0xFF102A63, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0F7234, 0xFF09441F, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA36908, 0xFF674205, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1D0D3D, 0xFF5B2AAF, 0xFFFFFFFF], sideTop: 0xFF381A6E, sideBottom: 0xFF130828, chartLine: 0xFFF59E0B)),
  Palette('alabaster-indigo-coral-dark', 'Alabaster, Indigo & Coral (dark)', true, bg: 0xFF09081B, surface: 0xFF1D1C2D, surface2: 0xFF2B2A3A, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E6E8, muted: 0xFF92929A, primary: 0xFF4F46E5, primary2: 0xFF443CC5, sidebar: 0xFF151335, sidebar2: 0xFF12102E, flat: true, inspired: 'The dark twin of Alabaster, Indigo & Coral', group: 'Purples',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF87171, info: 0xFF948FEE, violet: 0xFF918BEE, pill: 0xFF5A51E7, pillOn: 0xFFFFFFFF, logo2: 0xFF151335, rowTint: 3, headTint: 10, hues: [0xFF4F46E5, 0xFFC73C54, 0xFF3731A0, 0xFF322D8D, 0xFF433CC3, 0xFF110F2A, 0xFF2B277E, 0xFF3E37B0]), glossy: Glossy(kpi: [0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF151335, 0xFF3B34A7, 0xFFFFFFFF], sideTop: 0xFF252166, sideBottom: 0xFF0E0C22, chartLine: 0xFFEE5DA5)),
  Palette('royal-iris-butter-dark', 'Royal Iris & Butter Yellow (dark)', true, bg: 0xFF14121A, surface: 0xFF27252C, surface2: 0xFF343239, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E7E8, muted: 0xFF97969A, primary: 0xFFA692D6, primary2: 0xFF8F7EB8, sidebar: 0xFF290872, sidebar2: 0xFF230762, flat: true, inspired: 'The dark twin of Royal Iris & Butter Yellow', group: 'Purples',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89898, info: 0xFFBAAADF, violet: 0xFFBCADE0, pill: 0xFFFFF275, pillOn: 0xFF0B1220, logo2: 0xFF290872, rowTint: 3, headTint: 10, hues: [0xFF7A6B9D, 0xFF817000, 0xFF746696, 0xFF684DA4, 0xFF7D6EA1, 0xFF21065B, 0xFF5B5076, 0xFF8169B8]), glossy: Glossy(kpi: [0xFFA692D6, 0xFF8578A4, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFCA3E83, 0xFFAA346E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF290872, 0xFF7A62B3, 0xFFFFFFFF], sideTop: 0xFF4C2F8E, sideBottom: 0xFF1B054A, chartLine: 0xFFF070AF)),
  Palette('night-lime-dark', 'Lime on Charcoal (dark)', true, bg: 0xFF181D0D, surface: 0xFF2A2F20, surface2: 0xFF373B2D, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E8E7, muted: 0xFF999B94, primary: 0xFFC8F169, primary2: 0xFFACCF5A, sidebar: 0xFF16161D, sidebar2: 0xFF131319, flat: true, inspired: 'The dark twin of Lime on Charcoal', group: 'Neutral & Lime',
      duo: Duo(ok: 0xFF8AE6C5, warn: 0xFFFBD05E, danger: 0xFFF8C8C8, info: 0xFFCFF37B, violet: 0xFFD3F487, pill: 0xFFC8F169, pillOn: 0xFF0B1220, logo2: 0xFF16161D, rowTint: 3, headTint: 10, hues: [0xFF667A35, 0xFF16161D, 0xFF677C37, 0xFF687C3F, 0xFF687D37, 0xFF121217, 0xFF677D37, 0xFF667938]), glossy: Glossy(kpi: [0xFFC8F169, 0xFF90AE4C, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF16161D, 0xFF65793A, 0xFFFFFFFF], sideTop: 0xFF485332, sideBottom: 0xFF0E0E13, chartLine: 0xFFD08CD7)),
  Palette('charcoal-lime-dark', 'Charcoal on Lime (dark)', true, bg: 0xFF121213, surface: 0xFF252526, surface2: 0xFF323233, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E7E7, muted: 0xFF969696, primary: 0xFF9A9A9F, primary2: 0xFF848489, sidebar: 0xFFC8F169, sidebar2: 0xFFBCE363, flat: true, inspired: 'The dark twin of Charcoal on Lime', sidebarText: 0xFF1F1F2A, group: 'Neutral & Lime',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89898, info: 0xFFB0B0B5, violet: 0xFFB3B3B7, pill: 0xFF808084, pillOn: 0xFF0B1220, logo2: 0xFF646467, rowTint: 3, headTint: 10, hues: [0xFF717175, 0xFF667A35, 0xFF6C6C6F, 0xFF6C7951, 0xFF747477, 0xFF687D37, 0xFF555557, 0xFF6E755C]), glossy: Glossy(kpi: [0xFF9A9A9F, 0xFF7D7D80, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFFC8F169, 0xFFAAB88C, 0xFF0B1220], sideTop: 0xFFBBD978, sideBottom: 0xFF829D44, chartLine: 0xFFCD85D4)),
  Palette('pharmacy-amber-dark', 'Pharmacy Amber (dark)', true, bg: 0xFF1D1301, surface: 0xFF2F2615, surface2: 0xFF3B3323, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E7E6, muted: 0xFF9B968F, primary: 0xFFF59E0B, primary2: 0xFFD38809, sidebar: 0xFF291B04, sidebar2: 0xFF231703, flat: true, inspired: 'The dark twin of Pharmacy Amber', group: 'Warm',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF8A4A4, info: 0xFFF7AF35, violet: 0xFFF7B13C, pill: 0xFFF59E0B, pillOn: 0xFF0B1220, logo2: 0xFF291B04, rowTint: 3, headTint: 10, hues: [0xFF9F6708, 0xFF291B04, 0xFFA26808, 0xFF8F5D08, 0xFFA36808, 0xFF211603, 0xFF875706, 0xFFA36908]), glossy: Glossy(kpi: [0xFFA36908, 0xFF674205, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0F7234, 0xFF09441F, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF1A45A5, 0xFF102A63, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF5729A6, 0xFF341864, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF291B04, 0xFFA56A09, 0xFFFFFFFF], sideTop: 0xFF624006, sideBottom: 0xFF1B1203, chartLine: 0xFFAF87F5)),
  Palette('sandstone-terracotta-dark', 'Sandstone & Terracotta (dark)', true, bg: 0xFF1C0B01, surface: 0xFF2E1F15, surface2: 0xFF3B2C23, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E7E6, muted: 0xFF9A938F, primary: 0xFFEA580C, primary2: 0xFFC94C0A, sidebar: 0xFF1D1A19, sidebar2: 0xFF191616, flat: true, inspired: 'The dark twin of Sandstone & Terracotta', group: 'Warm',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88282, info: 0xFFF18C58, violet: 0xFFF1905E, pill: 0xFFEA580C, pillOn: 0xFF0B1220, logo2: 0xFF1D1A19, rowTint: 3, headTint: 10, hues: [0xFFC34909, 0xFF1D1A19, 0xFFA43E08, 0xFF843913, 0xFFC74B0A, 0xFF171514, 0xFF813007, 0xFFAD4510]), glossy: Glossy(kpi: [0xFFC84C0A, 0xFFA83F09, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1D1A19, 0xFFA24211, 0xFFFFFFFF], sideTop: 0xFF562B15, sideBottom: 0xFF131110, chartLine: 0xFFCA7DD1)),
  Palette('mono-scarlet-dark', 'Pure Monochrome & Scarlet (dark)', true, bg: 0xFF121212, surface: 0xFF252525, surface2: 0xFF323232, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE7E7E7, muted: 0xFF969696, primary: 0xFF979798, primary2: 0xFF828283, sidebar: 0xFF111113, sidebar2: 0xFF0F0F10, flat: true, inspired: 'The dark twin of Pure Monochrome & Scarlet', group: 'Neutral & Lime',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF89898, info: 0xFFB3B3B3, violet: 0xFFB1B1B2, pill: 0xFF979798, pillOn: 0xFF0B1220, logo2: 0xFF111113, rowTint: 3, headTint: 10, hues: [0xFF767676, 0xFFD43C3C, 0xFF6A6A6A, 0xFF545456, 0xFF717172, 0xFF0E0E0F, 0xFF535354, 0xFF6F6F70]), glossy: Glossy(kpi: [0xFF979798, 0xFF828282, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF111113, 0xFF686869, 0xFFFFFFFF], sideTop: 0xFF373738, sideBottom: 0xFF0B0B0C, chartLine: 0xFFCD85D4)),
  Palette('ubuntu-yaru-dark', 'Ubuntu Yaru (dark)', true, bg: 0xFF1C0A04, surface: 0xFF2E1E18, surface2: 0xFF3B2C26, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE8E7E6, muted: 0xFF9A9390, primary: 0xFFE95420, primary2: 0xFFC8481C, sidebar: 0xFF1F0015, sidebar2: 0xFF1B0012, flat: true, inspired: 'The dark twin of Ubuntu Yaru', group: 'Warm',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88282, info: 0xFFF08A66, violet: 0xFFF08D6B, pill: 0xFFE95420, pillOn: 0xFF0B1220, logo2: 0xFF1F0015, rowTint: 3, headTint: 10, hues: [0xFFCE4A1C, 0xFF1F0015, 0xFFA33B16, 0xFF842A1B, 0xFFC6471B, 0xFF190011, 0xFF802E12, 0xFFAC3B1D]), glossy: Glossy(kpi: [0xFFC8481C, 0xFFA83C17, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4F46E5, 0xFF3932A5, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0FA5B5, 0xFF2E8A94, 0xFF0B1220, 0xFF0B1220, 0x2E000000, 0xFF0B1220, 0xFFA21CAF, 0xFF75147E, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF1F0015, 0xFFA2371C, 0xFFFFFFFF], sideTop: 0xFF581818, sideBottom: 0xFF14000E, chartLine: 0xFFCA7DD1)),
  Palette('cool-crisp-dark', 'Cool & Crisp (dark)', true, bg: 0xFF07101E, surface: 0xFF1B2330, surface2: 0xFF29303C, border: 0x24FFFFFF, borderStrong: 0x33FFFFFF, text: 0xFFE6E7E9, muted: 0xFF91959C, primary: 0xFF3B82F6, primary2: 0xFF3370D4, sidebar: 0xFF0B101D, sidebar2: 0xFF090E19, flat: true, inspired: 'The dark twin of Cool & Crisp', group: 'Multi-colour',
      duo: Duo(ok: 0xFF34D399, warn: 0xFFFBBF24, danger: 0xFFF88A8A, info: 0xFF79A9F7, violet: 0xFF74A7F8, pill: 0xFF3B82F6, pillOn: 0xFF0B1220, logo2: 0xFF0B101D, rowTint: 3, headTint: 10, hues: [0xFF3473D9, 0xFF0E7F73, 0xFF5D60E3, 0xFF9F6708, 0xFFD73753, 0xFF090D17, 0xFF204887, 0xFF2D60B5]), glossy: Glossy(kpi: [0xFF295BAC, 0xFF193767, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF0E8174, 0xFF084D46, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFF4547A9, 0xFF2A2B65, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF, 0xFFA36908, 0xFF674205, 0xFFFFFFFF, 0xFFFFFFFF, 0x2EFFFFFF, 0xFFFFFFFF], hero: [0xFF0B101D, 0xFF2A5AAA, 0xFFFFFFFF], sideTop: 0xFF18305A, sideBottom: 0xFF070A13, chartLine: 0xFFF59E0B)),
];

/// The same theme in the other base: a light theme's dark twin or a twin's light theme (null when there is none).
String? twinOf(String id, bool dark) {
  final t = paletteById(id);
  if (t.dark == dark) return t.id;
  if (dark) return paletteTwins.where((p) => p.id == '${t.id}-dark').firstOrNull?.id;
  final light = t.id.endsWith('-dark') ? t.id.substring(0, t.id.length - 5) : null;
  return light != null && palettes.any((p) => p.id == light) ? light : null;
}

/// Themes retired → the new theme closest to each (a saved choice or an owner's list keeps working).
const retiredPalettes = {
  // 1.17.0: look-alikes merged into the closest kept theme (the owner's choice)
  'cobalt-amber': 'pharmacy-blue',
  'porcelain-signal': 'electric-blue',
  'deep-ocean-cyan': 'vibrant-neon',
  'lavender': 'royal-purple',
  'midnight-indigo': 'royal-purple',
  'obsidian-purple-mint': 'twilight-violet',
  'sage-emerald': 'emerald-mint',
  'mint-coral': 'mint-teal',
  'forest-green': 'pharmacy-green',
  'amber-gold': 'pharmacy-amber',
  'charcoal-gold': 'graphite-amber',
  'dark-forest': 'pharmacy-night',
  'daylight-clinical': 'mint-teal',
  'cobalt': 'electric-blue',
  'royal-violet': 'royal-purple',
  'sunrise': 'pharmacy-amber',
  'charcoal-sky': 'steel-blue',
  'lime-studio': 'charcoal-lime',
  'aqua-navy': 'ocean-cyan',
  'cobalt-blue': 'electric-blue',
  'sunny-orange': 'pharmacy-amber',
  'oled': 'navy-teal',
  'midnight-pro': 'navy-teal',
  'light': 'mint-teal',
  'hybrid-light': 'mint-teal',
  'solarized-light': 'mint-teal',
  'clinic-blue': 'sky-blue',
  'mint': 'emerald-mint',
  'rose-dawn': 'pharmacy-amber',
  'sand': 'pharmacy-amber',
  'coral': 'pharmacy-amber',
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
    palettes.where((p) => p.id == id).firstOrNull ?? paletteTwins.where((p) => p.id == id).firstOrNull ?? designPalettes.where((p) => p.id == id).firstOrNull ?? palettes.where((p) => p.id == currentPaletteId(id)).firstOrNull ?? palettes.first;

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
  ('gnome', 'GNOME', 'Linux Adwaita: clean rounded cards, pill buttons'),
  ('kde', 'KDE Plasma', 'Linux Breeze: crisp, compact, thin borders'),
  ('elementary', 'elementary OS', 'Linux Pantheon: airy, gentle shadows'),
  ('ubuntu', 'Ubuntu', 'Linux Yaru: rounded window cards'),
  ('ios', 'iOS', 'iPhone: frosted bars, rounded grouped cards, springy'),
  ('liquid', 'Liquid Glass', 'iOS 26: clear glass, capsule shapes'),
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
/// fill; info and the second accent are shades of the theme's own colour (the owner's choice, 17 Nov 2026), while OK,
/// warnings and danger are green, amber and red in every theme (1.14.0). Also the table colours and tints. Read with `context.tones`.
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
  /// the one real red (an exception to the two colours, 2026-11-18): only for what blocks a sale (expired stock)
  Color get block => surface.computeLuminance() < .2 ? const Color(0xFFF87171) : const Color(0xFFC62828);
  Color get blockSoft => soft(block, .14);
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
  final g = p.glossy;
  // the glossy menu's lighter top and the items' own tint: its words get headroom over AA (5.5:1), so they still read on them
  final text = p.sidebarText ?? (dark ? readable(0xFFAAB6CA, [p.sidebar, p.sidebar2, if (g != null) ...[g.sideTop, g.sideBottom]], 0xFFFFFFFF, g == null ? 4.5 : 5.5) : p.text);
  final active = readable(p.primary, [p.sidebar, p.sidebar2], dark ? 0xFFFFFFFF : 0xFF000000, 3);
  final d = p.duo;
  // the Pharmacy themes: a glow of the theme's colour at the top, deepening down (src/styles/glossy.css)
  return SideColors(top: Color(g?.sideTop ?? p.sidebar), bottom: Color(g?.sideBottom ?? p.sidebar2), text: Color(text), active: Color(active), dark: dark,
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
      // 1.17.0 (the owner's choice): the feel of Linux desktops and of the iPhone (src/styles/os-styles.css)
      'gnome' => const DesignTokens(radius: 12, controlRadius: 99, chipRadius: 99),
      'kde' => const DesignTokens(radius: 6, controlRadius: 4, chipRadius: 4, gap: 6, cardPadding: 8),
      'elementary' => const DesignTokens(radius: 10, controlRadius: 8, chipRadius: 8, softShadow: Color(0x2E000000)),
      'ubuntu' => const DesignTokens(radius: 14, controlRadius: 8, chipRadius: 12),
      'ios' => DesignTokens(radius: 14, controlRadius: 12, chipRadius: 9, glassAlpha: p.dark ? .72 : .80, motionMs: 350),
      'liquid' => DesignTokens(radius: 24, controlRadius: 99, chipRadius: 99, glassAlpha: p.dark ? .5 : .55, glows: [
          Color(p.primary).withValues(alpha: p.dark ? .26 : .22),
          Color(p.primary2).withValues(alpha: p.dark ? .20 : .16),
        ]),
      // three corner sizes (2026-11-18): 8 for chips and pills, 12 for buttons and fields, 18 for cards
      _ => const DesignTokens(radius: 18, controlRadius: 12, chipRadius: 8),
    };

/// The Flutter theme for a palette, an accent, a surface style, the colour level and the design tokens ([tokens]: a
/// design system's; otherwise the surface style's), laid out for a finger ([touch], Android) or a mouse (Windows).
/// [headingFont] and [bodyFont]: this device's chosen fonts (fonts.dart), once they are ready; null keeps the look's own.
ThemeData buildTheme(Palette base, {String accent = '', String surface = 'flat', bool vivid = false, DesignTokens? tokens, bool touch = false,
    String? headingFont, String? bodyFont, String gradient = 'off'}) {
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
          // dark cards: a lighter step above the page under a clearer hairline (2026-11-18)
          'flat' => BorderSide(color: p.dark ? Color(mix(p.border, 0xFFFFFFFF, .06)) : Color(p.border), width: tk.borderWidth),
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
  // E1 (UI batch 3): one type scale, as the classic app's --t-1..5: 28 / 20 / 16 / 14 / 12 (headlineMedium and the
  // display sizes stay for the few large figures)
  TextStyle? sz(TextStyle? x, double px) => x?.copyWith(fontSize: px);
  final text = m3.copyWith(
    displaySmall: head(m3.displaySmall, FontWeight.w700),
    headlineLarge: head(m3.headlineLarge),
    headlineMedium: head(m3.headlineMedium),
    headlineSmall: sz(head(m3.headlineSmall), 28),
    titleLarge: sz(head(m3.titleLarge, tk.headingWeight == FontWeight.w800 ? FontWeight.w700 : tk.headingWeight), 20),
    titleMedium: sz(tab(m3.titleMedium, FontWeight.w600), 16),
    titleSmall: sz(tab(m3.titleSmall, FontWeight.w600), 14),
    bodyLarge: sz(body(m3.bodyLarge), 16 * tk.textScale),
    bodyMedium: sz(body(m3.bodyMedium), 14 * tk.textScale),
    bodySmall: sz(body(m3.bodySmall)?.copyWith(color: Color(muted)), 12 * tk.textScale),
    labelLarge: sz(tab(m3.labelLarge, FontWeight.w600), 14),
    labelMedium: sz(tab(m3.labelMedium, FontWeight.w600), 12),
    labelSmall: sz(tab(m3.labelSmall), 12),
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
    // 1.17.0 gradients (src/gradients.js): Soft or Bold glows of the theme's own colours behind the pages
    extensions: [LookLevel(vivid: vivid), tk.copyWith(backdrop: tk.backdrop, glows: gradient == 'off' ? tk.glows : [
          Color(p.primary).withValues(alpha: gradient == 'bold' ? .34 : .16),
          Color(p.glossy != null ? p.glossy!.kpi[6] : p.primary2).withValues(alpha: gradient == 'bold' ? .30 : .14),
          Color(p.glossy != null ? p.glossy!.kpi[18] : p.primary2).withValues(alpha: gradient == 'bold' ? .16 : .07),
        ]), sideColorsOf(p), tonesOf(p), if (p.glossy != null) p.glossy!],
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
    // E4: on a touch screen every icon button is a full finger's target (48 px)
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: tk.touch ? Size(tap, tap) : Size(tap - 4, tap - 4))),
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
    // a clear ring in the theme's colour (2026-11-18)
    focusColor: focusRing.withValues(alpha: p.dark ? .32 : .22),
    scrollbarTheme: ScrollbarThemeData(radius: const Radius.circular(8), thickness: WidgetStatePropertyAll(tk.touch ? 4 : 8), thumbColor: WidgetStatePropertyAll(Color(p.borderStrong))),
  );
}
