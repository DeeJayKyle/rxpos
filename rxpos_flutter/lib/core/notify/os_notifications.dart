// Notices outside the app window (src/badges.js): a system notification when RxPOS is in the background (new
// messages, calls, urgent alerts, the hourly reminder), and the unread count on the Android app icon, which comes with
// the notification. Only while RxPOS is not on screen, unless `always`. The person allows it once (Android 13+).

import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rxpos/core/platform.dart';

import 'web_notify_stub.dart' if (dart.library.js_interop) 'web_notify_web.dart';

import '../data/device_settings.dart';

/// This device setting: show the unread count on the app icon (on unless switched off).
const badgesKey = 'badges';

/// What the system can do; the plugin in the apps, a fake in tests.
abstract class OsNotify {
  /// 'granted', 'denied' or 'default' (not asked yet).
  Future<String> permission();
  Future<String> ask();
  Future<void> show(int id, String title, String body, {int? count});
  /// Remove RxPOS's notifications (and with them the Android icon's dot).
  Future<void> clear();
}

class PluginNotify implements OsNotify {
  final _p = FlutterLocalNotificationsPlugin();
  Future<bool>? _ready;

  Future<bool> _init() => _ready ??= () async {
        try {
          return await _p.initialize(
                settings: const InitializationSettings(
                  android: AndroidInitializationSettings('@mipmap/ic_launcher'),
                  windows: WindowsInitializationSettings(appName: 'RxPOS', appUserModelId: 'RxPOS.New', guid: 'd174d7c2-f9be-466f-bec5-6be0dada8654'),
                  linux: LinuxInitializationSettings(defaultActionName: 'Open RxPOS'),
                ),
              ) ??
              false;
        } catch (_) {
          return false;
        }
      }();

  AndroidFlutterLocalNotificationsPlugin? get _android => _p.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  @override
  Future<String> permission() async {
    if (!await _init()) return 'denied';
    if (!onAndroid) return 'granted';
    final on = await _android?.areNotificationsEnabled();
    return on == true ? 'granted' : 'default';
  }

  @override
  Future<String> ask() async {
    if (!await _init()) return 'denied';
    if (!onAndroid) return 'granted';
    final ok = await _android?.requestNotificationsPermission();
    return ok == true ? 'granted' : 'denied';
  }

  @override
  Future<void> show(int id, String title, String body, {int? count}) async {
    if (!await _init()) return;
    final text = body.length > 240 ? body.substring(0, 240) : body;
    await _p.show(
      id: id,
      title: title,
      body: text,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails('rxpos', 'RxPOS', channelDescription: 'New messages, calls and stock alerts', groupKey: 'rxpos', autoCancel: true, number: count),
        windows: const WindowsNotificationDetails(),
      ),
    );
  }

  @override
  Future<void> clear() async {
    if (await _init()) await _p.cancelAll();
  }
}

final osNotifyProvider = Provider<OsNotify>((_) => onWeb ? WebNotify() : PluginNotify());

/// In a browser: the browser's own notifications (it asks once for this site).
class WebNotify implements OsNotify {
  @override
  Future<String> permission() async => webPermission();
  @override
  Future<String> ask() => webAsk();
  @override
  Future<void> show(int id, String title, String body, {int? count}) async => webShow(title, body.length > 240 ? body.substring(0, 240) : body);
  @override
  Future<void> clear() async {}
}

/// Is RxPOS on screen? (Replaced in tests.)
final appInForegroundProvider = Provider<bool Function()>((_) => () {
      final s = WidgetsBinding.instance.lifecycleState;
      return s == null || s == AppLifecycleState.resumed;
    });

/// Show [title] / [body] as a system notification when RxPOS is in the background (or [always]). The Android icon
/// count is the unread count (chat + incoming transfers) unless the person switched it off.
class SystemNotices {
  SystemNotices(this._ref);
  final Ref _ref;
  int _id = 1;

  Future<void> notify(String title, String body, {bool always = false, int count = 0}) async {
    try {
      if (!always && _ref.read(appInForegroundProvider)()) return;
      final os = _ref.read(osNotifyProvider);
      if (await os.permission() != 'granted') return;
      final badges = await _ref.read(deviceValueProvider(badgesKey).future) != '0';
      await os.show(_id++ % 100000, title, body, count: badges && count > 0 ? count : null);
    } catch (_) {
      // the system refused
    }
  }

  /// Nothing unread any more: take RxPOS's notifications (and the icon dot) away.
  Future<void> countIs(int n) async {
    if (n > 0) return;
    try {
      await _ref.read(osNotifyProvider).clear();
    } catch (_) {}
  }
}

final systemNoticesProvider = Provider<SystemNotices>(SystemNotices.new);
