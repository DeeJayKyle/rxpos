// Colour themes (src/themes.js): 28 palettes, readable everywhere (WCAG AA), accents, the owner's choice, light / dark.
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
    expect(Look.parse('garbage').surface, 'flat');
    expect(buildTheme(p, vivid: true).extension<LookLevel>()!.vivid, isTrue);
  });
}
