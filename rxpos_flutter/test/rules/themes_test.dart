// Colour themes (src/themes.js): 28 palettes, readable everywhere (WCAG AA), accents, the owner's choice, light / dark.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/theme/theme_choice.dart';
import 'package:rxpos/core/theme/themes.dart';

int argb(Color c) => c.toARGB32();

void main() {
  test('28 themes, every one readable with every accent', () {
    expect(palettes, hasLength(28));
    expect(palettes.where((p) => p.dark), hasLength(15));
    for (final p in palettes) {
      for (final a in ['', for (final x in accents) x.$1]) {
        final t = buildTheme(p, accent: a).colorScheme;
        expect(contrast(argb(t.onPrimary), argb(t.primary)), greaterThanOrEqualTo(4.5), reason: '${p.id} $a button');
        expect(contrast(argb(t.onSurfaceVariant), argb(t.surface)), greaterThanOrEqualTo(4.5), reason: '${p.id} muted text');
        expect(contrast(argb(t.tertiary), argb(t.surface)), greaterThanOrEqualTo(4.5), reason: '${p.id} links');
      }
    }
  });

  test('light / dark picks the Adaptive Hybrid first, then the owner\'s default; the owner can limit the list', () {
    expect(paletteFor(true), 'hybrid-dark');
    expect(paletteFor(false), 'hybrid-light');
    final some = allowedPalettes({'themes': ['light', 'dracula', 'nord']});
    expect(some.map((p) => p.id), ['light', 'nord', 'dracula']);
    expect(paletteFor(true, some, 'nord'), 'nord');
    expect(allowedPalettes(null), hasLength(28));
  });

  test('accents change only the action colour; the look is kept as JSON', () {
    final p = paletteById('dracula');
    expect(withAccent(p, 'ocean').primary, 0xFF267BFF);
    expect(withAccent(p, 'ocean').bg, p.bg);
    final l = Look.parse('{"theme":"nord","mode":"system","accent":"violet","surface":"glass","level":"vivid"}');
    expect((l.theme, l.system, l.accent, l.surface, l.level), ('nord', true, 'violet', 'glass', 'vivid'));
    expect(Look.parse('{"theme":"nope","surface":"x"}').theme, 'light');
    expect((Look.parse('garbage').design, Look.parse('garbage').surface), ('rxpos-green', 'flat'));
    expect(buildTheme(p, vivid: true).extension<LookLevel>()!.vivid, isTrue);
  });

  test('Aurora is the standard look: a device on the old standard moves to it once; Flat chosen since stays', () {
    expect(Look.parse('{"theme":"nord","surface":"flat"}').surface, 'aurora');
    expect(Look.parse('{"v":2,"theme":"nord","surface":"flat"}').surface, 'flat');
    // RxPOS Green is the standard from version 3: light looks move to it once; dark ones and the system's stay
    expect(Look.parse('{"v":2,"theme":"light","surface":"aurora"}').design, 'rxpos-green');
    expect(Look.parse('{"v":2,"theme":"dracula","surface":"aurora"}').design, '');
    expect(Look.parse('{"v":3,"theme":"light","surface":"aurora"}').design, '');
    expect(Look.parse(jsonEncode(Look.parse('{"surface":"flat"}').copyWith(surface: 'flat').toJson())).surface, 'flat');
    final t = buildTheme(paletteById('light'), surface: 'aurora');
    expect(t.extension<DesignTokens>()!.hasBackdrop, isTrue);
    expect(t.cardTheme.color!.a, lessThan(1), reason: 'translucent panels over the backdrop');
    expect(buildTheme(paletteById('light')).extension<DesignTokens>()!.hasBackdrop, isFalse);
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
