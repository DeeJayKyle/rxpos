// Font packs (This device → Fonts): the choice kept on the device, each font downloaded once in all its weights,
// failures reported, and the theme drawing with a font only once it is ready.
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/theme/fonts.dart';
import 'package:rxpos/core/theme/themes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every pack uses fonts that exist, ids are unique, and each font has a regular and a bold weight', () {
    expect(fontPacks.map((p) => p.id).toSet().length, fontPacks.length);
    for (final p in fontPacks) {
      for (final f in [p.heading, p.body]) {
        if (f == systemFont) continue;
        expect(fontFiles.containsKey(f), isTrue, reason: '${p.id}: $f');
      }
    }
    for (final e in fontFiles.entries) {
      expect(e.value.containsKey(400) || e.value.length == 1, isTrue, reason: e.key);
      expect(e.value.values.every((u) => u.startsWith('https://fonts.gstatic.com/') && u.endsWith('.ttf')), isTrue, reason: e.key);
    }
  });

  test('the saved choice: a pack, any two fonts, or the system font for anything unknown', () {
    expect(FontChoice.parse('{"pack":"editorial"}').heading, 'Playfair Display');
    final c = FontChoice.parse('{"pack":"custom","heading":"Lora","body":"Nope"}');
    expect((c.pack, c.heading, c.body), ('custom', 'Lora', systemFont));
    expect(FontChoice.parse('not json').pack, 'system');
    expect(FontChoice.parse(null).body, systemFont);
  });

  test('a font is used only once it is ready', () {
    const c = FontChoice(pack: 'custom', heading: 'Lora', body: 'Inter');
    expect(fontsInUse(c, const FontsState()), (null, null));
    expect(fontsInUse(c, const FontsState(ready: {'Inter'})), (null, 'Inter'));
    expect(fontsInUse(const FontChoice(), const FontsState(ready: {'Inter'})), (null, null));
  });

  test('choosing a pack downloads each font once, in all its weights, and registers it; a failure is reported', () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final downloads = <String>[];
    final registered = <String, int>{};
    var offline = false;
    final c = ProviderContainer(overrides: [
      appDatabaseProvider.overrideWithValue(db),
      fontDownloadProvider.overrideWithValue((url) async {
        if (offline) throw Exception('no internet');
        downloads.add(url);
        return Uint8List.fromList([1, 2, 3]);
      }),
      fontRegisterProvider.overrideWithValue((family, files) async => registered[family] = files.length),
    ]);
    addTearDown(c.dispose);
    await c.read(fontsProvider.future);
    await c.read(fontsProvider.notifier).choose(FontChoice.ofPack(packById('editorial')!));
    expect(registered, {'Playfair Display': fontFiles['Playfair Display']!.length, 'Inter': fontFiles['Inter']!.length});
    expect(downloads.length, fontFiles['Playfair Display']!.length + fontFiles['Inter']!.length);
    expect(c.read(loadedFontsProvider).ready, {'Playfair Display', 'Inter'});

    // Inter again (another pack): not downloaded again
    await c.read(fontsProvider.notifier).choose(FontChoice.ofPack(packById('geometric')!));
    expect(downloads.where((u) => fontFiles['Inter']!.values.contains(u)).length, fontFiles['Inter']!.length);

    // no internet: reported, nothing used
    offline = true;
    await c.read(fontsProvider.notifier).choose(const FontChoice(pack: 'custom', heading: 'Lora', body: systemFont));
    expect(c.read(loadedFontsProvider).failed, {'Lora'});
    expect(fontsInUse(c.read(fontsProvider).value!, c.read(loadedFontsProvider)), (null, null));

    // the choice is kept on the device
    final c2 = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db), fontRegisterProvider.overrideWithValue((_, _) async {}),
      fontDownloadProvider.overrideWithValue((_) async => Uint8List(1))]);
    addTearDown(c2.dispose);
    expect((await c2.read(fontsProvider.future)).heading, 'Lora');
  });

  test('the theme draws text in the body font and headings in the heading font', () {
    final th = buildTheme(palettes.first, headingFont: 'Lora', bodyFont: 'Inter');
    expect(th.textTheme.bodyMedium?.fontFamily, 'Inter');
    expect(th.textTheme.labelLarge?.fontFamily, 'Inter');
    expect(th.textTheme.headlineSmall?.fontFamily, 'Lora');
    final plain = buildTheme(palettes.first);
    expect(plain.textTheme.bodyMedium?.fontFamily, isNot('Inter'));
    expect(Typography.material2021().black.bodyMedium?.fontFamily, plain.textTheme.bodyMedium?.fontFamily);
  });
}
