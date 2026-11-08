// Fonts on this device (This device → Fonts): a font pack (a heading font and a body font that go well together) or
// any two fonts. The system's own font is the standard and needs nothing; another font is downloaded once, the first
// time it is chosen (font_files.dart), kept on Windows and Android so it works offline, and used as soon as it is
// there. Until then, or without the internet, the app keeps the font it had.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rxpos/core/theme/font_cache_io.dart' if (dart.library.js_interop) 'package:rxpos/core/theme/font_cache_web.dart';
import 'package:rxpos/core/web/web_keep_stub.dart' if (dart.library.js_interop) 'package:rxpos/core/web/web_keep_web.dart';

import '../database/app_database.dart';
import 'font_files.dart';

export 'font_files.dart' show fontFiles;

/// The system's own font (Segoe UI on Windows, Roboto on Android, the browser's on the web).
const systemFont = '';

class FontPack {
  const FontPack(this.id, this.name, this.heading, this.body, this.description);
  final String id, name, heading, body, description;
}

const fontPacks = <FontPack>[
  FontPack('system', 'System (standard)', systemFont, systemFont, "This computer's or phone's own font: nothing to download."),
  FontPack('inter', 'Inter', 'Inter', 'Inter', 'Clean and very readable at every size; made for screens.'),
  FontPack('clinical', 'Clinical', 'IBM Plex Sans', 'Source Sans 3', 'Precise, technical headings over a calm, open text font.'),
  FontPack('geometric', 'Geometric', 'Poppins', 'Inter', 'Round, modern headings with Inter for figures and lists.'),
  FontPack('friendly', 'Friendly', 'Nunito', 'Nunito', 'Soft, rounded letters for a warm counter.'),
  FontPack('editorial', 'Editorial', 'Playfair Display', 'Inter', 'Elegant serif headings, as in a magazine, with a plain text font.'),
  FontPack('classic', 'Classic serif', 'Merriweather', 'Lato', 'Traditional, sturdy serif headings with a friendly text font.'),
  FontPack('book', 'Book', 'Lora', 'Source Sans 3', 'Calligraphic serif headings, quiet sans text.'),
  FontPack('tech', 'Tech', 'Space Grotesk', 'IBM Plex Sans', 'Quirky, futuristic headings over a crisp engineering font.'),
  FontPack('corporate', 'Corporate', 'Montserrat', 'Open Sans', 'Confident, wide headings and the familiar Open Sans.'),
  FontPack('startup', 'Startup', 'Plus Jakarta Sans', 'Manrope', 'The look of modern product sites: tight and polished.'),
  FontPack('boutique', 'Boutique', 'DM Serif Display', 'DM Sans', 'High-contrast display serif with its matching sans.'),
  FontPack('bold', 'Bold & simple', 'Outfit', 'Work Sans', 'Strong, simple shapes; easy to read from a distance.'),
  FontPack('slab', 'Slab', 'Roboto Slab', 'Roboto Slab', 'Solid, square serifs, like labels and signs.'),
  FontPack('legible', 'Most legible', 'Atkinson Hyperlegible', 'Atkinson Hyperlegible', 'Designed for low vision: every letter easy to tell apart.'),
  FontPack('global', 'Global', 'Noto Sans', 'Noto Sans', 'Neutral, and covers the most languages and symbols.'),
];

FontPack? packById(String id) => fontPacks.where((p) => p.id == id).firstOrNull;

/// The fonts chosen on this device: a pack's, or any two ('custom').
class FontChoice {
  const FontChoice({this.pack = 'system', this.heading = systemFont, this.body = systemFont});
  final String pack, heading, body;

  Map<String, Object?> toJson() => {'pack': pack, 'heading': heading, 'body': body};

  static FontChoice parse(String? v) {
    try {
      final j = (jsonDecode(v ?? '{}') as Map).cast<String, Object?>();
      String fam(Object? f) => fontFiles.containsKey(f) ? '$f' : systemFont;
      final p = packById('${j['pack']}');
      return p != null ? FontChoice(pack: p.id, heading: p.heading, body: p.body) : FontChoice(pack: 'custom', heading: fam(j['heading']), body: fam(j['body']));
    } catch (_) {
      return const FontChoice();
    }
  }

  static FontChoice ofPack(FontPack p) => FontChoice(pack: p.id, heading: p.heading, body: p.body);
}

const fontsKey = 'device:fonts';

class FontsController extends AsyncNotifier<FontChoice> {
  @override
  Future<FontChoice> build() async {
    final db = ref.watch(appDatabaseProvider);
    final row = await (db.select(db.kv)..where((x) => x.k.equals(fontsKey))).getSingleOrNull();
    final c = FontChoice.parse(row?.v);
    _load(c);
    return c;
  }

  Future<void> choose(FontChoice c) async {
    final db = ref.read(appDatabaseProvider);
    final v = jsonEncode(c.toJson());
    await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: fontsKey, v: v));
    webKeep(fontsKey, v);
    state = AsyncData(c);
    await _load(c);
  }

  Future<void> _load(FontChoice c) async {
    if (!ref.mounted) return;
    final loader = ref.read(loadedFontsProvider.notifier);
    await Future.wait([for (final f in {c.heading, c.body}) if (f != systemFont) loader.ensure(f)]);
  }
}

final fontsProvider = AsyncNotifierProvider<FontsController, FontChoice>(FontsController.new);

/// Downloads a font file (tests replace it).
final fontDownloadProvider = Provider<Future<Uint8List> Function(String url)>((_) {
  final dio = Dio(BaseOptions(responseType: ResponseType.bytes, receiveTimeout: const Duration(seconds: 60)));
  return (url) async => Uint8List.fromList((await dio.get<List<int>>(url)).data!);
});

/// Makes a font file usable under a family name (tests replace it).
final fontRegisterProvider = Provider<Future<void> Function(String family, List<Uint8List> files)>((_) => (family, files) async {
      final loader = FontLoader(family);
      for (final f in files) {
        loader.addFont(Future.value(ByteData.sublistView(f)));
      }
      await loader.load();
    });

/// The font families ready on this device now, and those that failed (no internet).
class FontsState {
  const FontsState({this.ready = const {}, this.loading = const {}, this.failed = const {}});
  final Set<String> ready, loading, failed;
}

class LoadedFonts extends Notifier<FontsState> {
  @override
  FontsState build() => const FontsState();

  /// Get [family] ready: from this device when kept, else downloaded (all its weights) and kept.
  Future<void> ensure(String family) async {
    final files = fontFiles[family];
    if (files == null || state.ready.contains(family) || state.loading.contains(family)) return;
    state = FontsState(ready: state.ready, loading: {...state.loading, family}, failed: {...state.failed}..remove(family));
    try {
      final download = ref.read(fontDownloadProvider);
      final bytes = await Future.wait([
        for (final e in files.entries)
          () async {
            final name = '${family.replaceAll(' ', '')}-${e.key}-${e.value.split('/').last}';
            final kept = await readCachedFont(name);
            if (kept != null && kept.isNotEmpty) return kept;
            final b = await download(e.value);
            await writeCachedFont(name, b);
            return b;
          }(),
      ]);
      await ref.read(fontRegisterProvider)(family, bytes);
      if (!ref.mounted) return;
      state = FontsState(ready: {...state.ready, family}, loading: {...state.loading}..remove(family), failed: state.failed);
    } catch (_) {
      if (!ref.mounted) return;
      state = FontsState(ready: state.ready, loading: {...state.loading}..remove(family), failed: {...state.failed, family});
    }
  }
}

final loadedFontsProvider = NotifierProvider<LoadedFonts, FontsState>(LoadedFonts.new);

/// The heading and body fonts to draw with now: the chosen ones once they are ready (null: the theme's own).
(String?, String?) fontsInUse(FontChoice c, FontsState s) =>
    (c.heading != systemFont && s.ready.contains(c.heading) ? c.heading : null, c.body != systemFont && s.ready.contains(c.body) ? c.body : null);
