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

/// A value kept on this device only (never synced): POS favourites, the sale in progress, and the like.
@Riverpod(keepAlive: true)
class DeviceValue extends _$DeviceValue {
  @override
  Future<String?> build(String key) async {
    final db = ref.watch(appDatabaseProvider);
    return (await (db.select(db.kv)..where((x) => x.k.equals('device:$key'))).getSingleOrNull())?.v;
  }

  Future<void> set(String? v) async {
    final db = ref.read(appDatabaseProvider);
    if (v == null) {
      await (db.delete(db.kv)..where((x) => x.k.equals('device:$key'))).go();
    } else {
      await db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: 'device:$key', v: v));
    }
    state = AsyncData(v);
  }
}
