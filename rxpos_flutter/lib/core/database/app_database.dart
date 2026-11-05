import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'app_database.g.dart';

// The device database mirrors the cloud's own shape (and the React app's IndexedDB "pharmapos" v2): every synced
// record is a JSON document keyed by table + id, so sync never has to translate between formats. Typed entities
// (Freezed) are decoded from these rows for the screens.

/// One synced record: table name, id, the record as JSON, and when it last changed.
@DataClassName('RecordRow')
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

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await m.createIndex(Index('records_by_table', 'CREATE INDEX records_by_table ON records (t)'));
        },
        // Each schema change gets its own step (from 1 to 2, 2 to 3, …) and a test that upgrades a real old file.
        onUpgrade: (m, from, to) async {},
        beforeOpen: (details) async => customStatement('PRAGMA foreign_keys = ON'),
      );
}

@Riverpod(keepAlive: true)
AppDatabase appDatabase(Ref ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
}
