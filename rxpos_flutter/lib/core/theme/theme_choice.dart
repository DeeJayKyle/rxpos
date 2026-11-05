import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../database/app_database.dart';
import 'themes.dart';

part 'theme_choice.g.dart';

/// This device's look (src/App.jsx useTheme / useSurface, src/vivid.js): the colour theme, following the system's light
/// or dark, the accent, the surface style and the colour level. Kept on this device only.
class Look {
  const Look({this.theme = 'light', this.system = false, this.accent = '', this.surface = 'flat', this.level = 'calm', this.beforePremium = ''});
  final String theme, accent, surface, level, beforePremium;
  final bool system;

  Look copyWith({String? theme, bool? system, String? accent, String? surface, String? level, String? beforePremium}) => Look(
        theme: theme ?? this.theme, system: system ?? this.system, accent: accent ?? this.accent, surface: surface ?? this.surface,
        level: level ?? this.level, beforePremium: beforePremium ?? this.beforePremium,
      );

  Map<String, Object?> toJson() => {'theme': theme, 'mode': system ? 'system' : '', 'accent': accent, 'surface': surface, 'level': level, 'beforePremium': beforePremium};

  static Look parse(String? v) {
    try {
      final j = (jsonDecode(v ?? '{}') as Map).cast<String, Object?>();
      final theme = '${j['theme'] ?? 'light'}';
      return Look(
        theme: palettes.any((p) => p.id == theme) ? theme : 'light',
        system: j['mode'] == 'system',
        accent: accents.any((a) => a.$1 == j['accent']) ? '${j['accent']}' : '',
        surface: surfaceStyles.any((s) => s.$1 == j['surface']) ? '${j['surface']}' : 'flat',
        level: j['level'] == 'vivid' ? 'vivid' : 'calm',
        beforePremium: '${j['beforePremium'] ?? ''}',
      );
    } catch (_) {
      return const Look();
    }
  }
}

const lookKey = 'device:look';
const _legacyPremium = 'premiumUi';

class LookController extends AsyncNotifier<Look> {
  @override
  Future<Look> build() async {
    final db = ref.watch(appDatabaseProvider);
    final row = await (db.select(db.kv)..where((x) => x.k.equals(lookKey))).getSingleOrNull();
    if (row != null) return Look.parse(row.v);
    // the Premium UI switch from before themes: Midnight Pro
    final old = await (db.select(db.kv)..where((x) => x.k.equals(_legacyPremium))).getSingleOrNull();
    return old?.v == '1' ? const Look(theme: premiumTheme) : const Look();
  }

  Future<void> save(Look l) async {
    final db = ref.read(appDatabaseProvider);
    await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: lookKey, v: jsonEncode(l.toJson())));
    state = AsyncData(l);
  }

  Future<Look> _now() async => state.value ?? await future;

  /// A theme picked from the list (no longer following the system).
  Future<void> pick(String theme) async => save((await _now()).copyWith(theme: theme, system: false));

  /// Light or Dark: the theme of that base (the current one when it is already that base).
  Future<void> base(bool dark, List<Palette> allowed, {String? preferred}) async {
    final l = await _now();
    final cur = paletteById(l.theme);
    await save(l.copyWith(system: false, theme: cur.dark == dark && allowed.any((p) => p.id == cur.id) ? cur.id : paletteFor(dark, allowed, preferred)));
  }

  Future<void> followSystem() async => save((await _now()).copyWith(system: true));
  Future<void> accent(String id) async => save((await _now()).copyWith(accent: id));
  Future<void> surface(String id) async => save((await _now()).copyWith(surface: id));
  Future<void> level(String id) async => save((await _now()).copyWith(level: id));

  /// Premium UI on: Midnight Pro (remembering the theme before); off: back to that theme.
  Future<void> premium(bool on, List<Palette> allowed) async {
    final l = await _now();
    if (on) {
      if (l.theme == premiumTheme) return;
      await save(l.copyWith(beforePremium: l.theme, theme: premiumTheme, system: false));
    } else {
      final prev = l.beforePremium;
      await save(l.copyWith(theme: prev.isNotEmpty && prev != premiumTheme && allowed.any((p) => p.id == prev) ? prev : paletteFor(false, allowed)));
    }
  }
}

final lookProvider = AsyncNotifierProvider<LookController, Look>(LookController.new);

/// The Premium UI switch (src/App.jsx PremiumToggle): Midnight Pro on this device.
@Riverpod(keepAlive: true)
class PremiumUi extends _$PremiumUi {
  @override
  Future<bool> build() async => (await ref.watch(lookProvider.future)).theme == premiumTheme;

  Future<void> set(bool on) => ref.read(lookProvider.notifier).premium(on, palettes);
}
