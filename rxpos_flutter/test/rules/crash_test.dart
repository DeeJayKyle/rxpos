// Crash reports (src/crash.js): no personal data, the same key as the React app, once a day per device, offline queue.
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/crash/crash_reports.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/network/dio_client.dart';

import '../sync/fake_cloud.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('scrubbed: emails, phone numbers and long numbers; the key matches the React app', () {
    expect(scrub('No client tia@test.rx 0772 123 456 / 0772-123-456 receipt 1234567 at line 12', 300),
        'No client [email] [n] / [n] receipt [n] at line 12');
    expect(scrub('x' * 500, 300).length, 300);
    // the same values src/crash.js gives
    expect(errorKey('Bad state: No element|#0 main (file.dart:3)'), '1yre2z4');
    expect(errorKey('x'), '3c');
    expect(errorKey('A much longer message that overflows 32 bits many times over, yes'), '1d1vrex');
  });

  test('queued on the device, sent once signed in, the same error not again today', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final cloud = FakeCloud();
    var got = <Object?>[];
    cloud.api['errors'] = (b) {
      got = b['errors']! as List;
      return (200, {'ok': true});
    };
    final c = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db), dioProvider.overrideWithValue(cloud.dio())]);
    addTearDown(() async {
      c.dispose();
      await db.close();
    });
    final r = c.read(crashReportsProvider)..page = '/pos';
    await r.report(StateError('Out of paper for 0772123456'), StackTrace.fromString('#0 printReceipt (receipt.dart:10)'), 'crash');
    expect(got, isEmpty, reason: 'not signed in: kept on the device');
    final q = await r.waiting();
    expect((q.single['message'], q.single['page'], q.single['kind']), ('Bad state: Out of paper for [n]', '/pos', 'crash'));
    c.read(authTokenProvider.notifier).set('u.tok');
    await r.flush();
    expect((got.single! as Map)['message'], 'Bad state: Out of paper for [n]');
    expect(await r.waiting(), isEmpty);
    got = [];
    await r.report(StateError('Out of paper for 0772123456'), StackTrace.fromString('#0 printReceipt (receipt.dart:10)'), 'crash');
    expect(await r.waiting(), isEmpty, reason: 'already reported today');
    await r.report('A RenderFlex overflowed by 3 pixels');
    expect(await r.waiting(), isEmpty, reason: 'layout warnings are not crashes');
  });
}
