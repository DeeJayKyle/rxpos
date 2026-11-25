// The Windows database moves out of Documents once, safely (lib/core/data/app_dirs.dart settleDatabase).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/app_dirs.dart';

void main() {
  late Directory root, docs, app;
  setUp(() {
    root = Directory.systemTemp.createTempSync('rxpos-dirs');
    docs = Directory('${root.path}/Documents')..createSync();
    app = Directory('${root.path}/AppData/RxPOS');
  });
  tearDown(() => root.deleteSync(recursive: true));
  File at(Directory d, String ext) => File('${d.path}/rxpos.sqlite$ext');

  test('the old database and its -wal / -shm files move to the app folder', () async {
    at(docs, '').writeAsStringSync('main');
    at(docs, '-wal').writeAsStringSync('wal');
    at(docs, '-shm').writeAsStringSync('shm');
    final dir = await settleDatabase(from: docs, to: app);
    expect(dir.path, app.path);
    expect([at(app, '').readAsStringSync(), at(app, '-wal').readAsStringSync(), at(app, '-shm').readAsStringSync()], ['main', 'wal', 'shm']);
    expect(at(docs, '').existsSync() || at(docs, '-wal').existsSync() || at(docs, '-shm').existsSync(), isFalse);
    expect(app.listSync().where((e) => e.path.endsWith('.part')), isEmpty);
  });

  test('a new install opens in the app folder', () async {
    expect((await settleDatabase(from: docs, to: app)).path, app.path);
    expect(at(app, '').existsSync(), isFalse);
  });

  test('a database already in the app folder is never overwritten', () async {
    app.createSync(recursive: true);
    at(app, '').writeAsStringSync('current');
    at(docs, '').writeAsStringSync('stale');
    expect((await settleDatabase(from: docs, to: app)).path, app.path);
    expect(at(app, '').readAsStringSync(), 'current');
    expect(at(docs, '').readAsStringSync(), 'stale');
  });

  test('when the copy fails, the database stays where it was and is used there', () async {
    at(docs, '').writeAsStringSync('main');
    File('${root.path}/AppData').writeAsStringSync('a file where the folder should be'); // the app folder can't be made
    final dir = await settleDatabase(from: docs, to: app);
    expect(dir.path, docs.path);
    expect(at(docs, '').readAsStringSync(), 'main');
  });
}
