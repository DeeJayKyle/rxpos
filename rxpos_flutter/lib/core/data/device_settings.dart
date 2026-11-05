import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../database/app_database.dart';
import '../rules/stock.dart';

part 'device_settings.g.dart';

/// The branch this device works as (This device → Branch), kept on the device like the React app's choice. Stock,
/// sales and deliveries on this device belong to it.
@Riverpod(keepAlive: true)
class DeviceBranch extends _$DeviceBranch {
  static const _key = 'branch';

  @override
  Future<String> build() async {
    final db = ref.watch(appDatabaseProvider);
    final row = await (db.select(db.kv)..where((x) => x.k.equals(_key))).getSingleOrNull();
    return row?.v ?? mainBranch;
  }

  Future<void> set(String branchId) async {
    final db = ref.read(appDatabaseProvider);
    await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: _key, v: branchId));
    state = AsyncData(branchId);
  }
}
