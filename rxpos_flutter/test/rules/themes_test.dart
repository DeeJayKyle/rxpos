// Colour themes (src/themes.js): the 15 two-colour palettes in five sets, readable everywhere (WCAG AA), accents, the owner's choice, light / dark.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/theme/theme_choice.dart';
import 'package:rxpos/core/theme/themes.dart';

int argb(Color c) => c.toARGB32();

void main() {
  test('the 15 two-colour themes in five sets of three, every one readable with every accent', () {
    expect(palettes, hasLength(15));
    expect(palettes.where((p) => p.dark), hasLength(1));
    expect(paletteGroups, hasLength(5));
    expect(paletteGroups.every((g) => palettes.where((p) => p.group == g).length == 3), isTrue);
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
    expect(allowedPalettes(null), hasLength(15));
  });

  test('accents change only the action colour; the look is kept as JSON', () {
    final p = paletteById('lavender');
    expect(withAccent(p, 'ocean').primary, 0xFF1D64D8);
    expect(withAccent(p, 'ocean').bg, p.bg);
    final l = Look.parse('{"theme":"nord","mode":"system","accent":"violet","surface":"glass","level":"vivid"}');
    expect((l.theme, l.system, l.accent, l.surface, l.level), ('navy-teal', true, 'violet', 'glass', 'vivid'));
    expect(Look.parse('{"theme":"nope","surface":"x"}').theme, 'mint-teal');
    // the React app's look from the start: Mint Teal (RxPOS Navy Teal when the system is dark), no design system
    expect((Look.parse('garbage').design, Look.parse('garbage').theme, Look.parse('garbage').system, Look.parse('garbage').surface), ('', 'mint-teal', true, 'flat'));
    expect(buildTheme(p, vivid: true).extension<LookLevel>()!.vivid, isTrue);
  });

  test('Aurora is the standard look: a device on the old standard moves to it once; Flat chosen since stays', () {
    expect(Look.parse('{"theme":"nord","surface":"flat"}').surface, 'aurora');
    expect(Look.parse('{"v":2,"theme":"nord","surface":"flat"}').surface, 'flat');
    // version 4: the React app's look is the standard; a device on RxPOS Green (the old Flutter standard) moves off it once
    expect(Look.parse('{"v":3,"design":"rxpos-green","theme":"rxpos-green"}').design, '');
    expect(Look.parse('{"v":3,"design":"rxpos-green","theme":"rxpos-green"}').theme, 'mint-teal');
    expect(Look.parse('{"v":4,"design":"rxpos-green","theme":"rxpos-green"}').design, 'rxpos-green', reason: 'chosen since: kept');
    expect(Look.parse('{"v":3,"design":"split-pane","theme":"split-pane"}').design, 'split-pane');
    expect(Look.parse('{"v":2,"theme":"dracula","surface":"aurora"}').design, '');
    expect(Look.parse(jsonEncode(Look.parse('{"surface":"flat"}').copyWith(surface: 'flat').toJson())).surface, 'flat');
    final t = buildTheme(paletteById('electric-blue'), surface: 'aurora');
    expect(t.extension<DesignTokens>()!.hasBackdrop, isTrue);
    expect(t.cardTheme.color!.a, lessThan(1), reason: 'translucent panels over the backdrop');
    expect(buildTheme(paletteById('electric-blue')).extension<DesignTokens>()!.hasBackdrop, isFalse);
  });

  group('design systems', () {
    test('fourteen of them, each with its own palette; picked by id, unknown ids ignored', () {
      expect(designSystems.length, 14);
      expect(designSystems.where((d) => d.group == 'pos').length, 6);
      for (final d in designSystems) {
        expect(paletteById(d.palette).id, d.palette, reason: d.id);
      }
      expect(Look.parse('{"design":"brutalist"}').designSystem?.name, 'Neo-Brutalist Pop');
      expect(Look.parse('{"v":3,"design":"nope"}').design, '');
    });

    test('every design is readable: text on its page and panels at least 4.5:1, white or dark text on its buttons', () {
      for (final d in designSystems) {
        final t = buildTheme(paletteById(d.palette), surface: d.surface, tokens: d.tokens);
        final cs = t.colorScheme;
        final bg = d.tokens.backdrop.isNotEmpty ? d.tokens.backdrop : [t.scaffoldBackgroundColor];
        for (final b in [...bg, cs.surface]) {
          expect(contrast(cs.onSurface.toARGB32(), b.toARGB32()), greaterThanOrEqualTo(4.5), reason: '${d.id}: text on ${b.toARGB32().toRadixString(16)}');
        }
        expect(contrast(cs.onPrimary.toARGB32(), cs.primary.toARGB32()), greaterThanOrEqualTo(4.5), reason: '${d.id}: button text');
        for (final b in [if (d.tokens.glassAlpha != null) ...d.tokens.backdrop, cs.surface]) {
          expect(contrast(cs.tertiary.toARGB32(), b.toARGB32()), greaterThanOrEqualTo(4.5), reason: '${d.id}: prices and links');
        }
      }
    });

    test('tap targets: 44 px with a mouse, 48 dp with a finger, 64 for Target Tap whatever the device', () {
      Size? filled(ThemeData t) => t.filledButtonTheme.style!.minimumSize!.resolve({});
      final split = designById('split-pane')!, tap = designById('target-tap')!;
      expect(filled(buildTheme(paletteById(split.palette), tokens: split.tokens))!.height, 44);
      expect(filled(buildTheme(paletteById(split.palette), tokens: split.tokens, touch: true))!.height, 48);
      expect(filled(buildTheme(paletteById(tap.palette), tokens: tap.tokens))!.height, 64);
      expect(buildTheme(paletteById('light'), touch: true).materialTapTargetSize, MaterialTapTargetSize.padded);
    });

    test('Neo-Brutalist: thick black borders and a hard shadow drawn only outside the card; Bauhaus: square corners', () {
      final b = designById('brutalist')!;
      final shape = buildTheme(paletteById(b.palette), tokens: b.tokens).cardTheme.shape! as HardShadowBorder;
      expect((shape.side.width, shape.side.color, shape.offset), (2.5, Colors.black, 2.0));
      final bau = designById('bauhaus')!;
      final r = buildTheme(paletteById(bau.palette), tokens: bau.tokens).cardTheme.shape! as RoundedRectangleBorder;
      expect(r.borderRadius, BorderRadius.circular(0));
      expect(buildTheme(paletteById(bau.palette), tokens: bau.tokens).textTheme.headlineSmall!.fontFamily, 'Georgia');
    });
  });
}
