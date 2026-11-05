import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../database/app_database.dart';

part 'theme_choice.g.dart';

/// This device's look: the standard teal or Premium UI (Midnight Pro), kept on the device like the React app's switch.
@Riverpod(keepAlive: true)
class PremiumUi extends _$PremiumUi {
  static const _key = 'premiumUi';

  @override
  Future<bool> build() async {
    final db = ref.watch(appDatabaseProvider);
    final row = await (db.select(db.kv)..where((x) => x.k.equals(_key))).getSingleOrNull();
    return row?.v == '1';
  }

  Future<void> set(bool on) async {
    final db = ref.read(appDatabaseProvider);
    await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: _key, v: on ? '1' : '0'));
    state = AsyncData(on);
  }
}
