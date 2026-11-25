// The web app's database: SQLite (WebAssembly) in memory only, as the classic website kept nothing on the computer;
// the pharmacy comes fresh from the cloud each time. (The Windows and Android apps keep it on the device.)
import 'package:drift/drift.dart';
import 'package:drift/wasm.dart';
import 'package:sqlite3/wasm.dart';

QueryExecutor openWebMemory(String base) => LazyDatabase(() async {
      final sqlite3 = await WasmSqlite3.loadFromUrl(Uri.parse('${base}sqlite3.wasm'));
      sqlite3.registerVirtualFileSystem(InMemoryFileSystem(), makeDefault: true);
      return WasmDatabase.inMemory(sqlite3);
    });
