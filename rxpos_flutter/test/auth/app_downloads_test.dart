// Web sign-in: "Browser or app?" with download links to the newest released apps (lib/features/auth/domain/app_downloads.dart)
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/auth/domain/app_downloads.dart';
import 'package:rxpos/features/auth/presentation/app_downloads_card.dart';

void main() {
  test('links to the files the cloud serves; the release page when it has none or a strange name', () {
    final l = downloadLinks('https://api.rxposug.com/', {'build': 154, 'label': '2.1.154', 'file': 'RxPOS-New-154.exe', 'size': 89128960},
        {'build': 154, 'label': '2.1.154', 'file': 'RxPOS-New-154.apk', 'size': 31457280});
    expect((l.windows.url, l.windows.version, l.windows.size, l.windows.direct), ('https://api.rxposug.com/api/app/RxPOS-New-154.exe', '2.1.154', '85 MB', true));
    expect(l.android.url, 'https://api.rxposug.com/api/app/RxPOS-New-154.apk');
    final none = downloadLinks('x', null, {'file': '../secret.apk'});
    expect((none.windows.url, none.android.url, none.windows.direct), (releasesPage, releasesPage, false));
    expect(downloadLinks('x', {'file': 'RxPOS.apk'}, null).windows.url, releasesPage, reason: 'an APK is not a Windows installer');
    expect((sizeText(0), sizeText(1000)), ('', '1 MB'));
  });

  Future<void> pump(WidgetTester tester, WebDevice device, {Size size = const Size(420, 900)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final links = downloadLinks('https://api.rxposug.com', {'label': '2.1.154', 'file': 'RxPOS-New-154.exe', 'size': 89128960}, {'label': '2.1.154', 'file': 'RxPOS-New-154.apk', 'size': 31457280});
    await tester.pumpWidget(ProviderScope(
      overrides: [appDownloadsProvider.overrideWith((_) async => links)],
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: AppDownloadsCard(device: device)))),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('says what the browser and the app are for; this device first and highlighted', (tester) async {
    await pump(tester, WebDevice.android);
    expect(find.text('Browser or app?'), findsOneWidget);
    expect(find.textContaining('Needs the internet the whole time'), findsOneWidget);
    expect(find.textContaining('keeps selling when the internet drops'), findsOneWidget);
    expect(find.textContaining('Same account and data'), findsOneWidget);
    final android = tester.getTopLeft(find.byKey(const Key('download-android'))), windows = tester.getTopLeft(find.byKey(const Key('download-windows')));
    expect(android.dy < windows.dy, isTrue, reason: 'Android first on an Android phone');
    expect(find.descendant(of: find.byKey(const Key('download-android')), matching: find.text('this device · v2.1.154 · 30 MB')), findsOneWidget);
    expect(find.byType(FilledButton), findsOneWidget, reason: 'only this device is highlighted');
    expect(tester.takeException(), isNull);
  });

  testWidgets('iPhone / Mac: no app yet, use the browser; narrow screens stack the two choices', (tester) async {
    await pump(tester, WebDevice.apple, size: const Size(340, 900));
    expect(find.textContaining('no RxPOS app for iPhone, iPad or Mac yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('screens: the card on a Windows browser and an Android phone', (tester) async {
    for (final (dev, size, name) in [(WebDevice.windows, const Size(480, 760), 'windows'), (WebDevice.android, const Size(390, 860), 'android')]) {
      await pump(tester, dev, size: size);
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('../widgets/screens/web-downloads-$name.png'));
    }
  }, skip: !const bool.fromEnvironment('SCREENS'));
}
