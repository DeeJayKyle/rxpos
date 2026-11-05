// The built-in defaults match the React app's ids and are never sent to the cloud.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/database/defaults.dart';

void main() {
  test('the React app\'s ids, never in the outbox, and a pharmacy\'s own edit is kept', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = RecordStore(db);
    expect((await store.get('banks', 'cash-drawer'))!['name'], 'Cash at hand');
    expect(await store.get('expenseCategories', 'expcat-airtime-internet'), isNotNull);
    expect(await store.get('expenseCategories', 'expcat-licenses-fees'), isNotNull);
    expect(await store.get('formulations', 'form-eye-drops'), isNotNull);
    expect((await store.get('customers', 'walk-in'))!['updatedAt'], baseAt);
    expect(await db.select(db.outbox).get(), isEmpty);
    await store.update((d) => d.put('banks', {'id': 'cash-drawer', 'name': 'Main till'}));
    await ensureDefaults(db);
    expect((await store.get('banks', 'cash-drawer'))!['name'], 'Main till');
    await db.close();
  });
}
