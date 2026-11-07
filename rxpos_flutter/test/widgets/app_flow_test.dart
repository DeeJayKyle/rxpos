// The real screens, driven like a cashier would: sign in, scan, charge, receipt; Add Stock; the sync screen.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' show Tristate;

import 'package:crypto/crypto.dart';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/router/app_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:rxpos/app.dart';
import 'package:rxpos/core/data/pharmacy_providers.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/network/dio_client.dart';
import 'package:rxpos/core/rules/passwords.dart';
import 'package:rxpos/core/crash/crash_screen.dart';
import 'package:rxpos/core/live/live_connection.dart';
import 'package:rxpos/core/notify/os_notifications.dart';
import 'package:rxpos/core/rules/dates.dart';
import 'package:rxpos/core/sound/sounds.dart';
import 'package:rxpos/core/sync/sync_config.dart';
import 'package:rxpos/core/presentation/app_shell.dart' show sidebarStartsCollapsedProvider;
import 'package:rxpos/core/presentation/page_tip.dart';
import 'package:rxpos/features/sales_pos/application/sale_controller.dart';
import 'package:rxpos/features/sales_pos/presentation/pos_screen.dart';
import 'package:rxpos/core/update/app_updates.dart';
import 'package:rxpos/features/calls/application/call_controller.dart';
import 'package:rxpos/features/calls/domain/rtc_peer.dart';
import 'package:rxpos/features/engage/presentation/watchers.dart';
import 'package:rxpos/features/reports/domain/weekly.dart';
import 'package:rxpos/core/presentation/widgets.dart';
import 'package:rxpos/core/theme/design_systems.dart';
import 'package:rxpos/core/theme/themes.dart';
import 'package:rxpos/features/auth/domain/offline_secrets.dart';
import 'package:rxpos/features/calendar/domain/calendar.dart';
import 'package:rxpos/features/calendar/presentation/calendar_screen.dart';
import 'package:rxpos/features/drug_info/presentation/drug_info_screen.dart';
import 'package:rxpos/features/storage/application/weather_controller.dart';
import 'package:rxpos/features/sync_status/application/sync_controller.dart';

import '../sync/fake_cloud.dart';

void main() {
  setUpAll(() {
    passwordIterations = 50;
    pinIterations = 50;
    PackageInfo.setMockInitialValues(appName: 'RxPOS', packageName: 'io.github.rxpos', version: '1.0.0', buildNumber: '42', buildSignature: '');
  });
  late AppDatabase db;
  late FakeCloud cloud;
  WidgetTester? tester0;
  final weatherCalls = <String>[];
  final played = <String>[]; // the sounds the app asked for (none really play in tests)
  final osNotify = _FakeNotify(); // system notifications the app asked for
  // fictional weather: hot and humid, so both storage warnings show
  final sampleWeather = <String, Object?>{
    'current': {'time': '2026-11-05T12:15', 'temperature_2m': 31.4, 'relative_humidity_2m': 70, 'apparent_temperature': 34, 'weather_code': 2, 'wind_speed_10m': 9.6},
    'daily': {'temperature_2m_min': [18.2], 'temperature_2m_max': [31.9], 'precipitation_probability_max': [40]},
  };

  setUp(() {
    weatherCalls.clear();
    played.clear();
    osNotify.reset();
    db = AppDatabase(NativeDatabase.memory());
    cloud = FakeCloud()
      ..login = (b) => b['password'] == 'tia-pass'
          ? (
              200,
              {
                'token': 'u.tok',
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

  Future<void> start(WidgetTester tester, {Size size = const Size(1440, 900), List<Override> extra = const [], bool engage = false, bool live = false, bool foreground = true, bool calls = false, bool tips = false, bool foldedNav = false}) async {
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
          weatherFetchProvider.overrideWithValue((url) async {
            weatherCalls.add(url);
            return (200, sampleWeather);
          }),
          connectionPlaceProvider.overrideWithValue(() async => {'lat': 0.31, 'lon': 32.58, 'city': 'Kampala', 'country': 'UG'}),
          if (!extra.any((o) => o.origin == gpsPositionProvider)) gpsPositionProvider.overrideWithValue(() async => null), // no GPS unless a test gives one
          engageOnProvider.overrideWithValue(engage), // pop-ups and the idle screen: only in the tests about them
          soundsProvider.overrideWith((ref) => _QuietSounds(ref, played)),
          liveOnProvider.overrideWithValue(live), // no real connection to the cloud in tests
          callsOnProvider.overrideWithValue(calls), // voice calls: only in the tests about them
          pageTipsOnProvider.overrideWithValue(tips), // first-visit tips: only in the test about them
          sidebarStartsCollapsedProvider.overrideWithValue(foldedNav), // sidebar groups open, so pages are found by name
          if (!extra.any((o) => o.origin == updatePlatformProvider)) updatePlatformProvider.overrideWithValue(null), // no self-updates unless a test asks
          osNotifyProvider.overrideWithValue(osNotify),
          appInForegroundProvider.overrideWithValue(() => foreground),
          ...extra,
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
              'token': 'u.tok',
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
    expect(find.text('Sale complete'), findsOneWidget);
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
    expect(find.text('Sale complete'), findsOneWidget);
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
    await tester.enterText(find.widgetWithText(TextFormField, 'Full name / company'), 'Grace Sample');
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

  testWidgets("a pharmacy's own address (/pharmcare, bookmarked from the classic app) opens the dashboard", (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    final router = ProviderScope.containerOf(tester.element(find.byType(MaterialApp).first)).read(appRouterProvider);
    router.go('/pharmcare');
    await settle(tester);
    expect(router.routerDelegate.currentConfiguration.uri.path, '/');
    expect(find.byKey(const Key('sidebar')), findsOneWidget);
    await done(tester);
  });

  testWidgets('Payroll & HR: add staff, mark a day, prepare and pay the month; Settings: a report email sent now', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'Payroll & HR');
    await tester.tap(find.byKey(const Key('add-employee')));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Full name'), 'Ann Sample');
    await tester.enterText(find.widgetWithText(TextFormField, 'Basic salary a month'), '600000');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    expect(find.text('Ann Sample'), findsOneWidget);

    await tester.tap(find.byKey(const Key('payroll-tab-attendance')));
    await settle(tester);
    await tester.tap(find.text('Sick'));
    await settle(tester);
    final att = (await tester.runAsync(() => RecordStore(db).rows('attendance')))!.single;
    expect(att['status'], 'sick');

    await tester.tap(find.byKey(const Key('payroll-tab-runs')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('prepare-payroll')));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Prepare'));
    await settle(tester);
    // 600,000 gross: PAYE 25,000 + 30% of 190,000 = 82,000; NSSF 30,000; net 488,000
    expect(find.text('UGX 488,000'), findsWidgets);
    await tester.tap(find.byKey(const Key('pay-payroll')));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Mark as paid').last);
    await settle(tester);
    final exp = (await tester.runAsync(() => RecordStore(db).rows('expenses')))!.map((e) => e['amount']).toSet();
    expect(exp, {488000, 82000 + 30000 + 60000});
    noSnackBars(tester);

    cloud.api['reports/send'] = (b) => (200, {'period': '2026-11-07', 'to': ['owner@example.com'], 'sent': 1, 'error': '', 'file': 'Weekly.xlsx', 'sheets': const []});
    await navTo(tester, 'Settings');
    await tester.ensureVisible(find.text('Alerts & storage'));
    await settle(tester, 2);
    await tester.tap(find.text('Alerts & storage'));
    await settle(tester);
    await tester.ensureVisible(find.byKey(const Key('add-report-schedule')));
    await tester.tap(find.byKey(const Key('add-report-schedule')));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Weekly report');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email it to (separated by commas)'), 'owner@example.com');
    await tester.tap(find.descendant(of: find.byType(Dialog), matching: find.widgetWithText(FilledButton, 'Save')));
    await settle(tester);
    final sched = (await tester.runAsync(() => RecordStore(db).rows('reportSchedules')))!.single;
    expect((sched['frequency'], (sched['reports'] as List).length, sched['active']), ('weekly', 5, true));
    await tester.ensureVisible(find.text('Send now'));
    await tester.tap(find.text('Send now'));
    await settle(tester);
    expect((cloud.calls.last.$1, cloud.calls.last.$2['id']), ('reports/send', sched['id']));
    expect(find.text('Weekly.xlsx emailed to 1 address'), findsOneWidget);
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
    await navTo(tester, 'Weather & Storage');
    await tester.tap(find.text('Record reading'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('reading-temp')), '11');
    await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
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
    expect(find.text('NDA inspection'), findsWidgets, reason: 'in the month and on the day');

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
    await tester.tap(find.widgetWithText(ChoiceChip, 'Favourites'));
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
    expect(find.text('Edit label'), findsOneWidget);

    // the sale survives a restart of the app
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 400)));
    await settle(tester);
    expect(await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:pos-sale-retail'))).getSingleOrNull()), isNotNull);
    await done(tester);
    await start(tester);
    await toTill(tester);
    await settle(tester);
    expect(find.text('Expired stock · No alternative in town'), findsOneWidget, reason: 'the sale came back after the restart');
    expect(find.text('Edit label'), findsOneWidget);

    // charge it: the expired override is on the sale and in the audit log
    await tester.tap(find.textContaining('Charge UGX 2,000'));
    await settle(tester);
    expect(find.text('Sale complete'), findsOneWidget);
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
    expect(find.text('Sale complete'), findsOneWidget);
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

  testWidgets('Weather & Storage: the weather and its advice, readings with humidity, the trend, delete a reading', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(
      () => RecordStore(db).update((d) {
        d.put('tempLogs', {'id': 't1', 'at': '2026-11-04T06:00:00.000Z', 'place': 'Fridge', 'temp': 5, 'humidity': null, 'note': '', 'by': 'Tia Admin', 'branchId': 'main'});
        d.put('tempLogs', {'id': 't2', 'at': '2026-11-04T12:00:00.000Z', 'place': 'Fridge', 'temp': 6.5, 'humidity': null, 'note': '', 'by': 'Tia Admin', 'branchId': 'main'});
        d.put('tempLogs', {'id': 't3', 'at': '2026-11-04T12:00:00.000Z', 'place': 'Fridge', 'temp': 4, 'humidity': null, 'note': 'other branch', 'by': 'Ben', 'branchId': 'b2'});
      }),
    );
    await start(tester);
    expect(find.byKey(const Key('weather-card')), findsOneWidget, reason: 'the dashboard shows the weather');
    await navTo(tester, 'Weather & Storage');
    expect(find.text('Kampala, UG'), findsOneWidget, reason: "the connection's location");
    expect(find.text('31°C'), findsOneWidget);
    expect(find.text('Partly cloudy · feels 34°C'), findsOneWidget);
    expect(find.textContaining('Hot (31°C)'), findsOneWidget);
    expect(find.textContaining('Humid (70%)'), findsOneWidget);
    expect(find.text('18° / 32°'), findsOneWidget);
    expect(weatherCalls.single, contains('latitude=0.31'));
    final kept = await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:weather'))).getSingleOrNull());
    expect(kept, isNotNull, reason: 'kept on this device to show offline');
    expect(find.byKey(const Key('temp-trend')), findsOneWidget, reason: "two fridge readings at this branch draw the trend; the other branch's isn't counted");
    expect(find.text('Fridge · 4°C'), findsNothing);

    // room 24°C but 80% humidity: out of range
    await tester.tap(find.text('Record reading'));
    await settle(tester);
    await tester.tap(find.byKey(const Key('reading-place')));
    await settle(tester, 3);
    await tester.tap(find.text('Room').last);
    await settle(tester, 3);
    await tester.enterText(find.byKey(const Key('reading-temp')), '24');
    await tester.enterText(find.byKey(const Key('reading-humidity')), '80');
    await tester.enterText(find.byKey(const Key('reading-note')), 'rain all day');
    await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
    await settle(tester);
    expect(find.text('Out of range! Room should be below 25°C'), findsOneWidget);
    noSnackBars(tester);
    final room = (await tester.runAsync(() => RecordStore(db).rows('tempLogs')))!.firstWhere((r) => r['place'] == 'Room');
    expect((room['temp'], room['humidity'], room['note'], room['by'], room['branchId']), (24, 80, 'rain all day', 'Tia Admin', 'main'));
    expect(find.text('Room · 24°C · 80%'), findsOneWidget);

    // a fridge reading without humidity keeps it empty
    await tester.tap(find.text('Record reading'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('reading-temp')), '5');
    await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
    await settle(tester);
    expect(find.text('Reading saved'), findsOneWidget);
    noSnackBars(tester);
    final fridge = (await tester.runAsync(() => RecordStore(db).rows('tempLogs')))!.where((r) => r['place'] == 'Fridge' && r['branchId'] == 'main' && r['id'] != 't1' && r['id'] != 't2');
    expect(fridge.single['humidity'], isNull);

    final page = find.descendant(of: find.byKey(const Key('storage-page')), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const ValueKey('reading-t1')), 200, scrollable: page);
    await settle(tester, 2);
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('reading-t1')), matching: find.byTooltip('Delete')));
    await settle(tester);
    expect(find.text('Delete this reading?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await settle(tester);
    expect(find.byKey(const ValueKey('reading-t1')), findsNothing);
    expect((await tester.runAsync(() => RecordStore(db).get('tempLogs', 't1'))), isNull);
    await done(tester);
  });

  testWidgets('Weather & Storage on a phone fits the screen', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, size: const Size(400, 800));
    await tester.tap(find.byTooltip('Open navigation menu'));
    await settle(tester);
    final list = find.descendant(of: find.byType(Drawer), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.descendant(of: find.byType(Drawer), matching: find.text('Weather & Storage')), 150, scrollable: list);
    await settle(tester, 2);
    await tester.tap(find.descendant(of: find.byType(Drawer), matching: find.text('Weather & Storage')));
    await settle(tester);
    expect(find.byKey(const Key('weather-card')), findsOneWidget);
    final page = find.descendant(of: find.byKey(const Key('storage-page')), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.text('Trend'), 200, scrollable: page);
    await settle(tester, 2);
    expect(find.text('Trend'), findsOneWidget);
    await tester.drag(page, const Offset(0, 3000));
    await settle(tester, 2);
    await tester.tap(find.text('Record reading'));
    await settle(tester);
    expect(find.text('Record a temperature reading'), findsOneWidget);
    await done(tester);
  });

  testWidgets('Calendar: repeating event with notes, refills and expiries, Today, copy the link, edit and delete', (tester) async {
    final day = today();
    await tester.runAsync(signedIn);
    await tester.runAsync(
      () => RecordStore(db).update((d) {
        d.put('customers', {'id': 'c9', 'name': 'Amina Test'});
        d.put('prescriptions', {'id': 'rx9', 'customerId': 'c9', 'status': 'Dispensed', 'dispensedOn': day, 'refillDays': 0, 'medications': 'Calmex 1x3'});
        d.put('prescriptions', {'id': 'rx8', 'customerId': 'c9', 'status': 'Dispensed', 'dispensedOn': addDays(day, -30), 'refillDays': 30, 'medications': 'Calmex 1x3'});
        d.put('batches', {'id': 'b9', 'productId': 'p1', 'batch': 'SOON', 'expiry': day, 'cost': 300});
        d.move(productId: 'p1', qty: 5, type: 'Opening stock', batchId: 'b9');
      }),
    );
    cloud.api['calendar-link'] = (_) => (200, {'url': 'https://cloud.test/api/calendar/t1/sig.ics'});
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await start(tester);
    await navTo(tester, 'Calendar');
    expect(find.text('Refill due: Amina Test'), findsWidgets, reason: 'the 30-day refill falls today; the one without refill days is left out');
    expect(find.text('Expires: Calmex 500mg Tabs (5 left, batch SOON)'), findsWidgets);
    expect(find.text('https://cloud.test/api/calendar/t1/sig.ics'), findsOneWidget);
    await tester.tap(find.text('Copy'));
    await settle(tester, 3);
    expect(copied, 'https://cloud.test/api/calendar/t1/sig.ics');
    noSnackBars(tester);

    await tester.tap(find.text('Add event'));
    await settle(tester);
    await tester.enterText(find.byKey(const Key('event-title')), 'Staff meeting');
    await tester.enterText(find.byKey(const Key('event-time')), '9:30');
    await tester.enterText(find.byKey(const Key('event-end')), '1030');
    await tester.enterText(find.byKey(const Key('event-notes')), 'Stock count plan');
    await tester.tap(find.byKey(const Key('event-repeat')));
    await settle(tester, 3);
    await tester.tap(find.text('Every week').last);
    await settle(tester, 3);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await settle(tester);
    final ev = (await tester.runAsync(() => RecordStore(db).rows('events')))!.single;
    expect((ev['title'], ev['date'], ev['time'], ev['endTime'], ev['repeat'], ev['notes'], ev['createdBy']), ('Staff meeting', day, '09:30', '10:30', 'weekly', 'Stock count plan', 'Tia Admin'));
    expect(ev.containsKey('note'), isFalse, reason: 'the React app reads notes');
    expect(find.text('09:30–10:30 · Staff meeting'), findsOneWidget);
    noSnackBars(tester);

    // a week on: the repeating event is there too
    final next = addDays(day, 7);
    if (!next.startsWith(day.substring(0, 7))) {
      await tester.tap(find.byTooltip('Next month'));
      await settle(tester, 3);
    }
    await tester.ensureVisible(find.byKey(ValueKey('cal-$next')));
    await tester.tap(find.byKey(ValueKey('cal-$next')));
    await settle(tester, 3);
    expect(find.text('09:30–10:30 · Staff meeting'), findsOneWidget);
    await tester.ensureVisible(find.text('Today'));
    await tester.tap(find.text('Today'));
    await settle(tester, 3);
    expect(find.text(longDay(day)), findsOneWidget);

    await tester.ensureVisible(find.text('Edit'));
    await tester.tap(find.text('Edit'));
    await settle(tester);
    await tester.tap(find.text('Delete'));
    await settle(tester);
    expect(find.text('Delete "Staff meeting"?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await settle(tester);
    expect((await tester.runAsync(() => RecordStore(db).rows('events')))!, isEmpty);
    final audit = (await tester.runAsync(() => RecordStore(db).rows('audit')))!;
    expect(audit.map((a) => a['action']), containsAll(['Calendar event added', 'Calendar event deleted']));
    await done(tester);
  });

  testWidgets('Calendar on a phone fits the screen', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, size: const Size(400, 800));
    await tester.tap(find.byTooltip('Open navigation menu'));
    await settle(tester);
    final list = find.descendant(of: find.byType(Drawer), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.descendant(of: find.byType(Drawer), matching: find.text('Calendar')), 150, scrollable: list);
    await settle(tester, 2);
    await tester.tap(find.descendant(of: find.byType(Drawer), matching: find.text('Calendar')));
    await settle(tester);
    expect(find.byKey(const Key('cal-month')), findsOneWidget);
    final page = find.descendant(of: find.byKey(const Key('calendar-page')), matching: find.byType(Scrollable)).first;
    await tester.drag(page, const Offset(0, -3000));
    await settle(tester, 2);
    expect(find.text('Download .ics file'), findsOneWidget);
    await tester.tap(find.text('Add event'));
    await settle(tester);
    expect(find.byKey(const Key('event-title')), findsOneWidget);
    await done(tester);
  });

  /// Wait (real time, up to 20 s) until [ready] holds: hashing a password on another thread takes a moment.
  Future<void> until(WidgetTester tester, Future<bool> Function() ready) async {
    for (var i = 0; i < 200; i++) {
      if ((await tester.runAsync(ready)) == true) break;
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await tester.pump(const Duration(milliseconds: 50));
    }
    await settle(tester, 4);
  }

  /// Pump (real time, up to 20 s) until [f] finds something.
  Future<void> untilShown(WidgetTester tester, Finder f) async {
    for (var i = 0; i < 200 && f.evaluate().isEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await tester.pump(const Duration(milliseconds: 50));
    }
    await settle(tester, 2);
  }

  Future<void> menu(WidgetTester tester, String item) async {
    await tester.tap(find.byKey(const Key('account-menu')));
    await settle(tester, 8); // the menu has opened
    await tester.tap(find.text(item));
    await settle(tester, 4);
  }

  Future<void> typeSecret(WidgetTester tester, String v, String button) async {
    await tester.enterText(find.descendant(of: find.byKey(const Key('secret')), matching: find.byType(EditableText)), v);
    await tester.tap(find.widgetWithText(FilledButton, button));
    await settle(tester, 6);
  }

  testWidgets('account menu: change my password, a quick PIN, log out, then the PIN signs in offline', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('users', {'id': 'u1', 'name': 'Tia Admin', 'email': 'tia@test.rx', 'username': 'tia', 'role': 'admin'})));
    await start(tester);
    await menu(tester, 'Change my password');
    await typeSecret(tester, 'short', 'Next');
    expect(find.text('Use a password of at least 8 characters.'), findsOneWidget);
    await typeSecret(tester, 'new-pass-9', 'Next');
    await typeSecret(tester, 'new-pass-9', 'Save password');
    await until(tester, () async => (await RecordStore(db).get('users', 'u1'))?['algo'] == 'pbkdf2');
    final me = (await tester.runAsync(() => RecordStore(db).get('users', 'u1')))!;
    expect((me['algo'], verifyPassword(me, 'new-pass-9')), ('pbkdf2', true));
    noSnackBars(tester);

    await menu(tester, 'Set a quick PIN for this device');
    await typeSecret(tester, '2468', 'Next');
    await typeSecret(tester, '2468', 'Save PIN');
    await untilShown(tester, find.text('Quick PIN set for this device'));
    expect(find.text('Quick PIN set for this device'), findsOneWidget);
    noSnackBars(tester);

    await menu(tester, 'Log out');
    await settle(tester);
    expect(find.text('Sign in · this device: Sample Pharmacy'), findsOneWidget);
    cloud.login = null; // no internet
    await tester.enterText(find.widgetWithText(TextField, 'Email or username'), 'tia');
    await untilShown(tester, find.text('Use the PIN for this device'));
    await tester.tap(find.text('Use the PIN for this device'));
    await settle(tester, 3);
    expect(find.text('Enter the PIN set on this device for Tia Admin'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('otp-pin')), '1357');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await untilShown(tester, find.text('Wrong PIN. 4 tries left.'));
    expect(find.text('Wrong PIN. 4 tries left.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('otp-pin')), '2468');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await untilShown(tester, find.byKey(const Key('account-menu')));
    expect(find.byKey(const Key('account-menu')), findsOneWidget, reason: 'signed in offline with the PIN');

    // and the new password works offline too
    await menu(tester, 'Log out');
    await tester.enterText(find.widgetWithText(TextField, 'Email or username'), 'tia@test.rx');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'new-pass-9');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await untilShown(tester, find.byKey(const Key('account-menu')));
    expect(find.byKey(const Key('account-menu')), findsOneWidget);
    await done(tester);
  });

  testWidgets('a temporary password: asked for a new one at once', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('users', {'id': 'u1', 'name': 'Tia Admin', 'email': 'tia@test.rx', 'role': 'admin', 'mustChangePassword': true})));
    await start(tester);
    expect(find.text('Welcome, Tia. Set your own password'), findsOneWidget);
    await typeSecret(tester, 'mine-only-1', 'Next');
    await typeSecret(tester, 'mine-only-1', 'Save password');
    await until(tester, () async => (await RecordStore(db).get('users', 'u1'))?['algo'] == 'pbkdf2');
    final me = (await tester.runAsync(() => RecordStore(db).get('users', 'u1')))!;
    expect(me.containsKey('mustChangePassword'), isFalse);
    final audit = (await tester.runAsync(() => RecordStore(db).rows('audit')))!;
    expect(audit.single['action'], 'Password changed');
    await done(tester);
  });

  testWidgets('forgot password: a code by SMS, then the new password; remember me', (tester) async {
    cloud.api['password/forgot'] = (b) => (200, {'message': 'We sent a code by SMS.', 'hint': '07•• ••• 123'});
    cloud.api['password/reset'] = (b) => b['code'] == '654321' ? (200, {'ok': true}) : (400, {'error': 'That code is not right.'});
    await start(tester);
    await tester.tap(find.byKey(const Key('remember-me')));
    await settle(tester, 3);
    expect(find.text('Stays signed in on this device. Leave it off on a shared computer.'), findsOneWidget);
    await tester.tap(find.text('Forgot password?'));
    await settle(tester);
    await tester.tap(find.text('Send a code by SMS'));
    await settle(tester);
    expect(find.text('Enter your email first.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Your email'), 'tia@test.rx');
    await tester.tap(find.text('Send a code by SMS'));
    await settle(tester);
    expect(find.text('We sent a code by SMS. (07•• ••• 123)'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('reset-code')), '111111');
    await tester.enterText(find.widgetWithText(TextField, 'New password (8+ characters)'), 'brand-new-1');
    await tester.tap(find.text('Set new password'));
    await settle(tester);
    expect(find.text('That code is not right.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('reset-code')), '654321');
    await tester.tap(find.text('Set new password'));
    await settle(tester);
    expect(find.text('Password changed. Sign in with it now.'), findsOneWidget);
    expect(cloud.calls.where((c) => c.$1 == 'password/reset').last.$2['channel'], 'sms');
    expect(find.text('Forgot password?'), findsOneWidget, reason: 'back to sign in');
    final kept = await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:remember-choice'))).getSingleOrNull());
    expect(kept?.v, '1');
    await done(tester);
  });

  testWidgets('two-step sign-in: set it up with the QR code, then it is on', (tester) async {
    var enabled = false;
    cloud.api['2fa'] = (_) => (200, {'enabled': enabled});
    cloud.api['2fa/setup'] = (_) => (200, {'uri': 'otpauth://totp/RxPOS:tia?secret=JBSWY3DPEHPK3PXP', 'secret': 'JBSWY3DPEHPK3PXP'});
    cloud.api['2fa/enable'] = (b) => b['code'] == '246810' ? (200, {'ok': (enabled = true)}) : (400, {'error': 'That code is not right.'});
    await tester.runAsync(signedIn);
    await start(tester);
    await menu(tester, 'Two-step sign-in');
    await tester.tap(find.text('Set it up'));
    await settle(tester);
    expect(find.byKey(const Key('twostep-qr')), findsOneWidget);
    expect(find.text('Or type the key: JBSW Y3DP EHPK 3PXP'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('twostep-code')), '246810');
    await tester.pump();
    await tester.tap(find.text('Switch on'));
    await settle(tester);
    expect(find.text('Two-step sign-in is on for your account.'), findsOneWidget);
    expect(enabled, isTrue);
    final trusted = await tester.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:2fa-ok:t1:u1'))).getSingleOrNull());
    expect(trusted?.v, '1', reason: 'this device may sign them in offline');
    await done(tester);
  });

  testWidgets('sign-in and the account menu on a phone fit the screen', (tester) async {
    await start(tester, size: const Size(400, 800));
    await tester.tap(find.text('Forgot password?'));
    await settle(tester);
    expect(find.text('Email me a code'), findsOneWidget);
    await done(tester);
    await tester.runAsync(signedIn);
    await start(tester, size: const Size(400, 800));
    await tester.tap(find.byKey(const Key('account-menu')));
    await settle(tester, 4);
    expect(find.text('Log out'), findsOneWidget);
    await done(tester);
  });

  testWidgets('the bell: urgent, needs attention, for information; menu counts; open an alert', (tester) async {
    final day = today();
    await tester.runAsync(signedIn);
    await tester.runAsync(
      () => RecordStore(db).update((d) {
        d.put('batches', {'id': 'bx', 'productId': 'p1', 'batch': 'OLD', 'expiry': addDays(day, -3), 'cost': 300});
        d.move(productId: 'p1', qty: 4, type: 'Opening stock', batchId: 'bx');
        d.put('products', {'id': 'p5', 'name': 'Lowmex Syrup', 'unit': 'Bottle', 'price': 1000, 'cost': 500, 'reorder': 10});
        d.put('batches', {'id': 'b5', 'productId': 'p5', 'batch': 'L1', 'expiry': '2030-01-31', 'cost': 500});
        d.move(productId: 'p5', qty: 3, type: 'Opening stock', batchId: 'b5');
        d.put('events', {'id': 'e1', 'title': 'Supplier visit', 'date': day, 'time': '10:00'});
      }),
    );
    await start(tester);
    expect(find.descendant(of: find.byKey(const Key('bell')), matching: find.text('4')), findsOneWidget, reason: 'expired, low, the event and the hot weather');
    final side = find.descendant(of: find.byKey(const Key('sidebar')), matching: find.byType(Scrollable));
    await tester.scrollUntilVisible(find.byKey(const ValueKey('count-/expiry')), 120, scrollable: side);
    expect(find.descendant(of: find.byKey(const ValueKey('count-/inventory')), matching: find.text('1')), findsOneWidget, reason: 'one medicine at or below its reorder level');
    expect(find.descendant(of: find.byKey(const ValueKey('count-/expiry')), matching: find.text('1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('bell')));
    await settle(tester, 4);
    expect(find.text('Urgent · 2'), findsOneWidget);
    expect(find.text("It's 31°C outside: keep medicines cool and check the room thermometer"), findsOneWidget);
    expect(find.text('1 item expired but still in stock'), findsOneWidget);
    expect(find.text('Needs attention · 1'), findsOneWidget);
    expect(find.text('1 item at or below reorder level'), findsOneWidget);
    expect(find.text('10:00 · Supplier visit'), findsOneWidget);
    expect(find.text('Sounds on this device'), findsOneWidget);
    await tester.tap(find.text('1 item expired but still in stock'));
    await settle(tester);
    expect(find.text('Expiring / Expired'), findsWidgets, reason: 'the alert opened its page');
    await done(tester);
  });

  testWidgets('Ctrl+K search: a medicine opens its stock card; a customer opens Customers with the name typed', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('customers', {'id': 'c7', 'name': 'Okello Test', 'phone': '0772000111'})));
    await start(tester);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await settle(tester, 4);
    expect(find.byKey(const Key('palette-input')), findsOneWidget);
    expect(find.text('Pages'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('palette-input')), 'calm');
    await settle(tester, 3);
    expect(find.text('Medicines'), findsOneWidget);
    expect(find.text('100 in stock · UGX 500'), findsOneWidget);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(find.text('Stock Card'), findsWidgets);
    expect(find.textContaining('Calmex 500mg Tabs'), findsWidgets);

    await tester.tap(find.byKey(const Key('search-trigger')));
    await settle(tester, 4);
    await tester.enterText(find.byKey(const Key('palette-input')), 'okello');
    await settle(tester, 3);
    await tester.tap(find.text('Okello Test'));
    await settle(tester);
    expect(find.text('0772000111'), findsWidgets, reason: 'Customers, filtered to the name');
    await done(tester);
  });

  testWidgets('offline: the clock says so and the banner keeps the cashier working; the branch pill', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(
      () => RecordStore(db).update((d) {
        d.put('branches', {'id': 'main', 'name': 'Kampala Road'});
        d.put('branches', {'id': 'b2', 'name': 'Ntinda'});
      }),
    );
    cloud.failOnRequest = 1;
    await start(tester);
    expect(find.byKey(const Key('branch-pill')), findsOneWidget);
    expect(find.text('Kampala Road'), findsWidgets);
    await tester.tap(find.byKey(const Key('clock-pill')));
    await settle(tester);
    expect(find.byKey(const Key('offline-banner')), findsOneWidget);
    expect(find.textContaining('No internet connection. Keep working'), findsOneWidget);
    expect(find.textContaining('Offline'), findsWidgets);
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.byKey(const Key('offline-banner')), findsNothing, reason: 'back online');
    await tester.tap(find.byKey(const Key('branch-pill')));
    await settle(tester);
    expect(find.text('Branches & transfers'), findsOneWidget);
    await done(tester);
  });

  Future<Map<String, Object?>> look() async {
    final r = await tester0!.runAsync(() => (db.select(db.kv)..where((x) => x.k.equals('device:look'))).getSingleOrNull());
    return r == null ? {} : (jsonDecode(r.v) as Map).cast<String, Object?>();
  }

  Brightness brightness(WidgetTester tester) => Theme.of(tester.element(find.byKey(const Key('theme-menu')))).brightness;

  Future<void> openThemes(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('theme-menu')));
    await settle(tester, 4);
  }

  testWidgets('theme menu: dark, a theme from the list, accent, Vivid tiles, a style, the system; Premium UI and back', (tester) async {
    tester0 = tester;
    await tester.runAsync(signedIn);
    await start(tester);
    expect(brightness(tester), Brightness.light);
    await openThemes(tester);
    await tester.tap(find.text('Dark'));
    await settle(tester, 4);
    expect((await look())['theme'], 'hybrid-dark');
    expect(brightness(tester), Brightness.dark);
    final list = find.byKey(const Key('theme-list'));
    await tester.scrollUntilVisible(find.byKey(const ValueKey('theme-dracula')), 120, scrollable: find.descendant(of: list, matching: find.byType(Scrollable)));
    await tester.ensureVisible(find.byKey(const ValueKey('theme-dracula')));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('theme-dracula')));
    await settle(tester, 4);
    expect((await look())['theme'], 'dracula');
    await openThemes(tester);
    await tester.tap(find.byKey(const ValueKey('accent-ocean')));
    await settle(tester, 3);
    expect((await look())['accent'], 'ocean');
    expect(Theme.of(tester.element(find.byKey(const Key('theme-menu')))).colorScheme.secondary, isNot(const Color(0xFFFF79C6)), reason: 'the ocean accent replaced Dracula\'s pink');
    await tester.scrollUntilVisible(find.byKey(const ValueKey('level-vivid')), 120, scrollable: find.descendant(of: list, matching: find.byType(Scrollable)));
    await tester.ensureVisible(find.byKey(const ValueKey('level-vivid')));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('level-vivid')));
    await settle(tester, 4);
    expect((await look())['level'], 'vivid');
    expect(Theme.of(tester.element(find.text("TODAY'S SALES"))).extension<LookLevel>()!.vivid, isTrue);
    expect(find.descendant(of: find.byType(StatCard).first, matching: find.byWidgetPredicate((w) => w is Ink && w.decoration is BoxDecoration && (w.decoration! as BoxDecoration).gradient != null)), findsOneWidget,
        reason: 'figure tiles are solid colour');
    await openThemes(tester);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('style-glass')), 120, scrollable: find.descendant(of: list, matching: find.byType(Scrollable)));
    await tester.ensureVisible(find.byKey(const ValueKey('style-glass')));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('style-glass')));
    await settle(tester, 4);
    expect((await look())['surface'], 'glass');
    await openThemes(tester);
    await tester.tap(find.text('System'));
    await settle(tester, 4);
    expect((await look())['mode'], 'system');
    Navigator.of(tester.element(find.text('Appearance'))).pop();
    await settle(tester, 3);

    // Premium UI: Midnight Pro, then back to the theme from before
    await tester.tap(find.byType(Switch).first);
    await settle(tester, 4);
    expect((await look())['theme'], 'midnight-pro');
    expect(brightness(tester), Brightness.dark);
    await tester.tap(find.byType(Switch).first);
    await settle(tester, 4);
    expect((await look())['theme'], 'dracula');
    await done(tester);
  });

  testWidgets('the owner limits the themes: only those are offered, no Premium switch without Midnight Pro; on a phone', (tester) async {
    tester0 = tester;
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('license', {'id': 'lic', 'branding': {'themes': ['light', 'nord']}})));
    await start(tester, size: const Size(400, 800));
    await openThemes(tester);
    expect(find.byKey(const ValueKey('theme-nord')), findsOneWidget);
    expect(find.byKey(const ValueKey('theme-dracula')), findsNothing);
    await tester.tap(find.text('Dark'));
    await settle(tester, 4);
    expect((await look())['theme'], 'nord', reason: 'the only dark theme allowed');
    await done(tester);
    await start(tester);
    expect(find.byType(Switch), findsNothing, reason: 'Midnight Pro is not among the allowed themes');
    await done(tester);
  });

  testWidgets('a broken screen: Something went wrong, then Reload RxPOS brings the app back', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester);
    final c = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
    c.read(appCrashProvider.notifier).crashed(StateError('A test break'));
    await settle(tester, 3);
    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.text('Bad state: A test break'), findsOneWidget);
    expect(find.text('Download my data'), findsOneWidget);
    final rescue = jsonDecode((await tester.runAsync(() => rescueJson(RecordStore(db))))!) as Map;
    expect(((rescue['products']! as List).first as Map)['name'], 'Calmex 500mg Tabs', reason: 'everything on this device');
    await tester.tap(find.text('Reload RxPOS'));
    await settle(tester);
    expect(find.text('Something went wrong'), findsNothing);
    expect(find.byKey(const Key('account-menu')), findsOneWidget);
    await done(tester);
  });

  testWidgets('the first download: Setting up the pharmacy on this device', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.saveSettings({'name': 'Sample Pharmacy'})));
    await start(tester, extra: [syncControllerProvider.overrideWith(_FirstSync.new)]);
    expect(find.text('Setting up Sample Pharmacy on this device…'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('first-download')), matching: find.text('Downloading products · 120 of 900')), findsOneWidget);
    await done(tester);
  });

  Future<void> engageStart(WidgetTester tester, {DateTime? at}) => start(tester, engage: true, extra: [
        if (at != null) engageClockProvider.overrideWithValue(() => at),
      ]);

  testWidgets('alerts pop up with a sound once a day; new messages pop up; the outside weather is logged every 6 hours', (tester) async {
    final day = today();
    sampleWeather['hourly'] = {
      'time': ['${day}T00:00', '${day}T06:00', '${day}T09:00'],
      'temperature_2m': [17.24, 19.96, 24],
      'relative_humidity_2m': [88.4, 80, 60],
    };
    (sampleWeather['current']! as Map)['time'] = '${day}T09:30';
    addTearDown(() => sampleWeather.remove('hourly'));
    await tester.runAsync(signedIn);
    await tester.runAsync(
      () => RecordStore(db).update((d) {
        d.put('batches', {'id': 'bx', 'productId': 'p1', 'batch': 'OLD', 'expiry': addDays(day, -3), 'cost': 300});
        d.move(productId: 'p1', qty: 4, type: 'Opening stock', batchId: 'bx');
      }),
    );
    await engageStart(tester, at: DateTime.parse('${day}T10:15:00'));
    await tester.pump(const Duration(seconds: 5));
    await settle(tester);
    expect(find.byKey(const ValueKey('popup-alerts')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('popup-alerts')), matching: find.text('1 item expired but still in stock')), findsOneWidget);
    expect(played, contains('alert'));
    final logged = (await tester.runAsync(() => RecordStore(db).rows('tempLogs')))!.where((r) => r['auto'] == true).toList()..sort((a, b) => '${a['at']}'.compareTo('${b['at']}'));
    expect([for (final r in logged) (r['id'], r['temp'], r['humidity'], r['place'], r['by'])], [
      ('wx-main-${day}T00', 17.2, 88, 'Outside', 'Automatic (weather)'),
      ('wx-main-${day}T06', 20.0, 80, 'Outside', 'Automatic (weather)'),
    ]);
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('popup-alerts')), matching: find.byTooltip('Close')));
    await settle(tester, 3);

    // a colleague writes
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('messages', {'id': 'm9', 'date': DateTime.now().toUtc().toIso8601String(), 'fromId': 'u2', 'fromName': 'Ben', 'conv': 'team', 'text': 'Delivery is here'})));
    await settle(tester);
    expect(find.text('Ben · General'), findsOneWidget);
    expect(find.text('Delivery is here'), findsOneWidget);
    await done(tester);

    // the same alert is not announced again today
    await engageStart(tester, at: DateTime.parse('${day}T10:20:00'));
    await tester.pump(const Duration(seconds: 5));
    await settle(tester);
    expect(find.byKey(const ValueKey('popup-alerts')), findsNothing);
    await done(tester);
  });

  testWidgets('the top of the hour: a chime with what needs doing, readings at 06/12/18, a greeting with the tip at 08, quiet at night', (tester) async {
    final day = today();
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.saveSettings({'name': 'Sample Pharmacy', 'phone': '0700 000000'})));
    await engageStart(tester, at: DateTime.parse('${day}T12:00:01'));
    EngageWatchersState w() => tester.state<EngageWatchersState>(find.byType(EngageWatchers));
    await tester.runAsync(() => w().fireHour());
    await settle(tester);
    expect(find.text("It's 12:00"), findsOneWidget);
    expect(find.text('Time to record the room and fridge temperature & humidity'), findsOneWidget);
    await done(tester);

    await engageStart(tester, at: DateTime.parse('${day}T08:00:01'));
    await tester.runAsync(() => w().fireHour());
    await settle(tester);
    expect(find.text('Good morning, Tia · 08:00'), findsOneWidget);
    expect(find.text('Share on WhatsApp'), findsOneWidget);
    final post = (await tester.runAsync(() => RecordStore(db).get('messages', 'auto-$day-8')))!;
    expect((post['fromName'], post['conv'], post['auto']), ('RxPOS', 'team', true));
    expect('${post['text']}', startsWith('Good morning from Sample Pharmacy!'));
    expect('${post['text']}', isNot(contains('Questions?')), reason: 'the team post leaves out the line for clients');
    await done(tester);

    await engageStart(tester, at: DateTime.parse('${day}T22:00:01'));
    await tester.runAsync(() => w().fireHour());
    await settle(tester);
    expect(find.text("It's 22:00"), findsNothing, reason: 'quiet hours');
    await done(tester);
  });

  testWidgets('Monday: last week at a glance, once; reorder levels updated automatically once a week', (tester) async {
    final lastWeek = weekStart(DateTime.now(), -1);
    final saleDay = DateTime(lastWeek.year, lastWeek.month, lastWeek.day + 2, 10);
    await tester.runAsync(signedIn);
    await tester.runAsync(() async {
      final store = RecordStore(db);
      await store.update((d) {
        for (var i = 0; i < 6; i++) {
          d.put('sales', {
            'id': 'sw$i', 'number': 'R-W$i', 'date': saleDay.subtract(Duration(days: i * 4)).toUtc().toIso8601String(), 'total': 5000, 'subtotal': 5000, 'cashier': 'Tia Admin', 'payment': 'Cash',
            'status': 'paid', 'items': [{'id': 'p1', 'name': 'Calmex 500mg Tabs', 'qty': 10, 'price': 500, 'cost': 300}],
          });
        }
        d.saveSettings({'name': 'Sample Pharmacy', 'updatedAt': '2026-10-01T00:00:00.000Z'});
      });
      final cfg = await SyncConfig.load(db);
      await cfg.copyWith(lastSync: DateTime.now().toUtc().toIso8601String()).save(db);
    });
    await engageStart(tester);
    await tester.pump(const Duration(seconds: 10));
    await settle(tester);
    expect(find.text('Last week at a glance'), findsOneWidget);
    expect(find.text('Full weekly report'), findsOneWidget);
    await tester.pump(const Duration(seconds: 11));
    await settle(tester, 20);
    final p1 = (await tester.runAsync(() => RecordStore(db).get('products', 'p1')))!;
    expect((p1['reorder'] as num) > 0, isTrue, reason: 'set from sales');
    final audit = (await tester.runAsync(() => RecordStore(db).rows('audit')))!;
    expect(audit.map((a) => a['action']), contains('Reorder levels updated automatically'));
    expect((await tester.runAsync(() => RecordStore(db).settingsRecord()))!['autoReorderAt'], isNotNull);
    await done(tester);
    await engageStart(tester);
    await tester.pump(const Duration(seconds: 10));
    await settle(tester);
    expect(find.text('Last week at a glance'), findsNothing, reason: 'once a week');
    await done(tester);
  });

  testWidgets('the idle screen: medicines worth recommending and health tips; never during a sale; a tap outside closes it', (tester) async {
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.saveSettings({'name': 'Sample Pharmacy', 'idleMinutes': 0.5})));
    await engageStart(tester);
    await tester.pump(const Duration(seconds: 31));
    await settle(tester);
    expect(find.byKey(const Key('spotlight')), findsOneWidget);
    expect(find.text('Calmex 500mg Tabs'), findsWidgets);
    expect(find.text('Share on WhatsApp'), findsOneWidget);
    await tester.tap(find.byTooltip('Next'));
    await settle(tester, 3);
    expect(find.textContaining('health tip'), findsWidgets, reason: 'tips are mixed in');
    await tester.tapAt(const Offset(200, 450)); // beside the card
    await settle(tester, 3);
    expect(find.byKey(const Key('spotlight')), findsNothing);

    // a sale on the till: no shop window
    await toTill(tester);
    await tester.tap(find.text('Calmex 500mg Tabs'));
    await settle(tester);
    await tester.pump(const Duration(seconds: 31));
    await settle(tester);
    expect(find.byKey(const Key('spotlight')), findsNothing);
    await done(tester);
  });

  testWidgets('the idle screen and the pop-ups on a phone fit the screen', (tester) async {
    final day = today();
    await tester.runAsync(signedIn);
    await tester.runAsync(() => RecordStore(db).update((d) => d.saveSettings({'name': 'Sample Pharmacy', 'idleMinutes': 0.5})));
    await start(tester, size: const Size(400, 800), engage: true, extra: [engageClockProvider.overrideWithValue(() => DateTime.parse('${day}T08:00:01'))]);
    await tester.runAsync(() => tester.state<EngageWatchersState>(find.byType(EngageWatchers)).fireHour());
    await settle(tester);
    expect(find.text('Share on WhatsApp'), findsOneWidget, reason: 'the greeting card');
    await tester.pump(const Duration(seconds: 31));
    await settle(tester);
    expect(find.byKey(const Key('spotlight')), findsOneWidget);
    await done(tester);
  });

  testWidgets('the live line: opened with a ticket; "changed" from another device syncs at once; F5 syncs and says so', (tester) async {
    await tester.runAsync(signedIn);
    cloud.api['live-ticket'] = (_) => (200, {'ticket': 't-123'});
    final line = StreamController<Object?>();
    Uri? opened;
    final sent = <String>[];
    await start(tester, live: true, extra: [
      liveConnectProvider.overrideWithValue((url, onSend) async {
        opened = url;
        onSend(sent.add);
        return line.stream;
      }),
    ]);
    await settle(tester);
    expect(opened.toString(), startsWith('wss://api.rxposug.com/api/live?ticket=t-123&device=dev-'), reason: 'the token never goes in the address');
    final before = cloud.requests.length;
    line.add('{"type":"changed"}');
    await settle(tester);
    expect(cloud.requests.length, greaterThan(before), reason: 'pulled at once');
    await tester.sendKeyEvent(LogicalKeyboardKey.f5);
    await settle(tester);
    expect(find.text('Up to date'), findsOneWidget);
    await navTo(tester, 'This device');
    await tester.scrollUntilVisible(find.byKey(const Key('live-state')), 200, scrollable: find.descendant(of: find.byType(PageFrame), matching: find.byType(Scrollable)).first);
    expect(find.textContaining('Live connection: on'), findsOneWidget);
    expect(find.text('RxPOS 1.0.0 (build 42)'), findsOneWidget);
    await line.close();
    await done(tester);
  });

  group('voice calls between staff', () {
    late StreamController<Object?> line;
    late List<Map<String, Object?>> sent;
    late List<_FakePeer> peers;
    var micRefused = false;

    Future<void> callStart(WidgetTester tester, {Size size = const Size(1440, 900)}) async {
      await tester.runAsync(signedIn);
      await tester.runAsync(() => RecordStore(db).update((d) => d.put('users', {'id': 'u2', 'name': 'Ben Okello', 'role': 'pharmacist', 'phone': '0772 123456'})));
      line = StreamController<Object?>();
      sent = [];
      peers = [];
      micRefused = false;
      await start(tester, size: size, live: true, calls: true, extra: [
        liveConnectProvider.overrideWithValue((url, onSend) async {
          onSend((m) {
            if (m != 'ping') sent.add((jsonDecode(m) as Map).cast<String, Object?>());
          });
          return line.stream;
        }),
        rtcPeerFactoryProvider.overrideWithValue((ice) async {
          if (micRefused) throw const MicrophoneRefused();
          return peers.addAndReturn(_FakePeer());
        }),
      ]);
    }

    List<String> kinds() => [for (final m in sent) '${m['kind']}'];
    void hear(String kind, String callId, [Map<String, Object?>? data]) => line.add(jsonEncode({
          'type': 'rtc', 'kind': kind, 'call_id': callId, 'from_uid': 'u2', 'from_name': 'Ben Okello', 'data': data, 'at': DateTime.now().millisecondsSinceEpoch,
        }));

    Future<void> openBen(WidgetTester tester) async {
      await navTo(tester, 'Chat & Messages');
      await tester.tap(find.byKey(const ValueKey('conv-dm:u1:u2')));
      await settle(tester);
    }

    Future<void> callBen(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('call-u2')).last);
      await settle(tester, 8);
      await tester.tap(find.text('In-app call'));
      await settle(tester);
    }

    testWidgets('calling a colleague from Chat: ring, answer, talk, hang up; the call is noted in the private chat', (tester) async {
      await callStart(tester);
      await openBen(tester);
      await tester.tap(find.byKey(const Key('call-u2')).last);
      await settle(tester, 8);
      expect(find.text('WhatsApp'), findsOneWidget);
      expect(find.text('Phone call'), findsOneWidget);
      await tester.tap(find.text('In-app call'));
      await settle(tester);
      expect(kinds(), ['ring', 'offer']);
      expect(sent.first['to'], 'u2');
      expect(sent[1]['data'], {'type': 'offer', 'sdp': 'fake-offer'});
      final id = '${sent.first['callId']}';
      expect(find.byKey(const Key('call-screen')), findsOneWidget);
      expect(find.text('Ben Okello'), findsWidgets);
      expect(find.text('Ringing…'), findsOneWidget);
      expect(played, contains('ringback'));
      hear('answer', id, {'type': 'answer', 'sdp': 'their-answer'});
      await settle(tester);
      expect(peers.single.remote, {'type': 'answer', 'sdp': 'their-answer'});
      expect(find.text('Connecting…'), findsOneWidget);
      peers.single.state.add('connected');
      await settle(tester);
      expect(find.text('0:00'), findsOneWidget);
      await tester.tap(find.byKey(const Key('call-Mute')));
      await settle(tester, 2);
      expect(peers.single.muted, isTrue);
      expect(find.byKey(const Key('call-Unmute')), findsOneWidget);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1100)));
      await tester.tap(find.byKey(const Key('call-Hang up')));
      await settle(tester);
      expect(kinds().last, 'hangup');
      expect(peers.single.closed, isTrue);
      expect(find.textContaining('Call ended · 0:0'), findsOneWidget);
      await until(tester, () async => (await RecordStore(db).get('messages', 'call-$id')) != null);
      final log = (await tester.runAsync(() => RecordStore(db).get('messages', 'call-$id')))!;
      expect(log['conv'], 'dm:u1:u2');
      expect(log['fromId'], 'u1');
      expect(log['channel'], 'team');
      expect((log['call'] as Map)['status'], 'done');
      expect((log['call'] as Map)['secs'], greaterThanOrEqualTo(1));
      await tester.pump(const Duration(seconds: 2));
      await settle(tester);
      expect(find.byKey(const Key('call-screen')), findsNothing);
      expect(find.textContaining('Voice call · 0:0'), findsWidgets); // the note, and the chat list's preview
      expect(find.text('Call back'), findsOneWidget);
      await line.close();
      await done(tester);
    });

    testWidgets('a colleague who doesn\'t pick up: "No answer" after 45 s, noted as a missed call', (tester) async {
      await callStart(tester);
      await openBen(tester);
      await callBen(tester);
      final id = '${sent.first['callId']}';
      await tester.pump(const Duration(seconds: 46));
      await settle(tester, 4);
      expect(kinds().last, 'hangup');
      expect(find.text("Ben Okello didn't pick up"), findsOneWidget);
      await until(tester, () async => (await RecordStore(db).get('messages', 'call-$id')) != null);
      final log = (await tester.runAsync(() => RecordStore(db).get('messages', 'call-$id')))!;
      expect(log['call'], {'status': 'no answer', 'secs': 0});
      await tester.pump(const Duration(seconds: 2));
      await settle(tester);
      expect(find.text('You called · no answer'), findsOneWidget);
      await line.close();
      await done(tester);
    });

    testWidgets('an incoming call: rings, answered, a second caller hears "busy", hung up by the colleague', (tester) async {
      await callStart(tester);
      hear('ring', 'c1');
      await settle(tester);
      expect(find.text('Incoming call'), findsOneWidget);
      expect(played, contains('ring'));
      expect(osNotify.shown, isEmpty, reason: 'RxPOS is on screen');
      await tester.tap(find.byKey(const Key('call-Answer')));
      await settle(tester);
      expect(find.text('Connecting…'), findsOneWidget);
      expect(peers, isEmpty, reason: 'answered before the details arrived: waits for them');
      hear('offer', 'c1', {'type': 'offer', 'sdp': 'their-offer'});
      await settle(tester);
      expect(peers.single.remote, {'type': 'offer', 'sdp': 'their-offer'});
      expect(kinds(), ['answer']);
      expect(sent.single['data'], {'type': 'answer', 'sdp': 'fake-answer'});
      hear('ice', 'c1', {'candidate': 'candidate:1', 'sdpMid': '0', 'sdpMLineIndex': 0});
      peers.single.state.add('connected');
      await settle(tester);
      expect(peers.single.ice, hasLength(1));
      expect(find.text('0:00'), findsOneWidget);
      line.add(jsonEncode({'type': 'rtc', 'kind': 'ring', 'call_id': 'c2', 'from_uid': 'u3', 'from_name': 'Joy', 'at': DateTime.now().millisecondsSinceEpoch}));
      await settle(tester);
      expect(sent.last['kind'], 'busy');
      expect(sent.last['to'], 'u3');
      hear('hangup', 'c1');
      await settle(tester);
      expect(find.text('Call ended'), findsOneWidget);
      expect(await tester.runAsync(() => RecordStore(db).get('messages', 'call-c1')), isNull, reason: 'the caller writes the note, not this device');
      await tester.pump(const Duration(seconds: 2));
      await settle(tester, 4);
      expect(find.byKey(const Key('call-screen')), findsNothing);
      await line.close();
      await done(tester);
    });

    testWidgets('declining an incoming call; a call nobody answers here is "Missed call" after 46 s', (tester) async {
      await callStart(tester, size: const Size(400, 800));
      hear('ring', 'c1');
      await settle(tester);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byKey(const Key('call-Decline')));
      await settle(tester);
      expect(kinds(), ['decline']);
      expect(find.text('Busy right now'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      hear('ring', 'c3');
      await settle(tester);
      expect(find.text('Incoming call'), findsOneWidget);
      await tester.pump(const Duration(seconds: 45));
      expect(find.text('Incoming call'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 1500));
      expect(find.text('Missed call'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await line.close();
      await done(tester);
    });

    testWidgets('the microphone not allowed: says so, no call', (tester) async {
      await callStart(tester);
      await openBen(tester);
      micRefused = true;
      await callBen(tester);
      expect(find.text('Allow the microphone to make calls'), findsOneWidget);
      expect(find.text('Call failed'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await settle(tester);
      expect(find.byKey(const Key('call-screen')), findsNothing);
      await line.close();
      await done(tester);
    });
  });

  group('app updates from the cloud', () {
    late Directory folder;
    late List<(String, String)> installs;
    late DateTime now;
    late List<int> served;
    late Map<String, Object?> manifest;

    Future<void> updStart(WidgetTester tester, String platform, {int build = 50, bool damaged = false, String? abi, bool abiApk = false}) async {
      await tester.runAsync(signedIn);
      folder = (await tester.runAsync(() => Directory.systemTemp.createTemp('rxpos-upd')))!;
      addTearDown(() => folder.delete(recursive: true));
      installs = [];
      now = DateTime(2026, 11, 6, 10);
      served = List.generate(5000, (i) => i % 251);
      final ext = platform == 'windows' ? 'exe' : 'apk';
      manifest = {'build': 51, 'label': '2.0.51', 'file': 'RxPOS-New-51.$ext', 'size': served.length, 'sha256': '${sha256.convert(served)}'};
      cloud.api['app/flutter-$platform.json'] = (_) => (200, manifest);
      if (abiApk) {
        manifest = {...manifest, 'file': 'RxPOS-New-51-$abi.apk'};
        cloud.api['app/flutter-android-$abi.json'] = (_) => (200, manifest);
      }
      await start(tester, extra: [
        updatePlatformProvider.overrideWithValue(platform),
        androidAbiProvider.overrideWithValue(abi),
        currentBuildProvider.overrideWith((_) async => build),
        updateFolderProvider.overrideWithValue(() async => folder.path),
        updateClockProvider.overrideWithValue(() => now),
        updateDownloadProvider.overrideWithValue((url, path, progress) async {
          expect(url, 'https://api.rxposug.com/api/app/${manifest['file']}');
          await File(path).writeAsBytes(damaged ? served.reversed.toList() : served);
          progress(1);
        }),
        updateInstallProvider.overrideWithValue((platform, path) async => installs.add((platform, path))),
      ]);
    }

    Future<void> firstCheck(WidgetTester tester) async {
      await tester.pump(const Duration(seconds: 21));
      await settle(tester);
      await settle(tester);
    }

    testWidgets('Windows: a newer build is downloaded, checked, and installed by itself once nothing is in progress', (tester) async {
      await updStart(tester, 'windows');
      expect(find.byKey(const Key('update-pill')), findsNothing);
      await firstCheck(tester);
      expect(cloud.calls.map((c) => c.$1), contains('app/flutter-windows.json'));
      expect(find.byKey(const Key('update-pill')), findsOneWidget);
      expect(find.text('New version · Update'), findsOneWidget);
      await tester.pump(const Duration(seconds: 16));
      expect(installs, isEmpty, reason: 'someone was using it a moment ago');
      now = now.add(const Duration(seconds: 91));
      await tester.pump(const Duration(seconds: 16));
      await settle(tester);
      expect(installs, [('windows', '${folder.path}${Platform.pathSeparator}RxPOS-New-51.exe')]);
      expect(await tester.runAsync(() => db.select(db.kv).get().then((r) => r.firstWhere((k) => k.k == 'device:updatedFrom').v)), '50');
      await done(tester);
    });

    testWidgets('Android: ready to install; the system installer opens only when Update is tapped', (tester) async {
      await updStart(tester, 'android');
      await firstCheck(tester);
      now = now.add(const Duration(minutes: 5));
      await tester.pump(const Duration(seconds: 30));
      expect(installs, isEmpty);
      await tester.tap(find.byKey(const Key('update-pill')));
      await settle(tester);
      expect(installs.single.$1, 'android');
      expect(installs.single.$2, endsWith('RxPOS-New-51.apk'));
      await done(tester);
    });

    testWidgets('Android: a phone takes the smaller APK made for its processor, or the one for all when there is none', (tester) async {
      await updStart(tester, 'android', abi: 'arm64', abiApk: true);
      await firstCheck(tester);
      expect(cloud.calls.map((c) => c.$1), contains('app/flutter-android-arm64.json'));
      await tester.tap(find.byKey(const Key('update-pill')));
      await settle(tester);
      expect(installs.single.$2, endsWith('RxPOS-New-51-arm64.apk'));
      await done(tester);
    });

    testWidgets('Android: without a version file for its processor, the APK for all processors is taken', (tester) async {
      await updStart(tester, 'android', abi: 'armv7');
      await firstCheck(tester);
      expect(cloud.calls.map((c) => c.$1), containsAll(['app/flutter-android-armv7.json', 'app/flutter-android.json']));
      await tester.tap(find.byKey(const Key('update-pill')));
      await settle(tester);
      expect(installs.single.$2, endsWith('RxPOS-New-51.apk'));
      await done(tester);
    });

    testWidgets('a damaged download is thrown away and never installed; This device says so and checks again', (tester) async {
      await updStart(tester, 'windows', damaged: true);
      await firstCheck(tester);
      expect(find.byKey(const Key('update-pill')), findsNothing);
      expect(await tester.runAsync(() => File('${folder.path}${Platform.pathSeparator}RxPOS-New-51.exe').exists()), isFalse);
      await navTo(tester, 'This device');
      await tester.scrollUntilVisible(find.byKey(const Key('update-state')), 200, scrollable: find.descendant(of: find.byType(PageFrame), matching: find.byType(Scrollable)).first);
      expect(find.text('The download was damaged. It will try again by itself.'), findsOneWidget);
      expect(installs, isEmpty);
      await done(tester);
    });

    testWidgets('already the newest build: "Up to date"; after an update, "RxPOS updated" once', (tester) async {
      await tester.runAsync(() => db.into(db.kv).insert(KvCompanion.insert(k: 'device:updatedFrom', v: '50')));
      await updStart(tester, 'windows', build: 51);
      expect(find.text('RxPOS updated (2.0.51)'), findsOneWidget);
      await firstCheck(tester);
      await navTo(tester, 'This device');
      await tester.scrollUntilVisible(find.byKey(const Key('update-state')), 200, scrollable: find.descendant(of: find.byType(PageFrame), matching: find.byType(Scrollable)).first);
      expect(find.text('Up to date. New versions are fetched by themselves.'), findsOneWidget);
      expect(find.byKey(const Key('update-pill')), findsNothing);
      await done(tester);
    });
  });

  group('parity with the React app (from the similarity index)', () {
    Future<void> confirmDelete(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('record-delete')));
      await settle(tester, 8);
      await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
      await settle(tester);
    }

    testWidgets('medicines, formulations, prescriptions, expense categories and loans can be deleted', (tester) async {
      await tester.runAsync(signedIn);
      await tester.runAsync(() => RecordStore(db).update((d) {
            d.put('formulations', {'id': 'f-gel', 'name': 'Gel'});
            d.put('prescriptions', {'id': 'rx1', 'customerId': 'walk-in', 'date': '2026-11-01', 'medications': 'Calmex 1x3', 'status': 'Pending', 'refillsAllowed': 0});
            d.put('expenseCategories', {'id': 'ec1', 'name': 'Fuel'});
            d.put('loans', {'id': 'l1', 'lender': 'Sample Bank', 'date': '2026-10-01', 'amount': 100000, 'interestRate': 0});
          }));
      await start(tester);
      final store = RecordStore(db);
      Future<bool> gone(String t, String id) async => (await tester.runAsync(() => store.get(t, id))) == null;

      await navTo(tester, 'Medicine List');
      await tester.tap(find.text('Zinco Syrup 100ml'));
      await settle(tester);
      await confirmDelete(tester);
      expect(await gone('products', 'p2'), isTrue);
      expect(find.text('Medicine deleted'), findsOneWidget);
      final audit = (await tester.runAsync(() => store.rows('audit')))!;
      expect(audit.any((a) => a['action'] == 'Medicine deleted' && a['details'] == 'Zinco Syrup 100ml'), isTrue);

      await navTo(tester, 'Formulations');
      await tester.tap(find.text('Gel'));
      await settle(tester);
      await confirmDelete(tester);
      expect(await gone('formulations', 'f-gel'), isTrue);

      await navTo(tester, 'Prescriptions & Refills');
      await tester.tap(find.textContaining('Calmex 1x3').first);
      await settle(tester);
      await confirmDelete(tester);
      expect(await gone('prescriptions', 'rx1'), isTrue);

      await navTo(tester, 'Finance');
      await tester.tap(find.text('Expense Categories'));
      await settle(tester);
      await tester.tap(find.text('Fuel'));
      await settle(tester);
      await confirmDelete(tester);
      expect(await gone('expenseCategories', 'ec1'), isTrue);
      await tester.tap(find.text('Loans'));
      await settle(tester);
      await tester.tap(find.textContaining('Sample Bank'));
      await settle(tester);
      await confirmDelete(tester);
      expect(await gone('loans', 'l1'), isTrue);
      await done(tester);
    });

    testWidgets('a client has the React app\'s fields (email, address, birth date, type, insurance, credit limit); a supplier its TIN', (tester) async {
      await tester.runAsync(signedIn);
      await start(tester);
      await navTo(tester, 'Customers');
      await tester.tap(find.text('Add client'));
      await settle(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Full name / company'), 'Amina Test');
      await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'amina@test.rx');
      await tester.enterText(find.widgetWithText(TextFormField, 'Address'), 'Plot 1, Sample Road');
      await tester.enterText(find.widgetWithText(TextFormField, 'Date of birth'), '1990-04-02');
      await tester.enterText(find.widgetWithText(TextFormField, 'Insurance / HMO'), 'Sample Health');
      await tester.enterText(find.widgetWithText(TextFormField, 'Policy number'), 'SH-001');
      await tester.enterText(find.widgetWithText(TextFormField, 'Credit limit'), '50000');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await settle(tester);
      final c = (await tester.runAsync(() => RecordStore(db).rows('customers')))!.firstWhere((x) => x['name'] == 'Amina Test');
      expect((c['email'], c['address'], c['dob'], c['insurance'], c['insuranceNo'], c['creditLimit']), ('amina@test.rx', 'Plot 1, Sample Road', '1990-04-02', 'Sample Health', 'SH-001', 50000));
      await navTo(tester, 'Suppliers');
      await tester.tap(find.text('Add supplier'));
      await settle(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Company name'), 'Sample Pharma Ltd');
      await tester.enterText(find.widgetWithText(TextFormField, 'TIN / tax number'), '1000123456');
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await settle(tester);
      final sup = (await tester.runAsync(() => RecordStore(db).rows('suppliers')))!.firstWhere((x) => x['name'] == 'Sample Pharma Ltd');
      expect(sup['tin'], '1000123456');
      await done(tester);
    });

    testWidgets('the till keyboard: Alt+↑/↓ chooses a line, + / − / Delete change it, Alt+2 the method, F10 a proforma, Alt+R the last receipt', (tester) async {
      await tester.runAsync(signedIn);
      await tester.runAsync(() => RecordStore(db).update((d) {
            d.put('batches', {'id': 'b2', 'productId': 'p2', 'batch': 'Z1', 'expiry': '2029-01-31', 'cost': 4000});
            d.move(productId: 'p2', qty: 10, type: 'Opening stock', batchId: 'b2');
          }));
      await start(tester);
      await toTill(tester);
      final container = ProviderScope.containerOf(tester.element(find.byType(PosScreen)));
      SaleState sale() => container.read(saleControllerProvider(false));
      Future<void> alt(LogicalKeyboardKey k) async {
        await tester.sendKeyDownEvent(LogicalKeyboardKey.altLeft);
        await tester.sendKeyEvent(k);
        await tester.sendKeyUpEvent(LogicalKeyboardKey.altLeft);
        await settle(tester, 2);
      }

      await alt(LogicalKeyboardKey.keyR);
      expect(find.text('No sale at this branch yet'), findsOneWidget);
      await tester.tap(find.text('Calmex 500mg Tabs'));
      await settle(tester, 4);
      await tester.tap(find.text('Zinco Syrup 100ml'));
      await settle(tester, 4);
      await alt(LogicalKeyboardKey.arrowUp);
      expect(sale().cursor, 0, reason: 'from the last line up to Calmex');
      expect(find.byKey(const Key('line-chosen')), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.numpadAdd);
      await tester.sendKeyEvent(LogicalKeyboardKey.numpadAdd);
      await settle(tester, 2);
      expect(sale().lines.first.count, 3);
      await tester.sendKeyEvent(LogicalKeyboardKey.numpadSubtract);
      await settle(tester, 2);
      expect(sale().lines.first.count, 2);
      await alt(LogicalKeyboardKey.digit2);
      expect(sale().method?.name, 'Mobile Money');
      await tester.sendKeyEvent(LogicalKeyboardKey.delete);
      await settle(tester, 2);
      expect(sale().lines.map((l) => l.name), ['Zinco Syrup 100ml']);
      await tester.sendKeyEvent(LogicalKeyboardKey.f10);
      await settle(tester);
      expect(find.textContaining('saved (see Proformas)'), findsOneWidget);
      expect((await tester.runAsync(() => RecordStore(db).rows('proformas')))!, hasLength(1));
      await alt(LogicalKeyboardKey.digit1);
      expect(sale().method?.name, 'Cash');
      if (sale().lines.isEmpty) {
        await tester.tap(find.text('Calmex 500mg Tabs'));
        await settle(tester, 4);
      }
      await tester.sendKeyEvent(LogicalKeyboardKey.f9);
      await settle(tester);
      await tester.tap(find.text('New sale'));
      await settle(tester);
      await alt(LogicalKeyboardKey.keyR);
      await settle(tester);
      expect(find.text('New sale'), findsOneWidget, reason: 'the receipt again');
      await done(tester);
    });

    testWidgets('a first-visit tip on the till, gone for good after "Got it"', (tester) async {
      await tester.runAsync(signedIn);
      await start(tester, tips: true);
      await toTill(tester);
      expect(find.text('Selling quickly'), findsOneWidget);
      await tester.tap(find.text('Got it'));
      await settle(tester);
      expect(find.text('Selling quickly'), findsNothing);
      await done(tester);
      await start(tester, tips: true);
      await toTill(tester);
      expect(find.text('Selling quickly'), findsNothing, reason: 'remembered on this device');
      await done(tester);
    });
  });

  // Screenshots of the real screens with real fonts, for reviewing the look (not part of the normal run):
  //   flutter test test/widgets/app_flow_test.dart --plain-name screenshots --dart-define=SCREENS=true --update-goldens
  // The images land in test/widgets/screens/ (ignored by git).
  group('screenshots', () {
    const on = bool.fromEnvironment('SCREENS');
    setUpAll(() async {
      if (!on) return;
      final fonts = '${Platform.environment['FLUTTER_ROOT'] ?? '/root/flutter'}/bin/cache/artifacts/material_fonts';
      final roboto = FontLoader('Roboto');
      for (final w in ['Regular', 'Medium', 'Bold', 'Black', 'Light']) {
        roboto.addFont(File('$fonts/Roboto-$w.ttf').readAsBytes().then(ByteData.sublistView));
      }
      await roboto.load();
      await (FontLoader('MaterialIcons')..addFont(File('$fonts/MaterialIcons-Regular.otf').readAsBytes().then(ByteData.sublistView))).load();
    });

    Future<void> look(String theme) => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: 'device:look', v: '{"theme":"$theme"}'));

    Future<void> shot(WidgetTester tester, String name) async {
      noSnackBars(tester);
      await settle(tester, 6);
      await expectLater(find.byType(MaterialApp).first, matchesGoldenFile('screens/$name.png'));
    }

    testWidgets('screens of the ten design systems', (tester) async {
      await tester.runAsync(signedIn);
      for (final d in designSystems) {
        await tester.runAsync(() => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: 'device:look', v: '{"v":2,"design":"${d.id}","theme":"${d.palette}","surface":"${d.surface}","level":"${d.vivid ? 'vivid' : 'calm'}"}')));
        await start(tester);
        await shot(tester, 'design-${d.id}-dashboard');
        await toTill(tester);
        await tester.tap(find.text('Calmex 500mg Tabs').first);
        await settle(tester, 4);
        await shot(tester, 'design-${d.id}-pos');
        await done(tester);
      }
      // a phone and a 10" tablet in portrait with Target Tap
      for (final (size, tag) in [(const Size(412, 900), 'phone'), (const Size(800, 1280), 'tablet')]) {
        await tester.runAsync(() => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: 'device:look', v: '{"v":2,"design":"target-tap","theme":"target-tap","surface":"flat"}')));
        await start(tester, size: size);
        await toTill(tester);
        await shot(tester, 'design-target-tap-$tag-pos');
        await done(tester);
      }
      // the showcase designs on a phone: Travel Orange with its bottom bar, Lavender Dream
      for (final d in ['travel', 'lavender', 'studio']) {
        final ds = designSystems.firstWhere((x) => x.id == d);
        await tester.runAsync(() => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: 'device:look', v: '{"v":2,"design":"$d","theme":"${ds.palette}","surface":"${ds.surface}","level":"${ds.vivid ? 'vivid' : 'calm'}"}')));
        await start(tester, size: const Size(412, 900));
        await shot(tester, 'design-$d-phone-dashboard');
        await done(tester);
      }
    }, skip: !on);

    for (final (theme, tag) in [('hybrid-light', 'light'), ('hybrid-dark', 'dark')]) {
      testWidgets('screens on a computer, $tag', (tester) async {
        await tester.runAsync(signedIn);
        await tester.runAsync(() => look(theme));
        await start(tester, foldedNav: tag == 'light'); // light: the sidebar as it first opens (groups folded)
        await shot(tester, '$tag-01-dashboard');
        if (tag == 'light') {
          // open the folded groups again, so the pages below can be found by name
          await tester.runAsync(() => db.into(db.kv).insertOnConflictUpdate(KvCompanion.insert(k: 'device:navCollapsed', v: '{}')));
          await done(tester);
          await start(tester);
        }
        await toTill(tester);
        await tester.tap(find.text('Calmex 500mg Tabs'));
        await settle(tester, 4);
        await shot(tester, '$tag-02-pos');
        for (final (i, screen) in ['Medicine List', 'Add Stock', 'Sales History', 'Reports', 'Customers', 'Finance', 'Settings', 'This device', 'Chat & Messages'].indexed) {
          await navTo(tester, screen);
          await shot(tester, '$tag-${(i + 3).toString().padLeft(2, '0')}-${screen.toLowerCase().replaceAll(RegExp(r'[^a-z]+'), '-')}');
        }
        await navTo(tester, 'Medicine List');
        await tester.tap(find.text('Add medicine'));
        await settle(tester);
        await shot(tester, '$tag-20-dialog');
        await done(tester);
      }, skip: !on);
    }

    testWidgets('screens on a phone', (tester) async {
      await tester.runAsync(signedIn);
      await tester.runAsync(() => look('hybrid-light'));
      await start(tester, size: const Size(400, 860));
      await shot(tester, 'phone-01-dashboard');
      await tester.tap(find.byTooltip('Open navigation menu'));
      await settle(tester);
      await shot(tester, 'phone-02-menu');
      await tester.tap(find.text('POS – Retail'));
      await settle(tester);
      await tester.tap(find.text('Calmex 500mg Tabs'));
      await settle(tester, 4);
      await shot(tester, 'phone-03-pos');
      await done(tester);
      // a small phone with the largest common system text size: nothing cut off or overflowing
      tester.platformDispatcher.textScaleFactorTestValue = 1.5;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await start(tester, size: const Size(375, 812));
      await shot(tester, 'phone-04-large-text-dashboard');
      await tester.tap(find.byTooltip('Open navigation menu'));
      await settle(tester);
      await tester.tap(find.text('POS – Retail'));
      await settle(tester);
      await tester.tap(find.text('Calmex 500mg Tabs'));
      await settle(tester, 4);
      await shot(tester, 'phone-05-large-text-pos');
      await tester.tap(find.text('1 item'));
      await settle(tester);
      await shot(tester, 'phone-06-large-text-sale');
      await done(tester);
    }, skip: !on);

    testWidgets('sign-in screen', (tester) async {
      await tester.runAsync(() => look('hybrid-light'));
      await start(tester);
      await shot(tester, 'signin-desktop');
      await done(tester);
      await start(tester, size: const Size(400, 860));
      await shot(tester, 'signin-phone');
      await done(tester);
    }, skip: !on);
  });

  testWidgets('sidebar groups fold away and stay so on this device; the page you are on and pages with a count still show', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, foldedNav: true);
    final sidebar = find.byKey(const Key('sidebar'));
    Finder item(String label) => find.descendant(of: sidebar, matching: find.text(label));
    // as the React app: at first only Sales is open
    expect(item('POS – Retail'), findsOneWidget);
    expect(item('Customers'), findsNothing);
    expect(item('Settings'), findsNothing);
    final people = find.byKey(const ValueKey('nav-group-People'));
    expect(tester.getSemantics(people).flagsCollection.isExpanded, Tristate.isFalse);
    await tester.tap(people);
    await settle(tester);
    expect(item('Customers'), findsOneWidget);
    expect(tester.getSemantics(people).flagsCollection.isExpanded, Tristate.isTrue);
    await tester.tap(item('Customers'));
    await settle(tester);
    await tester.tap(people);
    await settle(tester);
    expect(item('Customers'), findsOneWidget, reason: 'the page you are on stays in a folded group');
    expect(item('Suppliers'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('nav-group-Sales')));
    await settle(tester);
    expect(item('POS – Retail'), findsNothing);
    final saved = (await tester.runAsync(() => db.select(db.kv).get()))!.firstWhere((k) => k.k == 'device:navCollapsed').v;
    expect(jsonDecode(saved), containsPair('Sales', true));
    await done(tester);
    await start(tester, foldedNav: true);
    expect(item('POS – Retail'), findsNothing, reason: 'remembered on this device');
    expect(item('Dashboard'), findsOneWidget, reason: 'the page you are on');
    await done(tester);
  });

  testWidgets('weather from the device GPS when allowed: named from the connection\'s city', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, extra: [gpsPositionProvider.overrideWithValue(() async => (lat: 0.336712, lon: 32.571903))]);
    await navTo(tester, 'Weather & Storage');
    expect(find.text('Near Kampala · GPS'), findsOneWidget);
    expect(weatherCalls.last, contains('latitude=0.3367&longitude=32.5719'));
    await done(tester);
  });

  testWidgets('in the background: a new message is also a system notification with the unread count; on screen it is not', (tester) async {
    await tester.runAsync(signedIn);
    await start(tester, engage: true, foreground: false);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('messages', {'id': 'm7', 'date': DateTime.now().toUtc().toIso8601String(), 'fromId': 'u2', 'fromName': 'Ben', 'conv': 'team', 'text': 'Delivery is here'})));
    await settle(tester);
    expect(osNotify.shown.map((n) => (n.title, n.body, n.count)), [('Ben · General', 'Delivery is here', 1)]);
    await done(tester);
    osNotify.reset();
    await start(tester, engage: true);
    await tester.runAsync(() => RecordStore(db).update((d) => d.put('messages', {'id': 'm8', 'date': DateTime.now().toUtc().toIso8601String(), 'fromId': 'u2', 'fromName': 'Ben', 'conv': 'team', 'text': 'And the invoice'})));
    await settle(tester);
    expect(osNotify.shown, isEmpty, reason: 'RxPOS is on screen: the pop-up is enough');
    await done(tester);
  });

  testWidgets('This device: allow notifications; the unread count on the icon can be switched off', (tester) async {
    osNotify.perm = 'default';
    await tester.runAsync(signedIn);
    await start(tester);
    await navTo(tester, 'This device');
    await tester.ensureVisible(find.byKey(const Key('notify-allow')));
    await settle(tester, 2);
    await tester.tap(find.byKey(const Key('notify-allow')));
    await settle(tester);
    expect(find.text('Notifications are allowed'), findsOneWidget);
    expect(osNotify.asked, 1);
    await done(tester);
  });
  group('shelves, drug classes and stock corrections', () {
    testWidgets('a whole therapeutic area goes on a shelf; the shelf shows on the till', (tester) async {
      await tester.runAsync(signedIn);
      await start(tester);
      await navTo(tester, 'Shelves');
      await tester.tap(find.byKey(const Key('medicine-order')));
      await settle(tester);
      await tester.tap(find.text('Therapeutic area').last);
      await settle(tester);
      // Zinco (zinc) is under vitamins and minerals; Calmex is not a known generic: Other
      expect(find.byKey(const Key('group-Vitamins, minerals & nutrition')), findsOneWidget);
      expect(find.byKey(const Key('group-Other')), findsOneWidget);
      await tester.tap(find.byKey(const Key('shelf-group-Vitamins, minerals & nutrition')));
      await settle(tester);
      await tester.enterText(find.byKey(const Key('shelf-name')), 'B2');
      await tester.tap(find.text('Put on shelf'));
      await settle(tester);
      expect(find.text('1 put on shelf B2'), findsOneWidget);
      final store = RecordStore(db);
      expect((await tester.runAsync(() => store.get('products', 'p2')))!['shelf'], 'B2');
      final audit = (await tester.runAsync(() => store.rows('audit')))!;
      expect(audit.last['details'], 'Vitamins, minerals & nutrition → shelf B2');
      // tick Calmex and put it on the shelf already in use
      await tester.tap(find.byKey(const Key('shelf-med-p1')));
      await settle(tester);
      await tester.tap(find.byKey(const Key('shelf-put')));
      await settle(tester);
      await tester.tap(find.widgetWithText(ActionChip, 'B2'));
      await settle(tester);
      expect((await tester.runAsync(() => store.get('products', 'p1')))!['shelf'], 'B2');
      expect(find.byKey(const Key('shelf-B2')), findsOneWidget);
      await toTill(tester);
      expect(find.textContaining('B2', findRichText: true), findsWidgets);
      await done(tester);
    });

    testWidgets('the till: the sale panel is widened by dragging, the payment area folds away; the menu folds to icons', (tester) async {
      await tester.runAsync(signedIn);
      await start(tester);
      await toTill(tester);
      Future<String?> kv(String k) async => (await tester.runAsync(() => db.select(db.kv).get()))!.where((r) => r.k == 'device:$k').firstOrNull?.v;
      final handle = find.byKey(const Key('split-pos-sale-w'));
      final x0 = tester.getCenter(handle).dx;
      await tester.drag(handle, const Offset(-120, 0));
      await settle(tester);
      final moved = x0 - tester.getCenter(handle).dx;
      expect(moved, greaterThan(80), reason: 'dragged left (less the touch slop)');
      expect(await kv('pos-sale-w'), '${(460 + moved).round()}');
      // double-click: the standard width again
      await tester.tap(handle);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(handle);
      await settle(tester);
      expect(await kv('pos-sale-w'), isNull);
      // the payment area folds to the total and Charge
      await tester.tap(find.text('Calmex 500mg Tabs'));
      await settle(tester);
      expect(find.text('Amount tendered'), findsOneWidget);
      await tester.tap(find.byKey(const Key('fold-pos-pay-h')));
      await settle(tester);
      expect(find.text('Amount tendered'), findsNothing);
      expect(find.textContaining('Charge'), findsOneWidget);
      expect(await kv('pos-pay-h-fold'), '1');
      // the menu folds to a rail of icons
      await tester.tap(find.byKey(const Key('sidebar-toggle')));
      await settle(tester);
      expect(find.byKey(const ValueKey('rail-/sales')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('rail-/sales')));
      await settle(tester);
      expect(find.text('Sales History'), findsWidgets);
      expect(await kv('navRail'), '1');
      await done(tester);
    });

    testWidgets('a design system is picked in the theme menu; the HUD design shows the hardware status bar and its alerts', (tester) async {
      await tester.runAsync(signedIn);
      await start(tester);
      expect(find.byKey(const Key('hardware-hud')), findsNothing);
      await tester.tap(find.byKey(const Key('theme-menu')));
      await settle(tester);
      await tester.tap(find.byKey(const Key('design-systems')));
      await settle(tester);
      await tester.tap(find.byKey(const ValueKey('design-hud')));
      await settle(tester);
      final look = (await tester.runAsync(() => db.select(db.kv).get()))!.firstWhere((r) => r.k == 'device:look').v;
      expect(look, contains('"design":"hud"'));
      expect(find.byKey(const Key('hardware-hud')), findsOneWidget);
      expect(find.byKey(const Key('hud-printer')), findsOneWidget);
      expect(find.byKey(const Key('hud-scanner')), findsOneWidget);
      expect(find.textContaining('nothing scanned yet'), findsOneWidget);
      // a barcode at the till shows as the scanner's last scan
      await toTill(tester);
      await tester.enterText(find.byType(TextField).at(1), '7010001');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await settle(tester);
      expect(find.textContaining('last scan just now'), findsOneWidget);
      // picking a theme leaves the design system
      await tester.tap(find.byKey(const Key('theme-menu')));
      await settle(tester);
      await tester.tap(find.byKey(const Key('design-systems')));
      await settle(tester);
      await tester.ensureVisible(find.byKey(const ValueKey('design-off')));
      await settle(tester);
      await tester.tap(find.byKey(const ValueKey('design-off')));
      await settle(tester);
      expect(find.byKey(const Key('hardware-hud')), findsNothing);
      await done(tester);
    });
  });
}

/// A first download in progress (the sync screen's state, without a cloud).
class _FirstSync extends SyncController {
  @override
  SyncStatus build() => const SyncStatus(state: SyncState.syncing, first: true, progress: 'Downloading products · 120 of 900');
}
/// Sounds that are only written down (there is no audio device in tests).
extension<T> on List<T> {
  T addAndReturn(T v) {
    add(v);
    return v;
  }
}

/// One side of a call, without audio: remembers what it was given.
class _FakePeer implements RtcPeer {
  final state = StreamController<String>.broadcast();
  final candidates = StreamController<Map<String, Object?>>.broadcast();
  Map<String, Object?>? remote, local;
  final ice = <Map<String, Object?>>[];
  bool muted = false, closed = false;
  @override
  Future<Map<String, Object?>> createOffer({bool iceRestart = false}) async => local = {'type': 'offer', 'sdp': iceRestart ? 'fake-reoffer' : 'fake-offer'};
  @override
  Future<Map<String, Object?>> createAnswer() async => local = {'type': 'answer', 'sdp': 'fake-answer'};
  @override
  Future<void> setRemote(Map<String, Object?> d) async => remote = d;
  @override
  Future<void> addIce(Map<String, Object?> c) async => ice.add(c);
  @override
  bool get hasRemote => remote != null;
  @override
  Future<Map<String, Object?>> gathered({Duration wait = const Duration(milliseconds: 700)}) async => local!;
  @override
  Stream<String> get connectionState => state.stream;
  @override
  Stream<Map<String, Object?>> get iceCandidates => candidates.stream;
  @override
  void mute(bool on) => muted = on;
  @override
  Future<void> close() async => closed = true;
}

class _QuietSounds extends Sounds {
  _QuietSounds(super.ref, this.played);
  final List<String> played;
  @override
  Future<void> play(String kind, {String? tone, double? volume}) async => played.add(tone ?? kind);
}

/// System notifications, written down instead of shown.
class _FakeNotify implements OsNotify {
  var shown = <({String title, String body, int? count})>[];
  var perm = 'granted';
  var asked = 0, cleared = 0;
  void reset() {
    shown = [];
    perm = 'granted';
    asked = 0;
    cleared = 0;
  }

  @override
  Future<String> permission() async => perm;
  @override
  Future<String> ask() async {
    asked++;
    return perm = 'granted';
  }

  @override
  Future<void> show(int id, String title, String body, {int? count}) async => shown.add((title: title, body: body, count: count));
  @override
  Future<void> clear() async => cleared++;
}
