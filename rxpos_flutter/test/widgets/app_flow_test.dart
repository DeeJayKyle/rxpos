// The real screens, driven like a cashier would: sign in, scan, charge, receipt; Add Stock; the sync screen.
import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/app.dart';
import 'package:rxpos/core/data/pharmacy_providers.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/network/dio_client.dart';
import 'package:rxpos/core/rules/passwords.dart';
import 'package:rxpos/features/sync_status/application/sync_controller.dart';

import '../sync/fake_cloud.dart';

void main() {
  late AppDatabase db;
  late FakeCloud cloud;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    cloud = FakeCloud()
      ..login = (b) => b['password'] == 'tia-pass'
          ? (200, {'token': 'tok', 'tenant': 't1', 'slug': 't1', 'pharmacy': 'Sample Pharmacy', 'user': {'id': 'u1', 'name': 'Tia Admin', 'email': 'tia@test.rx', 'role': 'admin'}})
          : (401, {'error': 'Wrong email or password'});
  });
  tearDown(() => db.close());

  /// Let the database (real time) and the screen (test time) both move on.
  Future<void> settle(WidgetTester tester, [int rounds = 12]) async {
    for (var i = 0; i < rounds; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 15)));
      await tester.pump(const Duration(milliseconds: 60));
    }
  }

  Future<void> start(WidgetTester tester, {Size size = const Size(1440, 900)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        dioProvider.overrideWithValue(cloud.dio()),
        syncAutomaticallyProvider.overrideWithValue(false),
        catalogProvider.overrideWith((_) async => const []),
      ],
      child: const RxposApp(),
    ));
    await settle(tester, 20);
  }

  /// Open a screen from the sidebar, scrolling it until the item is there (a long list builds items as they come into view).
  Future<void> navTo(WidgetTester tester, String label) async {
    final item = find.descendant(of: find.byKey(const Key('sidebar')), matching: find.text(label));
    await tester.scrollUntilVisible(item, 120, scrollable: find.descendant(of: find.byKey(const Key('sidebar')), matching: find.byType(Scrollable)));
    await settle(tester, 2);
    await tester.tap(item);
    await settle(tester);
  }

  Future<void> toTill(WidgetTester tester) async {
    await tester.sendKeyEvent(LogicalKeyboardKey.f2);
    await settle(tester);
  }

  /// Unmount the app and let the database's live queries close (their close timers run on the next tick).
  Future<void> done(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 10));
  }

  Future<void> signedIn() async {
    await db.into(db.kv).insert(KvCompanion.insert(k: 'session', v: jsonEncode({'token': 'tok', 'tenant': 't1', 'slug': 't1',
      'pharmacy': 'Sample Pharmacy', 'userId': 'u1', 'userName': 'Tia Admin', 'email': 'tia@test.rx', 'role': 'admin', 'signedInAt': 'x'})));
    final store = RecordStore(db);
    await store.update((d) {
      d.put('products', {'id': 'p1', 'name': 'Calmex 500mg Tabs', 'generic': 'Calmex', 'form': 'Tablets', 'unit': 'Tablet', 'barcode': '7010001', 'price': 500, 'cost': 300});
      d.put('products', {'id': 'p2', 'name': 'Zinco Syrup 100ml', 'unit': 'Bottle', 'barcode': '7010002', 'price': 6000, 'cost': 4000});
      d.put('batches', {'id': 'b1', 'productId': 'p1', 'batch': 'C1', 'expiry': '2029-01-31', 'cost': 300});
      d.move(productId: 'p1', qty: 100, type: 'Opening stock', batchId: 'b1');
      d.put('customers', {'id': 'walk-in', 'name': 'Walk-in Customer'});
    });
    await db.delete(db.outbox).go();
  }

  testWidgets('the app opens on sign-in; a correct password opens the till', (tester) async {
    await start(tester);
    expect(find.text('Sign in with your pharmacy account'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Email or username'), 'tia@test.rx');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'wrong');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester);
    expect(find.text('Wrong email or password'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'tia-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester);
    expect(find.textContaining('Tia'), findsWidgets, reason: 'the dashboard greets the cashier');
    expect(find.text('Sample Pharmacy'), findsWidgets);
    await done(tester);
  });

  testWidgets('scan, add one more, charge: the receipt shows and the sale and stock are saved', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await toTill(tester);
    expect(find.text('Point of sale'), findsOneWidget);
    expect(find.text('100 left'), findsOneWidget);
    expect(find.text('Out of stock'), findsOneWidget, reason: 'Zinco has no stock');
    // the scanner types the barcode and Enter
    await tester.enterText(find.byType(TextField).first, '7010001');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(find.text('Calmex 500mg Tabs'), findsNWidgets(2), reason: 'in the grid and in the sale');
    await tester.tap(find.byTooltip('More'));
    await settle(tester);
    expect(find.text('Charge UGX 1,000   [F9]'), findsOneWidget);
    await tester.tap(find.text('Charge UGX 1,000   [F9]'));
    await settle(tester);
    expect(find.text('Sale complete ✓'), findsOneWidget);
    final store = RecordStore(db);
    final sale = (await tester.runAsync(() => store.rows('sales')))!.single;
    expect((sale['total'], sale['cashier'], sale['payment']), (1000, 'Tia Admin', 'Cash'));
    final moves = (await tester.runAsync(() => store.rows('movements')))!.where((m) => m['type'] == 'Sale').toList();
    expect(moves.single['qty'], -2);
    expect(moves.single['batchId'], 'b1');
    await tester.tap(find.text('New sale'));
    await settle(tester);
    expect(find.text('98 left'), findsOneWidget, reason: 'stock follows the movements at once');
    await done(tester);
  });

  testWidgets('a sale can be held and resumed', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await toTill(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.tap(find.text('Hold'));
    await settle(tester);
    expect(find.text('Tap a medicine or scan a barcode to start a sale'), findsOneWidget);
    expect(find.textContaining('Walk-in · 1 item'), findsOneWidget);
    await tester.tap(find.textContaining('Walk-in · 1 item'));
    await settle(tester);
    expect(find.text('Calmex 500mg Tabs'), findsNWidgets(2));
    expect(await tester.runAsync(() => RecordStore(db).rows('drafts')), isEmpty);
    await done(tester);
  });

  testWidgets('F4 opens Add Stock; Sync & storage shows the status', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.f4);
    await settle(tester);
    expect(find.text('Add a medicine'), findsOneWidget);
    await navTo(tester, 'Sync & storage');
    expect(find.text('Download everything again'), findsOneWidget);
    expect(find.textContaining('Signed in as Tia Admin'), findsOneWidget);
    await done(tester);
  });

  testWidgets('on a phone: the menu, the sale opens from the bar and is charged', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, size: const Size(400, 800));
    await tester.tap(find.byTooltip('Open navigation menu'));
    await settle(tester);
    await tester.tap(find.text('POS – Retail'));
    await settle(tester);
    expect(find.text('No items yet'), findsOneWidget);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    expect(find.text('1 item'), findsOneWidget);
    await tester.tap(find.text('1 item'));
    await settle(tester);
    await tester.tap(find.text('Charge UGX 500   [F9]'));
    await settle(tester);
    expect(find.text('Sale complete ✓'), findsOneWidget);
    await done(tester);
  });

  testWidgets('dashboard figures; sales history refund puts stock back', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    expect(find.text('TODAY\'S SALES'), findsOneWidget);
    await toTill(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.tap(find.text('Charge UGX 500   [F9]'));
    await settle(tester);
    await tester.tap(find.text('New sale'));
    await settle(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.f6);
    await settle(tester);
    expect(find.text('Sales History'), findsWidgets);
    await tester.tap(find.textContaining('Walk-in Customer').first);
    await settle(tester);
    await tester.tap(find.text('Refund'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Refund'));
    await settle(tester);
    expect(find.textContaining('REFUNDED'), findsOneWidget);
    final moves = (await tester.runAsync(() => RecordStore(db).rows('movements')))!;
    expect(moves.where((m) => m['type'] == 'Refund').single['qty'], 1);
    await done(tester);
  });

  testWidgets('inventory: count a batch; customers: add a client', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.f7);
    await settle(tester);
    expect(find.text('100 tablets'), findsOneWidget);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.tap(find.text('Count / adjust'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Quantity (counted, added or removed)'), '97');
    await tester.enterText(find.widgetWithText(TextFormField, 'Reason'), 'stock take');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('97 tablets'), findsOneWidget);
    await navTo(tester, 'Customers');
    await tester.tap(find.text('Add client'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Grace Sample');
    await tester.enterText(find.widgetWithText(TextFormField, 'Phone'), '0700111222');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Grace Sample'), findsOneWidget);
    await done(tester);
  });

  testWidgets('group 2: shift open and close; a stock take posted; purchase history, reorder and expiry open', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    Future<void> go(String label) => navTo(tester, label);
    await go('Shifts & Cash-up');
    await tester.tap(find.text('Open shift'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Float in the drawer'), '20000');
    await tester.tap(find.widgetWithText(FilledButton, 'Open shift').last);
    await settle(tester);
    expect(find.text('EXPECTED CASH'), findsOneWidget);
    await tester.tap(find.text('Close shift'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Other coins (amount)'), '20000');
    await tester.tap(find.widgetWithText(FilledButton, 'Close shift').last);
    await settle(tester);
    expect(find.textContaining('Counted UGX 20,000'), findsOneWidget);

    await go('Stock take');
    await tester.tap(find.text('Start a count'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Start'));
    await settle(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Batch C1 (exp 2029-01-31)'), '95');
    await tester.tap(find.widgetWithText(FilledButton, 'Save count'));
    await settle(tester);
    await tester.tap(find.text('Review & post'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Post'));
    await settle(tester);
    final moves = (await tester.runAsync(() => RecordStore(db).rows('movements')))!;
    expect(moves.where((m) => m['type'] == 'Stock count').single['qty'], -5);

    await go('Purchase history');
    expect(find.text('No deliveries yet'), findsOneWidget);
    await go('Reorder');
    expect(find.text('Nothing to reorder'), findsOneWidget);
    await go('Expiry');
    expect(find.text('Nothing expired or expiring soon'), findsOneWidget);
    await done(tester);
  });

  testWidgets('group 3: a proforma saved and sold; reports; an expense in finance', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await toTill(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Proforma'));
    await settle(tester);
    await navTo(tester, 'Proformas');
    await tester.tap(find.text('Sell'));
    await settle(tester);
    expect(find.textContaining('Selling proforma PF'), findsOneWidget);
    await tester.tap(find.text('Charge UGX 500   [F9]'));
    await settle(tester);
    await tester.tap(find.text('New sale'));
    await settle(tester);
    final pf = (await tester.runAsync(() => RecordStore(db).rows('proformas')))!.single;
    expect((pf['status'], (pf['saleNumber'] as String).startsWith('R')), ('Converted', true));

    await navTo(tester, 'Reports');
    expect(find.text('UGX 500'), findsWidgets);
    await navTo(tester, 'Finance');
    expect(find.text('Cash at hand'), findsOneWidget);
    await tester.tap(find.text('Expenses'));
    await settle(tester);
    await tester.tap(find.text('Add expense'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'What for'), 'Airtime');
    await tester.enterText(find.widgetWithText(TextFormField, 'Amount'), '200');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.textContaining('Airtime'), findsOneWidget);
    await tester.tap(find.text('Accounts'));
    await settle(tester);
    expect(find.text('UGX 300'), findsOneWidget, reason: 'cash at hand: 500 sale − 200 expense');
    await done(tester);
  });

  testWidgets('group 4: add a user, add a branch, the audit log, this device', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'Users & Roles');
    await tester.tap(find.text('Add user'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Ben Cashier');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'ben@test.rx');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password (8+ characters)'), 'ben-pass-123');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester, 30);
    expect(find.text('Ben Cashier'), findsOneWidget);
    final users = (await tester.runAsync(() => RecordStore(db).rows('users')))!;
    expect(verifyPassword(users.single, 'ben-pass-123'), isTrue);

    await navTo(tester, 'Branches & Transfers');
    await tester.tap(find.text('Add branch'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Kampala Road');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Kampala Road'), findsOneWidget);
    expect(find.text('Send stock'), findsOneWidget);

    await navTo(tester, 'Audit log');
    expect(find.textContaining('User added'), findsOneWidget);
    await navTo(tester, 'This device');
    expect(find.text('Branch this device works as'), findsOneWidget);
    await done(tester);
  });
}
