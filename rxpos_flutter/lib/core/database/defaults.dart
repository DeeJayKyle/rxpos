// Built-in defaults every device has (src/store.jsx blankDb): the walk-in customer, the cash drawer, the main branch,
// medicine forms and expense categories, with the React app's fixed ids and its "untouched default" time, so both
// apps agree on them. They are never sent to the cloud (like the React app's); a pharmacy's own edit is newer and wins.
import 'dart:convert';

import 'package:drift/drift.dart';

import 'app_database.dart';

const baseAt = '2000-01-01T00:00:00.000Z';

const forms = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Infusions', 'Creams', 'Ointments', 'Gels', 'Drops', 'Eye Drops',
  'Ear Drops', 'Inhalers', 'Sachets', 'Suppositories', 'Pessaries', 'Lotions', 'Powders', 'Devices', 'Surgicals', 'Cosmetics', 'Supplements', 'Sundries', 'Others'];
const expenseCategories = ['Rent', 'Salaries', 'Electricity', 'Water', 'Transport', 'Airtime & Internet', 'Licenses & Fees', 'Repairs', 'Stationery', 'Other'];

/// JavaScript's `name.toLowerCase().replace(/\W+/g, '-')`.
String slug(String name) => name.toLowerCase().replaceAll(RegExp(r'[^A-Za-z0-9_]+'), '-');

List<(String, Map<String, Object?>)> defaultRecords() => [
      for (final f in forms) ('formulations', {'id': 'form-${slug(f)}', 'name': f}),
      for (final c in expenseCategories) ('expenseCategories', {'id': 'expcat-${slug(c)}', 'name': c}),
      ('customers', {'id': 'walk-in', 'name': 'Walk-in Customer', 'phone': ''}),
      ('banks', {'id': 'cash-drawer', 'name': 'Cash at hand', 'account': '', 'opening': 0}),
      ('branches', {'id': 'main', 'name': 'Main branch', 'address': ''}),
    ];

/// Add any missing default (never replacing a record the device already has).
Future<void> ensureDefaults(AppDatabase db) async {
  await db.batch((b) {
    for (final (t, rec) in defaultRecords()) {
      b.insert(db.records, RecordsCompanion.insert(t: t, id: rec['id'] as String, json: jsonEncode({...rec, 'updatedAt': baseAt}), updatedAt: const Value(baseAt)),
          mode: InsertMode.insertOrIgnore);
    }
  });
}
