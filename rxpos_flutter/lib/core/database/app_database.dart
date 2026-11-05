import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'app_database.g.dart';

// The device database mirrors the cloud's own shape (and the React app's IndexedDB "pharmapos" v2): every synced
// record is a JSON document keyed by table + id, so sync never has to translate between formats. Typed entities
// (Freezed) are decoded from these rows for the screens.

/// One synced record: table name, id, the record as JSON, and when it last changed.
/// Indexes (schema 2): by table, and expression indexes on the JSON for what the till looks up by key: a medicine by
/// barcode, and a medicine's stock movements and batches.
@DataClassName('RecordRow')
@TableIndex(name: 'records_by_table', columns: {#t})
@TableIndex.sql("CREATE INDEX products_by_barcode ON records (json_extract(json, '\$.barcode')) WHERE t = 'products'")
@TableIndex.sql("CREATE INDEX movements_by_product ON records (json_extract(json, '\$.productId')) WHERE t = 'movements'")
@TableIndex.sql("CREATE INDEX batches_by_product ON records (json_extract(json, '\$.productId')) WHERE t = 'batches'")
class Records extends Table {
  TextColumn get t => text()();
  TextColumn get id => text()();
  TextColumn get json => text()();
  TextColumn get updatedAt => text().nullable()();
  @override
  Set<Column> get primaryKey => {t, id};
}

/// A record this device deleted (kept so a later download does not bring it back).
@DataClassName('TombstoneRow')
class Tombstones extends Table {
  TextColumn get t => text()();
  TextColumn get id => text()();
  TextColumn get at => text()();
  @override
  Set<Column> get primaryKey => {t, id};
}

/// A change waiting for the cloud, written in the same transaction as the change itself (sync protocol 2).
@DataClassName('OutboxRow')
class Outbox extends Table {
  IntColumn get seq => integer().autoIncrement()();
  TextColumn get op => text().unique()();
  TextColumn get txn => text()();
  TextColumn get t => text()();
  TextColumn get id => text()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  TextColumn get at => text()();
}

/// Changes the cloud refused: kept for someone to review, never silently dropped.
@DataClassName('RejectedRow')
class RejectedOps extends Table {
  IntColumn get seq => integer().autoIncrement()();
  TextColumn get op => text()();
  TextColumn get t => text()();
  TextColumn get id => text()();
  TextColumn get at => text()();
  TextColumn get reason => text().nullable()();
}

/// Small values: pharmacy settings, sync cursor and epoch, the signed-in session, device settings.
@DataClassName('KvRow')
class Kv extends Table {
  TextColumn get k => text()();
  TextColumn get v => text()();
  @override
  Set<Column> get primaryKey => {k};
}

@DriftDatabase(tables: [Records, Tombstones, Outbox, RejectedOps, Kv])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? driftDatabase(name: 'rxpos'));

  /// 1: records, tombstones, outbox, rejected_ops, kv. 2: lookup indexes.
  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        // One step per version, each tested on a real database of the older version (test/database/migration_test.dart,
        // schemas in drift_schemas/). Steps only add: a device's records are never rewritten by an upgrade.
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            // version 1 devices made this index at creation time, outside the schema
            await customStatement('CREATE INDEX IF NOT EXISTS records_by_table ON records (t)');
            await m.create(productsByBarcode);
            await m.create(movementsByProduct);
            await m.create(batchesByProduct);
          }
        },
        beforeOpen: (details) async => customStatement('PRAGMA foreign_keys = ON'),
      );
}

@Riverpod(keepAlive: true)
AppDatabase appDatabase(Ref ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
}
