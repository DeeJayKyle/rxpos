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
import 'package:rxpos/features/drug_info/presentation/drug_info_screen.dart';
import 'package:rxpos/features/sync_status/application/sync_controller.dart';

import '../sync/fake_cloud.dart';

void main() {
  late AppDatabase db;
  late FakeCloud cloud;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    cloud = FakeCloud()
      ..login = (b) => b['password'] == 'tia-pass'
          ? (
              200,
              {
                'token': 'tok',
                'tenant': 't1',
                'slug': 't1',
                'pharmacy': 'Sample Pharmacy',
                'user': {'id': 'u1', 'name': 'Tia Admin', 'email': 'tia@test.rx', 'role': 'admin'},
              },
            )
          : (401, {'error': 'Wrong email or password'});
  });
  tearDown(() => db.close());

  /// Close any snack bar (they cover the bottom of the screen).
  void noSnackBars(WidgetTester tester) {
    for (final s in tester.stateList<ScaffoldMessengerState>(find.byType(ScaffoldMessenger))) {
      s.removeCurrentSnackBar();
      s.clearSnackBars();
    }
  }

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
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDatabaseProvider.overrideWithValue(db),
          dioProvider.overrideWithValue(cloud.dio()),
          syncAutomaticallyProvider.overrideWithValue(false),
          catalogProvider.overrideWith((_) async => const []),
          drugFetchProvider.overrideWithValue((url, _) async => url.contains('amoxicillin')
              ? (200, {
                  'results': [
                    {
                      'openfda': {'generic_name': ['AMOXICILLIN'], 'brand_name': ['AMOXIL']},
                      'indications_and_usage': ['Bacterial infections.'],
                      'dosage_and_administration': ['500 mg three times a day.'],
                    },
                  ],
                })
              : (404, null)),
        ],
        child: const RxposApp(),
      ),
    );
    await settle(tester, 20);
  }

  /// Open a screen from the sidebar, scrolling it until the item is there (a long list builds items as they come into view).
  Future<void> navTo(WidgetTester tester, String label) async {
    final item = find.descendant(of: find.byKey(const Key('sidebar')), matching: find.text(label));
    final list = find.descendant(of: find.byKey(const Key('sidebar')), matching: find.byType(Scrollable));
    // the sidebar keeps its scroll position between screens: start from the top, then scroll down to the item
    await tester.drag(list, const Offset(0, 4000));
    await settle(tester, 2);
    await tester.scrollUntilVisible(item, 120, scrollable: list);
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
    await db
        .into(db.kv)
        .insert(
          KvCompanion.insert(
            k: 'session',
            v: jsonEncode({
              'token': 'tok',
              'tenant': 't1',
              'slug': 't1',
              'pharmacy': 'Sample Pharmacy',
              'userId': 'u1',
              'userName': 'Tia Admin',
              'email': 'tia@test.rx',
              'role': 'admin',
              'signedInAt': 'x',
            }),
          ),
        );
    final store = RecordStore(db);
    await store.update((d) {
      d.put('products', {
        'id': 'p1',
        'name': 'Calmex 500mg Tabs',
        'generic': 'Calmex',
        'form': 'Tablets',
        'unit': 'Tablet',
        'barcode': '7010001',
        'price': 500,
        'cost': 300,
      });
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
    await tester.enterText(find.widgetWithText(TextField, 'Search medicine or scan barcode…  (F8)'), '7010001');
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
    expect(find.text('Receive stock'), findsOneWidget);
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
    expect(find.text('refunded'), findsOneWidget);
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
    await tester.tap(find.text('New stock count'));
    await settle(tester);
    await tester.tap(find.text('Start counting'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('count-p1-b1')), '95');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(find.text('1 of 1 counted (100%)'), findsOneWidget);
    await tester.tap(find.text('Review & post'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Post count'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Post count'));
    await settle(tester);
    expect(find.text('History'), findsOneWidget);
    final moves = (await tester.runAsync(() => RecordStore(db).rows('movements')))!;
    expect(moves.where((m) => m['type'] == 'Stock count').single['qty'], -5);

    await go('Purchase history');
    expect(find.textContaining('No deliveries yet'), findsOneWidget);
    await go('Reorder');
    expect(find.text('Stock levels look healthy. Nothing needs ordering.'), findsOneWidget);
    await go('Expiring / Expired');
    expect(find.text('Nothing expiring soon 🎉'), findsOneWidget);
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
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Category'));
    await settle(tester, 4);
    await tester.tap(find.text('Other').last);
    await settle(tester, 4);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Other: Airtime'), findsOneWidget);
    await tester.tap(find.text('Banks'));
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
    await tester.enterText(find.widgetWithText(TextFormField, 'Full name'), 'Ben Cashier');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email – signs in and recovers the password'), 'ben@test.rx');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password (8+ characters)'), 'ben-pass-123');
    await tester.tap(find.widgetWithText(FilledButton, 'Add user').last);
    await settle(tester, 30);
    expect(find.text('Ben Cashier'), findsOneWidget);
    final users = (await tester.runAsync(() => RecordStore(db).rows('users')))!;
    expect(verifyPassword(users.single, 'ben-pass-123'), isTrue);
    await tester.tap(find.text('Disable'));
    await settle(tester);
    expect((await tester.runAsync(() => RecordStore(db).rows('users')))!.single['disabled'], true);
    await tester.tap(find.textContaining('Roles & permissions'));
    await settle(tester);
    await tester.tap(find.byTooltip('Copy as a new role').at(4));
    await settle(tester);
    await tester.tap(find.text('Save role'));
    await settle(tester);
    expect((await tester.runAsync(() => RecordStore(db).rows('roles')))!.any((r) => r['name'] == 'Cashier (copy)'), isTrue);

    await tester.runAsync(() => RecordStore(db).update((d) => d.put('branches', {'id': 'br-2', 'name': 'Kampala Road'})));
    await navTo(tester, 'Branches & Transfers');
    expect(find.text('Kampala Road'), findsOneWidget);
    expect(find.text('Send stock'), findsOneWidget);
    await tester.tap(find.text('Use on this device'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Switch'));
    await settle(tester);
    expect(find.text('This device now works as Kampala Road'), findsOneWidget);
    expect(await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('branch'))).getSingle().then((r) => r.v)), 'br-2');

    await navTo(tester, 'Audit log');
    expect(find.textContaining('User added'), findsOneWidget);
    await navTo(tester, 'This device');
    expect(find.text('Branch this device works as'), findsOneWidget);
    await done(tester);
  });

  testWidgets('group 5: storage reading, team chat, import, calendar and the other extras', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'Storage temperature');
    await tester.tap(find.text('Log a reading'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Temperature (°C)'), '11');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Fridge · 11°C'), findsOneWidget);
    final audit = (await tester.runAsync(() => RecordStore(db).rows('audit')))!;
    expect(audit.any((a) => a['action'] == 'Storage temperature out of range'), isTrue);

    await navTo(tester, 'Chat & Messages');
    noSnackBars(tester);
    await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Delivery at 3pm');
    await tester.pump();
    await tester.tap(find.byIcon(Icons.send));
    await settle(tester);
    expect(find.text('Delivery at 3pm'), findsOneWidget);
    expect(find.byTooltip('Message options'), findsOneWidget);
    // the message menu: pin, react, edit, delete for everyone (src/pages/Chat.jsx)
    Future<void> menu(String item) async {
      await tester.tap(find.byTooltip('Message options').last);
      await settle(tester);
      await tester.tap(find.text(item).last);
      await settle(tester);
      noSnackBars(tester);
      await settle(tester, 4);
    }

    await menu('Pin');
    expect(find.textContaining('Pinned ·'), findsOneWidget);
    await menu('👍');
    final chatMarks = (await tester.runAsync(() => RecordStore(db).rows('chatMarks')))!;
    expect(chatMarks.single['emoji'], '👍');
    await menu('Edit');
    await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Delivery at 4pm');
    await tester.pump();
    await tester.tap(find.byTooltip('Save'));
    await settle(tester);
    expect(find.text('Delivery at 4pm'), findsOneWidget);
    expect(find.textContaining('edited ·'), findsOneWidget);
    await menu('Delete');
    await tester.tap(find.text('Delete for everyone'));
    await settle(tester);
    expect(find.text('You deleted this message'), findsOneWidget);

    await navTo(tester, 'Import medicines');
    expect(find.text('Already included: built into RxPOS'), findsOneWidget);
    await tester.tap(find.text('Excel / CSV file'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('import-paste')), 'Name,Generic,Formulation,Retail price,Cost,Barcode,Unit,Stock,Expiry\nNew Syrup 100ml,Newgen,Syrups,4000,2500,,Bottle,12,06/2028');
    await tester.tap(find.text('Use the pasted rows'));
    await settle(tester);
    expect(find.text('Pasted rows · 1 rows'), findsOneWidget);
    expect(find.text('2028-06-30'), findsOneWidget, reason: 'month/year expiry is the last day of the month');
    await tester.ensureVisible(find.text('Import 1 rows'));
    await tester.tap(find.text('Import 1 rows'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Import'));
    await settle(tester);
    expect(find.text('1 added · 0 updated · 0 skipped · 1 with opening stock'), findsOneWidget);
    final products = (await tester.runAsync(() => RecordStore(db).rows('products')))!;
    expect(products.any((p) => p['name'] == 'New Syrup 100ml' && p['price'] == 4000), isTrue);

    await navTo(tester, 'Calendar');
    await tester.tap(find.text('Add event'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'What'), 'NDA inspection');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('NDA inspection'), findsOneWidget);

    for (final screen in ['Reminders', 'Controlled drugs', 'Barcode labels', 'Drug information', 'Drug quiz']) {
      await navTo(tester, screen);
      expect(find.text(screen == 'Controlled drugs' ? 'Controlled drugs register' : screen), findsWidgets);
    }
    await done(tester);
  });

  testWidgets('POS parity: favourites, ticks, directions label, discard a held sale, expired stock, the sale kept across a restart', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(
      () => RecordStore(db).update((d) {
        d.put('products', {'id': 'p3', 'name': 'Oldex Drops 10ml', 'unit': 'Bottle', 'price': 2000, 'cost': 1000, 'category': 'Eye care'});
        d.put('batches', {'id': 'b3', 'productId': 'p3', 'batch': 'OLD', 'expiry': '2025-01-31', 'cost': 1000});
        d.move(productId: 'p3', qty: 3, type: 'Opening stock', batchId: 'b3');
      }),
    );
    await start(tester);
    await toTill(tester);

    // favourites
    await tester.tap(find.byKey(const Key('star-p1')));
    await settle(tester);
    await tester.tap(find.widgetWithText(ChoiceChip, '★ Favourites'));
    await settle(tester);
    expect(find.text('Calmex 500mg Tabs'), findsOneWidget);
    expect(find.text('Oldex Drops 10ml'), findsNothing);
    await tester.tap(find.widgetWithText(ChoiceChip, 'Eye care'));
    await settle(tester);
    expect(find.text('Oldex Drops 10ml'), findsOneWidget);
    expect(find.text('Calmex 500mg Tabs'), findsNothing);

    // expired stock needs a reason
    await tester.tap(find.text('Oldex Drops 10ml'));
    await settle(tester);
    expect(find.text('Only expired stock left'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('expired-reason')), 'No alternative in town');
    await settle(tester, 2);
    await tester.tap(find.text('Sell expired'));
    await settle(tester);
    expect(find.text('Expired stock · No alternative in town'), findsOneWidget);

    // directions label
    await tester.tap(find.byKey(const Key('directions-p3')));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('dir-dose')), '2 drops');
    await tester.enterText(find.byKey(const Key('dir-freq')), 'twice a day');
    await tester.tap(find.text('Done'));
    await settle(tester);
    expect(find.text('Label ✓'), findsOneWidget);

    // the sale survives a restart of the app
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 400)));
    await settle(tester);
    expect(await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:pos-sale-retail'))).getSingleOrNull()), isNotNull);
    await done(tester);
    await start(tester);
    await toTill(tester);
    await settle(tester);
    expect(find.text('Expired stock · No alternative in town'), findsOneWidget, reason: 'the sale came back after the restart');
    expect(find.text('Label ✓'), findsOneWidget);

    // charge it: the expired override is on the sale and in the audit log
    await tester.tap(find.textContaining('Charge UGX 2,000'));
    await settle(tester);
    expect(find.text('Sale complete ✓'), findsOneWidget);
    await tester.tap(find.text('New sale'));
    await settle(tester);
    final sale = (await tester.runAsync(() => RecordStore(db).rows('sales')))!.single;
    expect(sale['expiredOverride'], true);
    expect(((sale['items'] as List).single as Map)['directions'], containsPair('dose', '2 drops'));

    // ticks: tick every line, remove the ticked ones
    await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
    await settle(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.tap(find.byKey(const Key('tick-p1')));
    await settle(tester);
    await tester.tap(find.text('Remove ticked (1)'));
    await settle(tester);
    expect(find.text('Tap a medicine or scan a barcode to start a sale'), findsOneWidget);

    // a held sale can be discarded (audit)
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.tap(find.text('Hold'));
    await settle(tester);
    await tester.tap(find.byTooltip('Discard this held sale'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Discard'));
    await settle(tester);
    final store = RecordStore(db);
    expect(await tester.runAsync(() => store.rows('drafts')), isEmpty);
    final audit = (await tester.runAsync(() => store.rows('audit')))!;
    expect(audit.map((a) => a['action']), containsAll(['Expired stock sold', 'Draft discarded']));

    // keyboard shortcuts help
    await tester.sendKeyEvent(LogicalKeyboardKey.f1);
    await settle(tester);
    expect(find.text('Keyboard shortcuts'), findsOneWidget);
    await done(tester);
  });

  testWidgets('POS layouts: the client strip finds a client; Advanced UI command bar (Ctrl+K) adds, changes and charges', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('customers', {'id': 'c1', 'name': 'Grace Achieng', 'phone': '0772 555 111'})));
    await start(tester);
    await toTill(tester);
    // Standard (the default): the client strip over the medicines
    await tester.enterText(find.byKey(const Key('find-client')), '555');
    await settle(tester, 4);
    await tester.tap(find.text('Grace Achieng').last);
    await settle(tester, 4);
    expect(find.text('Back to walk-in'), findsOneWidget);

    // Advanced UI, kept on this device
    await tester.tap(find.byKey(const Key('pos-layout')));
    await settle(tester, 4);
    await tester.tap(find.text('Advanced UI').last);
    await settle(tester);
    expect(await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:pos-layout'))).getSingleOrNull()), isNotNull);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await settle(tester, 4);
    Future<void> cmd(String text) async {
      await tester.enterText(find.byKey(const Key('command-bar')), text);
      await settle(tester, 3);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await settle(tester, 4);
    }

    await cmd('Calmex');
    expect(find.text('Added Calmex 500mg Tabs'), findsOneWidget);
    await cmd('qty 1 4');
    expect(find.text('1  Calmex 500mg Tabs × 4'), findsOneWidget);
    await cmd('void 3');
    expect(find.text('There is no line 3'), findsOneWidget);
    await cmd('disc 10');
    expect(find.text('Done'), findsOneWidget);
    await cmd('pay');
    expect(find.text('Sale complete ✓'), findsOneWidget);
    final sale = (await tester.runAsync(() => RecordStore(db).rows('sales')))!.single;
    expect((sale['total'], sale['discount'], sale['customerName']), (1800, 200, 'Grace Achieng'));
    await tester.tap(find.text('New sale'));
    await settle(tester);
    await done(tester);
  });

  testWidgets('Sales History parity: edit a past sale with a reason, its history, the Edited filter, held sales, Sales lines', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) {
          d.put('sales', {'id': 's1', 'number': 'RXA1', 'date': '2026-11-01T09:00:00.000Z', 'branchId': 'main', 'payment': 'Cash', 'cashier': 'Tia Admin',
            'customerId': 'walk-in', 'customerName': 'Walk-in Customer', 'subtotal': 1500, 'discount': 0, 'tax': 0, 'total': 1500, 'paid': 1500, 'tendered': 1500,
            'status': 'completed', 'type': 'retail', 'items': [{'id': 'p1', 'name': 'Calmex 500mg Tabs', 'price': 500, 'cost': 300, 'qty': 3, 'alloc': [{'batchId': 'b1', 'qty': 3, 'batch': 'C1', 'expiry': '2029-01-31'}]}]});
          d.put('drafts', {'id': 'h1', 'kind': 'sale', 'branchId': 'main', 'mode': 'retail', 'userId': 'u1', 'userName': 'Tia Admin', 'order': 1,
            'startedAt': '2026-11-05T08:00:00.000Z', 'title': 'Grace', 'count': 1, 'total': 500, 'data': {'cart': [{'id': 'p1', 'name': 'Calmex 500mg Tabs', 'qty': 1, 'price': 500}]}});
        }));
    await start(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.f6);
    await settle(tester);
    expect(find.text('RXA1 · Walk-in Customer'), findsOneWidget);

    // edit: 3 → 2, with a reason
    await tester.tap(find.byTooltip('Actions for RXA1'));
    await settle(tester);
    await tester.tap(find.text('Edit').last);
    await settle(tester);
    await tester.enterText(find.byKey(const Key('edit-qty-p1')), '2');
    await tester.tap(find.text('Save changes'));
    await settle(tester);
    expect(find.text('Say why the sale is being changed'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('edit-reason')), 'wrong quantity entered');
    await settle(tester, 2);
    await tester.tap(find.text('Save changes'));
    await settle(tester);
    expect(find.text('RXA1 updated; stock adjusted'), findsOneWidget);
    final sale = (await tester.runAsync(() => RecordStore(db).rows('sales')))!.single;
    expect((sale['total'], sale['editedBy']), (1000.0, 'Tia Admin'));
    final back = (await tester.runAsync(() => RecordStore(db).rows('movements')))!.where((m) => m['type'] == 'Sale edit').single;
    expect((back['qty'], back['batchId']), (1, 'b1'));

    // the Edited badge and filter; the history in the receipt
    await tester.tap(find.byKey(const Key('filter-Status')));
    await settle(tester, 4);
    await tester.tap(find.text('Edited').last);
    await settle(tester);
    expect(find.text('RXA1 · Walk-in Customer'), findsOneWidget);
    await tester.tap(find.text('RXA1 · Walk-in Customer'));
    await settle(tester);
    expect(find.text('Edit history (1)'), findsOneWidget);
    expect(find.text('Reason: wrong quantity entered'), findsOneWidget);
    Navigator.of(tester.element(find.text('Edit history (1)'))).pop();
    await settle(tester);

    // held sales: discard (audit)
    await tester.tap(find.textContaining('Held sales'));
    await settle(tester);
    expect(find.text('Grace'), findsOneWidget);
    await tester.tap(find.byTooltip('Discard'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Discard'));
    await settle(tester);
    expect(await tester.runAsync(() => RecordStore(db).rows('drafts')), isEmpty);
    expect((await tester.runAsync(() => RecordStore(db).rows('audit')))!.map((a) => a['action']), containsAll(['Sale edited', 'Draft discarded']));

    // Reports → Sales lines
    await navTo(tester, 'Reports');
    await tester.enterText(find.byKey(const Key('date-From')), '2026-11-01');
    await settle(tester, 2);
    await tester.tap(find.text('Sales lines'));
    await settle(tester);
    expect(find.text('Calmex 500mg Tabs · Calmex'), findsOneWidget);
    expect(find.text('2 · UGX 1,000'), findsOneWidget);
    await done(tester);
  });

  testWidgets('Inventory parity: Medicine List add with opening stock, packs, quick edit, stock card, expiry write-off', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) {
          d.put('batches', {'id': 'bx', 'productId': 'p2', 'batch': 'Z0', 'expiry': '2025-02-28', 'cost': 4000});
          d.move(productId: 'p2', qty: 2, type: 'Opening stock', batchId: 'bx');
        }));
    await start(tester);
    final store = RecordStore(db);

    // Medicine List: add with opening stock; price from the markup, barcode generated
    await navTo(tester, 'Medicine List');
    await tester.tap(find.text('Add medicine'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Medicine name'), 'Ferrozin 200mg');
    await tester.enterText(find.widgetWithText(TextFormField, 'Cost price'), '100');
    await tester.enterText(find.widgetWithText(TextFormField, 'Opening stock (quantity)'), '30');
    await tester.enterText(find.widgetWithText(TextFormField, 'Opening stock batch no.'), 'F1');
    await tester.enterText(find.widgetWithText(TextFormField, 'Opening stock expiry'), '2030-01-31');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final fer = (await tester.runAsync(() => store.rows('products')))!.firstWhere((p) => p['name'] == 'Ferrozin 200mg');
    expect((fer['price'], '${fer['barcode']}'.startsWith('20'), '${fer['barcode']}'.length), (150, true, 12));
    final opening = (await tester.runAsync(() => store.rows('movements')))!.where((m) => m['productId'] == fer['id']).single;
    expect((opening['qty'], opening['type']), (30, 'Opening stock'));

    // packs
    await tester.tap(find.byKey(Key('packs-${fer['id']}')));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('pack-size-0')), '10');
    await tester.tap(find.text('Save packs'));
    await settle(tester);
    final withPacks = (await tester.runAsync(() => store.rows('products')))!.firstWhere((p) => p['id'] == fer['id']);
    expect(withPacks['packs'], [{'name': 'Strip', 'size': 10, 'price': null}]);

    // needs review lists records with missing details (Calmex has no formulation unit issues? Zinco has no formulation)
    await tester.tap(find.textContaining('Needs review'));
    await settle(tester);
    expect(find.text('No formulation'), findsWidgets);

    // Quick Edit: a new retail price, audited
    await navTo(tester, 'Quick Edit');
    await tester.enterText(find.byKey(Key('qe-price-${fer['id']}-0')), '180');
    await settle(tester, 2);
    await tester.tap(find.text('Save 1 change'));
    await settle(tester);
    expect((await tester.runAsync(() => store.rows('products')))!.firstWhere((p) => p['id'] == fer['id'])['price'], 180);
    expect((await tester.runAsync(() => store.rows('audit')))!.map((a) => a['action']), contains('Price changed (quick edit)'));

    // Stock card: the opening stock and its balance
    await navTo(tester, 'Stock Card');
    expect(find.text('Balance 100'), findsOneWidget, reason: 'Calmex, the first in stock');

    // Expiring / Expired: write off Zinco's expired batch
    await navTo(tester, 'Expiring / Expired');
    await tester.tap(find.textContaining('Expired ('));
    await settle(tester);
    expect(find.text('Zinco Syrup 100ml'), findsOneWidget);
    await tester.tap(find.text('Write off'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Write off'));
    await settle(tester);
    final wo = (await tester.runAsync(() => store.rows('movements')))!.where((m) => m['type'] == 'Expired write-off').single;
    expect((wo['qty'], wo['batchId']), (-2, 'bx'));
    expect(find.text('No expired stock 🎉'), findsOneWidget);

    // Inventory: edit stock (batch quantity with a reason)
    await tester.sendKeyEvent(LogicalKeyboardKey.f7);
    await settle(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    expect(find.text('Sells next'), findsOneWidget);
    await tester.tap(find.text('Edit stock'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('inv-qty-b1')), '90');
    await tester.enterText(find.byKey(const Key('inv-reason')), 'damaged');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final ie = (await tester.runAsync(() => store.rows('movements')))!.where((m) => m['type'] == 'Inventory edit').single;
    expect(ie['qty'], -10);
    await done(tester);
  });

  testWidgets('Returns with several lines and its note; Reorder purchase orders', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) {
          d.put('suppliers', {'id': 's1', 'name': 'Sample Wholesalers', 'phone': '0772000111'});
          d.put('products', {'id': 'p2', 'name': 'Zinco Syrup 100ml', 'unit': 'Bottle', 'barcode': '7010002', 'price': 6000, 'cost': 4000, 'reorder': 5});
          d.put('batches', {'id': 'b2', 'productId': 'p2', 'batch': 'Z1', 'expiry': '2029-01-31', 'cost': 4000});
          d.move(productId: 'p2', qty: 3, type: 'Opening stock', batchId: 'b2');
        }));
    await start(tester);
    final store = RecordStore(db);
    await navTo(tester, 'Returns to suppliers');
    await tester.tap(find.text('New return'));
    await settle(tester);
    await tester.tap(find.byKey(const Key('return-supplier')));
    await settle(tester, 4);
    await tester.tap(find.text('Sample Wholesalers').last);
    await settle(tester, 4);
    for (final name in ['Calmex', 'Zinco']) {
      await tester.enterText(find.byKey(const Key('return-search')), name);
      await settle(tester, 3);
      await tester.tap(find.textContaining(name).last);
      await settle(tester, 3);
    }
    await tester.tap(find.text('Save return'));
    await settle(tester);
    final ret = (await tester.runAsync(() => store.rows('supplierReturns')))!.single;
    expect((ret['items'] as List).length, 2);
    final out = (await tester.runAsync(() => store.rows('movements')))!.where((m) => m['type'] == 'Supplier return').map((m) => (m['productId'], m['qty'])).toSet();
    expect(out, {('p1', -100), ('p2', -3)});
    await tester.tap(find.text('View'));
    await settle(tester);
    expect(find.text('Return note (PDF)'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Close'));
    await settle(tester);

    // Reorder: Zinco is now out (0 ≤ 5) but never sold and out of stock, so nothing is suggested; dead stock and orders open
    await navTo(tester, 'Reorder');
    await tester.tap(find.text('Dead stock'));
    await settle(tester);
    expect(find.text('No dead stock. Everything is moving.'), findsOneWidget);
    await tester.tap(find.text('Purchase orders'));
    await settle(tester);
    expect(find.text('No purchase orders yet. Create them from Reorder suggestions.'), findsOneWidget);
    await done(tester);
  });

  testWidgets('Add Stock parity: search, line total, batch and expiry, receive; a draft continued from Purchase History; edit a delivery', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('suppliers', {'id': 's1', 'name': 'Sample Wholesalers'})));
    await start(tester);
    final store = RecordStore(db);
    await tester.sendKeyEvent(LogicalKeyboardKey.f4);
    await settle(tester);
    Future<void> fillLine() async {
      await tester.enterText(find.byKey(const Key('stock-search')), 'Calmex');
      await settle(tester, 3);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await settle(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Qty').first, '10');
      await settle(tester, 2);
      await tester.enterText(find.widgetWithText(TextFormField, 'Line total').first, '2800');
      await settle(tester, 2);
      await tester.enterText(find.widgetWithText(TextFormField, 'Batch').first, 'C9');
      await tester.enterText(find.widgetWithText(TextField, 'Expiry').first, '12/2030');
      await settle(tester, 2);
    }

    await fillLine();
    expect(find.text('Calmex 500mg Tabs'), findsWidgets);
    await tester.ensureVisible(find.text('Save as draft'));
    await settle(tester, 2);
    // save as draft, then carry it on from Purchase History → Drafts
    await tester.tap(find.text('Save as draft'));
    await settle(tester);
    expect((await tester.runAsync(() => store.rows('drafts')))!.single['kind'], 'delivery');
    await navTo(tester, 'Purchase history');
    await tester.tap(find.text('Drafts (1)'));
    await settle(tester);
    await tester.tap(find.text('Continue'));
    await settle(tester, 20);
    expect(find.textContaining('Continuing a saved draft'), findsOneWidget);
    await tester.ensureVisible(find.text('Receive stock'));
    await settle(tester, 2);
    await tester.tap(find.text('Receive stock'));
    await settle(tester);
    expect(find.textContaining('Received 1 item(s) worth UGX 2,800'), findsOneWidget);
    final purchase = (await tester.runAsync(() => store.rows('purchases')))!.single;
    final item = (purchase['items'] as List).single as Map;
    expect((item['qty'], item['cost'], item['batch'], item['expiry']), (10, 280, 'C9', '2030-12-31'));
    expect(await tester.runAsync(() => store.rows('drafts')), isEmpty, reason: 'the draft became the delivery');

    // edit the delivery: 10 → 8, with a reason
    await navTo(tester, 'Purchase history');
    await tester.tap(find.byKey(Key('edit-${purchase['number']}')));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Qty').first, '8');
    await tester.enterText(find.byKey(const Key('purchase-reason')), 'invoice said 8');
    await settle(tester, 2);
    await tester.tap(find.text('Save changes'));
    await settle(tester);
    final edit = (await tester.runAsync(() => store.rows('movements')))!.where((m) => m['type'] == 'Purchase edit').single;
    expect(edit['qty'], -2);
    await tester.tap(find.text('Supplier prices'));
    await settle(tester);
    expect(find.text('Buy the same medicine from two suppliers and their prices are compared here.'), findsOneWidget);
    await done(tester);
  });

  testWidgets('Prescriptions in the React shape, dispense; controlled register and batch recall; proforma view and delete', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) {
          d.put('customers', {'id': 'c1', 'name': 'Grace Achieng', 'phone': '0772555111'});
          d.put('prescriptions', {'id': 'rx1', 'customerId': 'c1', 'date': '2026-11-01', 'doctor': 'Dr Okello', 'status': 'Pending', 'medications': 'Amoxil 250mg 1 cap tds 5 days', 'refillsAllowed': 0});
          d.put('products', {'id': 'p1', 'name': 'Calmex 500mg Tabs', 'generic': 'Calmex', 'unit': 'Tablet', 'barcode': '7010001', 'price': 500, 'cost': 300, 'controlled': true});
          d.put('sales', {'id': 's1', 'number': 'RX9', 'date': '2026-11-02T09:00:00.000Z', 'branchId': 'main', 'customerId': 'c1', 'customerName': 'Grace Achieng', 'total': 500, 'paid': 500,
            'status': 'completed', 'controlled': {'patient': 'Grace Achieng', 'idNo': 'CM123', 'prescriber': 'Dr Okello', 'rxNo': 'R-1'},
            'items': [{'id': 'p1', 'name': 'Calmex 500mg Tabs', 'qty': 1, 'price': 500, 'cost': 300, 'alloc': [{'batchId': 'b1', 'qty': 1, 'batch': 'C1'}]}]});
          d.move(productId: 'p1', qty: -1, type: 'Sale', ref: 'RX9', batchId: 'b1');
          d.put('proformas', {'id': 'pf1', 'number': 'PF1', 'date': '2026-11-03T10:00:00Z', 'status': 'Open', 'customerName': 'Walk-in Customer', 'total': 1000, 'createdBy': 'Tia',
            'items': [{'id': 'p1', 'name': 'Calmex 500mg Tabs', 'qty': 2, 'price': 500}]});
        }));
    await start(tester);
    await navTo(tester, 'Prescriptions & Refills');
    expect(find.textContaining('Amoxil 250mg'), findsOneWidget);
    await tester.tap(find.text('Dispense'));
    await settle(tester);
    expect((await tester.runAsync(() => RecordStore(db).get('prescriptions', 'rx1')))!['status'], 'Dispensed');

    await navTo(tester, 'Controlled drugs');
    expect(find.text('Balance 99'), findsOneWidget);
    expect(find.textContaining('Patient Grace Achieng CM123'), findsOneWidget);
    await tester.tap(find.text('Batch recall lookup'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('recall-batch')), 'c1');
    await settle(tester, 4);
    expect(find.text('Sold from this batch: 1 sale'), findsOneWidget);
    expect(find.text('Grace Achieng · 0772555111'), findsOneWidget);

    await navTo(tester, 'Proformas');
    await tester.tap(find.text('View'));
    await settle(tester);
    expect(find.text('PROFORMA INVOICE'), findsOneWidget);
    Navigator.of(tester.element(find.text('PROFORMA INVOICE'))).pop();
    await settle(tester);
    await tester.tap(find.byTooltip('Delete'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await settle(tester);
    expect(await tester.runAsync(() => RecordStore(db).rows('proformas')), isEmpty);
    await done(tester);
  });
  testWidgets('Settings: pharmacy details overridden on this device only, payment methods, messages, restore defaults', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.saveSettings({'name': 'Sample Pharmacy', 'currency': 'UGX', 'smsRefill': 'Old text'})));
    await tester.runAsync(() => db.delete(db.outbox).go());
    await start(tester);
    await navTo(tester, 'Settings');
    expect(find.text('0 local override(s) · Owner pharmacy name: Sample Pharmacy'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('set-name-0-general')), 'Sample Pharmacy Kireka');
    await tester.tap(find.text('Save for this device'));
    await settle(tester);
    expect(find.text('1 local override(s) · Owner pharmacy name: Sample Pharmacy'), findsOneWidget);
    var shared = (await tester.runAsync(() => RecordStore(db).settingsRecord()))!;
    expect(shared['name'], 'Sample Pharmacy', reason: 'an override never changes the shared record');
    expect(await tester.runAsync(() => db.select(db.outbox).get()), isEmpty, reason: 'nor is it sent to the cloud');
    expect(find.text('Sample Pharmacy Kireka'), findsWidgets, reason: 'this device shows its own name');
    await tester.tap(find.text('Use Owner defaults'));
    await settle(tester);
    expect(find.text('0 local override(s) · Owner pharmacy name: Sample Pharmacy'), findsOneWidget);

    await tester.ensureVisible(find.text('Payment methods'));
    await tester.tap(find.text('Payment methods'));
    await settle(tester);
    await tester.tap(find.text('Add payment method'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Name shown on the POS & receipt').last, 'Jubilee Insurance');
    await tester.pump();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Save'));
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    shared = (await tester.runAsync(() => RecordStore(db).settingsRecord()))!;
    expect((shared['paymentMethods'] as List).length, 7);
    expect(((shared['paymentMethods'] as List).last as Map)['name'], 'Jubilee Insurance');

    await tester.ensureVisible(find.text('Messages & recovery'));
    await tester.tap(find.text('Messages & recovery'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Refill reminder'), 'Hello {name}, your {medicine} is due');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    shared = (await tester.runAsync(() => RecordStore(db).settingsRecord()))!;
    expect(shared['smsRefill'], 'Hello {name}, your {medicine} is due');
    expect(shared['name'], 'Sample Pharmacy');
    final audit = (await tester.runAsync(() => RecordStore(db).rows('audit')))!;
    expect(audit.where((a) => a['action'] == 'Settings changed').length, 2);

    await tester.ensureVisible(find.text('Data & backup'));
    await tester.tap(find.text('Data & backup'));
    await settle(tester);
    await tester.ensureVisible(find.text('Restore defaults'));
    await tester.tap(find.text('Restore defaults'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Restore defaults'));
    await settle(tester);
    shared = (await tester.runAsync(() => RecordStore(db).settingsRecord()))!;
    expect(shared['smsRefill'], startsWith('Hello {name}, this is {pharmacy}.'));
    expect((shared['paymentMethods'] as List).length, 6);
    expect(shared['name'], 'Sample Pharmacy', reason: 'pharmacy details are kept');
    await done(tester);
  });
  testWidgets('This device: date format, sounds, text size; phone layout fits', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'This device');
    expect(find.text('Ready to work offline'), findsNothing, reason: 'never synced yet');
    await tester.ensureVisible(find.text('YYYY-MM-DD'));
    await tester.tap(find.text('YYYY-MM-DD'));
    await settle(tester);
    Future<String?> kv(String k) async => (await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:$k'))).getSingleOrNull()))?.v;
    expect(await kv('dateFormat'), 'ymd');
    await tester.ensureVisible(find.byKey(const Key('sound-message')));
    await tester.tap(find.byKey(const Key('sound-message')));
    await settle(tester);
    await tester.tap(find.text('Silent').last);
    await settle(tester);
    expect(await kv('sounds'), contains('"message":"off"'));
    await tester.ensureVisible(find.byKey(const Key('zoom')));
    await tester.tap(find.byKey(const Key('zoom')));
    await settle(tester);
    expect(await kv('zoom'), isNotNull, reason: 'text size is kept on this device');
    await done(tester);
  });

  testWidgets('on a phone: chat, every settings tab and this device fit the screen', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, size: const Size(400, 800));
    Future<void> open(String label) async {
      await tester.tap(find.byTooltip('Open navigation menu'));
      await settle(tester);
      final list = find.descendant(of: find.byType(Drawer), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.descendant(of: find.byType(Drawer), matching: find.text(label)), 150, scrollable: list);
      await settle(tester, 2);
      await tester.tap(find.descendant(of: find.byType(Drawer), matching: find.text(label)));
      await settle(tester);
    }

    await open('Chat & Messages');
    await tester.tap(find.text('General'));
    await settle(tester);
    expect(find.text('Message the team'), findsOneWidget);
    await tester.tap(find.byTooltip('Back to chats'));
    await settle(tester);
    await open('Settings');
    for (final t in ['Payment methods', 'Receipts & stock', 'Messages & recovery', 'Alerts & storage', 'Online & Mobile Money', 'Data & backup']) {
      await tester.ensureVisible(find.text(t));
      await tester.tap(find.text(t));
      await settle(tester);
    }
    await open('This device');
    expect(find.text('Notification sounds'), findsOneWidget);
    await done(tester);
  });

  testWidgets('Barcode labels: a medicine without a barcode gets one; all in stock; quantities', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'Barcode labels');
    await tester.enterText(find.byKey(const Key('labels-search')), 'Zinco');
    await settle(tester, 4);
    await tester.tap(find.text('Zinco Syrup 100ml').last);
    await settle(tester);
    expect(find.text('Print 1 label'), findsOneWidget);
    await tester.tap(find.byTooltip('More'));
    await settle(tester, 4);
    expect(find.text('Print 2 labels'), findsOneWidget);
    await tester.tap(find.text('Add all in-stock items'));
    await settle(tester);
    expect(find.text('Print 3 labels'), findsOneWidget, reason: 'Calmex is the only one in stock');
    expect(find.text('Exp 2029-01-31'), findsOneWidget, reason: "Calmex's batch expiry");
    await done(tester);
  });

  testWidgets('Drug information: looked up, saved for offline, shown at the till', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'Drug information');
    await tester.enterText(find.byKey(const Key('drug-search')), 'amoxicillin');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(find.text('AMOXICILLIN (AMOXIL)'), findsOneWidget);
    expect(find.text('500 mg three times a day.'), findsOneWidget);
    expect(find.text('Print counselling sheet'), findsOneWidget);
    final saved = await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:drug:amoxicillin'))).getSingleOrNull());
    expect(saved, isNotNull, reason: 'kept on this device for offline use');
    await tester.tap(find.text('New search'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('drug-search')), 'Calmex');
    await settle(tester, 4);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    expect(find.textContaining('No label found for “calmex”'), findsOneWidget);
    await done(tester);
  });

  Future<void> quizMedicines() => RecordStore(db).update((d) {
        for (final (i, (name, generic, form)) in const [
          ('Amoxil 500mg Caps', 'Amoxicillin', 'Capsules'),
          ('Brufen 400mg Tabs', 'Ibuprofen', 'Tablets'),
          ('Flagyl Suspension', 'Metronidazole', 'Suspension'),
          ('Zyrtec Syrup', 'Cetirizine', 'Syrup'),
          ('Ventolin Inhaler', 'Salbutamol', 'Inhaler'),
        ].indexed) {
          d.put('products', {'id': 'q$i', 'name': name, 'generic': generic, 'form': form, 'unit': 'Pack', 'price': 1000, 'cost': 500});
        }
      });

  testWidgets('Drug quiz: a quick quiz offline, one question at a time, the score saved and on the team board', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(quizMedicines);
    await start(tester);
    await navTo(tester, 'Drug quiz');
    expect(find.text('No quizzes yet this month'), findsOneWidget);
    await tester.tap(find.byKey(const Key('quiz-offline')));
    await settle(tester);
    expect(find.text('Question 1 of 6'), findsOneWidget, reason: 'six medicines have a generic name that differs from their name');
    for (var i = 0; i < 6; i++) {
      expect(find.byKey(const Key('quiz-opt-3')), findsOneWidget);
      await tester.tap(find.byKey(const Key('quiz-opt-0')));
      await settle(tester, 2);
      expect(find.textContaining(RegExp(r'^(Correct! |The right answer is )')), findsOneWidget);
      await tester.tap(find.byKey(const Key('quiz-opt-1')));
      await settle(tester, 2);
      expect(find.textContaining(RegExp(r'^(Correct! |The right answer is )')), findsOneWidget, reason: 'the first answer stands');
      await tester.ensureVisible(find.byKey(const Key('quiz-next')));
      await tester.tap(find.byKey(const Key('quiz-next')));
      await settle(tester, 4);
    }
    expect(find.textContaining(' / 6'), findsOneWidget);
    expect(find.text('Answers'), findsOneWidget);
    final saved = (await tester.runAsync(() => RecordStore(db).rows('quizResults')))!.single;
    expect((saved['userId'], saved['userName'], saved['total'], saved['source']), ('u1', 'Tia Admin', 6, 'Your medicine list'));
    expect(saved['score'], isA<int>());
    expect(find.text('Tia Admin'), findsWidgets, reason: 'on the team board');
    await tester.ensureVisible(find.text('Another quiz'));
    await tester.tap(find.text('Another quiz'));
    await settle(tester);
    expect(find.byKey(const Key('quiz-offline')), findsOneWidget);
    await done(tester);
  });

  testWidgets('Drug quiz on a phone: the start, a question and the board fit the screen', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(quizMedicines);
    await start(tester, size: const Size(400, 800));
    await tester.tap(find.byTooltip('Open navigation menu'));
    await settle(tester);
    final list = find.descendant(of: find.byType(Drawer), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.descendant(of: find.byType(Drawer), matching: find.text('Drug quiz')), 150, scrollable: list);
    await settle(tester, 2);
    await tester.tap(find.descendant(of: find.byType(Drawer), matching: find.text('Drug quiz')));
    await settle(tester);
    expect(find.text('Team board · this month'), findsOneWidget);
    await tester.tap(find.byKey(const Key('quiz-offline')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('quiz-opt-0')));
    await settle(tester, 2);
    expect(find.text('Question 1 of 6'), findsOneWidget);
    await done(tester);
  });
}
