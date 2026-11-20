// Colour themes (src/themes.js): the 41 palettes in six sets (twelve dark; a glossy theme in each set, the Multi-colour set all glossy, since 1.15.0), readable everywhere (WCAG AA), the owner's choice, light / dark.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/theme/theme_choice.dart';
import 'package:rxpos/core/theme/themes.dart';

int argb(Color c) => c.toARGB32();

void main() {
  test('the 43 themes in six sets of three to nine, every one readable with every accent', () {
    expect(palettes, hasLength(43));
    expect(palettes.where((p) => p.dark), hasLength(13));
    expect(palettes.where((p) => p.group == 'Dark').every((p) => p.dark), isTrue);
    expect(paletteGroups, hasLength(6));
    expect(paletteGroups.every((g) => palettes.where((p) => p.group == g).length >= 3 && palettes.where((p) => p.group == g).length <= 9), isTrue);
    expect(palettes.every((p) => paletteGroups.contains(p.group) && p.duo != null), isTrue);
    // a retired theme opens as the kept one closest to it (the same map as src/themes.js RETIRED)
    expect((paletteById('tokyo-night').id, paletteById('mint').id, paletteById('light').id, paletteById('daylight-clinical').id, paletteById('oled').id),
        ('navy-teal', 'emerald-mint', 'mint-teal', 'mint-teal', 'navy-teal'));
    for (final p in palettes) {
      for (final a in ['', for (final x in accents) x.$1]) {
        final t = buildTheme(p, accent: a).colorScheme;
        expect(contrast(argb(t.onPrimary), argb(t.primary)), greaterThanOrEqualTo(4.5), reason: '${p.id} $a button');
        expect(contrast(argb(t.onSurfaceVariant), argb(t.surface)), greaterThanOrEqualTo(4.5), reason: '${p.id} muted text');
        expect(contrast(argb(t.tertiary), argb(t.surface)), greaterThanOrEqualTo(4.5), reason: '${p.id} links');
      }
    }
  });

  test('every theme is glossy (1.15.0): its figure cards, banner and menu read at AA', () {
    expect(palettes.every((p) => p.glossy != null), isTrue);
    for (final p in palettes.where((p) => p.glossy != null)) {
      final g = p.glossy!;
      expect(g.kpi, hasLength(24));
      for (var i = 0; i < 4; i++) {
        final c = g.card(i);
        for (final bg in [c.a, c.b]) {
          expect(contrast(argb(c.on), argb(bg)), greaterThanOrEqualTo(4.5), reason: '${p.id} card $i words');
          expect(contrast(argb(c.sub), argb(bg)), greaterThanOrEqualTo(4.5), reason: '${p.id} card $i line');
        }
      }
      for (final bg in [g.hero[0], g.hero[1]]) {
        expect(contrast(g.hero[2], bg), greaterThanOrEqualTo(4.5), reason: '${p.id} banner');
      }
      final t = buildTheme(p);
      expect(t.extension<Glossy>(), isNotNull);
      final side = t.extension<SideColors>()!;
      expect(contrast(argb(side.text), argb(side.top)), greaterThanOrEqualTo(4.5), reason: '${p.id} menu top');
    }
  });

  test('1.17.0: a dark twin for every light theme, readable; Dark moves to it and Light back; the six new styles', () {
    expect(paletteTwins.length, palettes.where((p) => !p.dark).length);
    expect(paletteTwins.every((p) => p.dark && p.id.endsWith('-dark') && palettes.any((x) => '${x.id}-dark' == p.id && x.group == p.group)), isTrue);
    expect((twinOf('pharmacy-green', true), twinOf('pharmacy-green-dark', false), twinOf('navy-teal', false)), ('pharmacy-green-dark', 'pharmacy-green', null));
    expect(paletteById('pharmacy-green-dark').primary, paletteById('pharmacy-green').primary);
    for (final p in paletteTwins) {
      final t = buildTheme(p).colorScheme;
      expect(contrast(argb(t.onPrimary), argb(t.primary)), greaterThanOrEqualTo(4.5), reason: '${p.id} button');
      expect(contrast(argb(t.onSurfaceVariant), argb(t.surface)), greaterThanOrEqualTo(4.5), reason: '${p.id} muted text');
    }
    for (final s in ['gnome', 'kde', 'elementary', 'ubuntu', 'ios', 'liquid']) {
      expect(surfaceStyles.any((x) => x.$1 == s), isTrue, reason: s);
    }
    expect(buildTheme(paletteById('mint-teal'), gradient: 'bold').extension<DesignTokens>()!.glows, hasLength(3));
    expect(Look.parse('{"theme":"pharmacy-green-dark","gradient":"soft"}').theme, 'pharmacy-green-dark');
    expect(Look.parse('{"theme":"pharmacy-green-dark","gradient":"soft"}').gradient, 'soft');
  });

  test('containers and the inverse surface (snack bars) are readable at AA in every theme, light and dark', () {
    for (final p in palettes) {
      final t = buildTheme(p).colorScheme;
      for (final (name, on, bg) in [
        ('error', t.onErrorContainer, t.errorContainer),
        ('secondary', t.onSecondaryContainer, t.secondaryContainer),
        ('tertiary', t.onTertiaryContainer, t.tertiaryContainer),
        ('inverse', t.onInverseSurface, t.inverseSurface),
      ]) {
        expect(contrast(argb(on), argb(bg)), greaterThanOrEqualTo(4.5), reason: '${p.id} $name container');
      }
    }
  });
  test('light / dark picks Mint Teal / RxPOS Navy Teal, then the owner\'s default; the owner can limit the list', () {
    expect(paletteFor(true), 'navy-teal');
    expect(paletteFor(false), 'mint-teal');
    final noDefaults = palettes.where((p) => !{'navy-teal', 'mint-teal'}.contains(p.id)).toList();
    expect(paletteFor(false, noDefaults), 'electric-blue');
    // an owner's list made before the two-colour themes: retired ids count as their replacements
    final some = allowedPalettes({'themes': ['light', 'dracula', 'nord']});
    expect(some.map((p) => p.id), ['mint-teal', 'navy-teal']);
    expect(paletteFor(true, some, 'nord'), 'navy-teal');
    expect(allowedPalettes(null), hasLength(43));
  });

  test('only the 43 themes (the owner\'s choice): no accent presets, no design systems; old saved looks fall back to them', () {
    expect(accents, isEmpty);
    expect(designSystems, isEmpty);
    expect(designPalettes, isEmpty);
    final l = Look.parse('{"theme":"nord","mode":"system","accent":"violet","surface":"glass","level":"vivid"}');
    expect((l.theme, l.system, l.accent, l.surface, l.level), ('navy-teal', true, '', 'glass', 'vivid'), reason: 'the accent is dropped');
    expect(Look.parse('{"v":4,"design":"brutalist","theme":"brutalist"}').design, '');
    expect(Look.parse('{"v":4,"design":"brutalist","theme":"brutalist"}').theme, 'mint-teal');
    expect(Look.parse('{"theme":"nope","surface":"x"}').theme, 'mint-teal');
    // the React app's look from the start: Mint Teal (RxPOS Navy Teal when the system is dark)
    expect((Look.parse('garbage').design, Look.parse('garbage').theme, Look.parse('garbage').system, Look.parse('garbage').surface), ('', 'mint-teal', true, 'flat'));
    expect(buildTheme(paletteById('lavender'), vivid: true).extension<LookLevel>()!.vivid, isTrue);
  });

  test('Aurora is the standard look: a device on the old standard moves to it once; Flat chosen since stays', () {
    expect(Look.parse('{"theme":"nord","surface":"flat"}').surface, 'aurora');
    expect(Look.parse('{"v":2,"theme":"nord","surface":"flat"}').surface, 'flat');
    // version 4: the React app's look is the standard; a device on RxPOS Green (the old Flutter standard) moves off it once
    expect(Look.parse('{"v":3,"design":"rxpos-green","theme":"rxpos-green"}').design, '');
    expect(Look.parse('{"v":3,"design":"rxpos-green","theme":"rxpos-green"}').theme, 'mint-teal');
    expect(Look.parse('{"v":2,"theme":"dracula","surface":"aurora"}').design, '');
    expect(Look.parse(jsonEncode(Look.parse('{"surface":"flat"}').copyWith(surface: 'flat').toJson())).surface, 'flat');
    final t = buildTheme(paletteById('electric-blue'), surface: 'aurora');
    expect(t.extension<DesignTokens>()!.hasBackdrop, isTrue);
    expect(t.cardTheme.color!.a, lessThan(1), reason: 'translucent panels over the backdrop');
    expect(buildTheme(paletteById('electric-blue')).extension<DesignTokens>()!.hasBackdrop, isFalse);
  });
}
