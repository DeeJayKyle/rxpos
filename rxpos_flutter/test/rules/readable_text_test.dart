// 1.14.0: brand-coloured words and icons use the colour made readable for text (colorScheme.tertiary), never the
// button fill (colorScheme.primary): on Sky Blue, Ocean Cyan, Emerald Mint, Amber Gold and Charcoal Lime the fill is a
// pale colour that reads at 1.3–2.5:1 on the page. Fills, borders and tints may still use primary.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('no text or icon is drawn in the button fill colour', () {
    final usesFill = RegExp(r'\b(colorScheme|cs|scheme)\.primary\b(?!Container)(?!\.withValues)');
    final drawsWords = RegExp(r'(TextStyle\(|\bText\(|\bIcon\()');
    final bad = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      final lines = f.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final l = lines[i];
        if (!drawsWords.hasMatch(l) || !usesFill.hasMatch(l)) continue;
        // a fill or border on the same line is fine: only a colour handed to the words or the icon counts
        if (RegExp(r'(BoxDecoration|BorderSide|Border\.all|backgroundColor)').hasMatch(l)) continue;
        bad.add('${f.path}:${i + 1}');
      }
    }
    expect(bad, isEmpty);
  });
}
