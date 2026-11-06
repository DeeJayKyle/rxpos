// Crash reports from devices, kept private (src/crash.js): errors on any device go to the pharmacy's own RxPOS cloud
// (no outside service) and the RxPOS owner sees them in the owner console. The same error is sent once per day per
// device; reports wait on the device while offline. No sales or patient data: only the error message, where it
// happened in code, the screen, the app build and the device type; emails and long numbers are blanked out.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:rxpos/core/platform.dart';
import 'package:rxpos/core/update/app_updates.dart' show webBuild;

import '../data/device_settings.dart';
import '../network/dio_client.dart';
import '../sync/sync_engine.dart';

/// Keep code locations, drop anything that could carry data (emails, phone numbers incl. spaced / dashed, long numbers).
String scrub(Object? s, int n) {
  final t = '${s ?? ''}'
      .replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.]+'), '[email]')
      .replaceAll(RegExp(r'\d[\d\s-]{7,}\d'), '[n]')
      .replaceAll(RegExp(r'\b\d{6,}\b'), '[n]');
  return t.length > n ? t.substring(0, n) : t;
}

/// The same short hash as the React app (31 × h + c, as an unsigned base-36 number).
String errorKey(String s) {
  var h = 0;
  for (final c in s.codeUnits) {
    h = (31 * h + c) & 0xFFFFFFFF;
  }
  return h.toRadixString(36);
}

const _queueKey = 'crash-queue', _sentKey = 'crash-sent';
final _noise = RegExp(r'RenderFlex overflowed|A RenderFlex overflowed|setState\(\) called after dispose');

class CrashReports {
  CrashReports(this._ref);
  final Ref _ref;
  bool _flushing = false;
  String page = '/';

  Future<List<Map<String, Object?>>> _list(String k) async {
    try {
      return [for (final x in jsonDecode(await _ref.read(deviceValueProvider(k).future) ?? '[]') as List) (x as Map).cast<String, Object?>()];
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, String>> _sent() async {
    try {
      return (jsonDecode(await _ref.read(deviceValueProvider(_sentKey).future) ?? '{}') as Map).map((k, v) => MapEntry('$k', '$v'));
    } catch (_) {
      return {};
    }
  }

  static String _today() => DateTime.now().toUtc().toIso8601String().substring(0, 10);

  /// Record an error; sent when the device is signed in and online. Never throws.
  Future<void> report(Object error, [StackTrace? stack, String kind = 'error']) async {
    try {
      final message = scrub(error, 300);
      if (message.isEmpty || _noise.hasMatch(message)) return;
      final st = scrub(stack ?? '', 3000);
      final key = errorKey(message + st.split('\n').take(3).join('|'));
      if ((await _sent())[key] == _today()) return; // already reported today from this device
      final q = (await _list(_queueKey)).where((x) => x['key'] != key).toList();
      final keep = q.length > 19 ? q.sublist(q.length - 19) : q;
      int build = 0;
      try {
        build = onWeb ? webBuild : int.tryParse((await PackageInfo.fromPlatform()).buildNumber) ?? 0;
      } catch (_) {}
      keep.add({
        'key': key, 'message': message, 'stack': st, 'page': page.length > 80 ? page.substring(0, 80) : page, 'build': build,
        'platform': 'flutter-$osName', 'kind': kind, 'at': DateTime.now().toUtc().toIso8601String(),
      });
      await _ref.read(deviceValueProvider(_queueKey).notifier).set(jsonEncode(keep));
      await flush();
    } catch (_) {
      // reporting must never cause an error of its own
    }
  }

  /// Send what is waiting (after an error, and when sync reaches the cloud).
  Future<void> flush() async {
    if (_flushing || _ref.read(authTokenProvider) == null) return;
    final q = await _list(_queueKey);
    if (q.isEmpty) return;
    _flushing = true;
    try {
      final r = await _ref.read(dioProvider).post<Object?>('${syncBase(_ref.read(appConfigProvider).cloudUrl)}/api/errors', data: {'errors': q}, options: Options(validateStatus: (_) => true));
      if ((r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 300) {
        final today = _today();
        final sent = {for (final e in (await _sent()).entries) if (e.value == today) e.key: e.value, for (final e in q) '${e['key']}': today};
        await _ref.read(deviceValueProvider(_sentKey).notifier).set(jsonEncode(sent));
        final left = (await _list(_queueKey)).where((x) => !q.any((y) => y['key'] == x['key'])).toList();
        await _ref.read(deviceValueProvider(_queueKey).notifier).set(jsonEncode(left));
      }
    } catch (_) {
      // try again later
    } finally {
      _flushing = false;
    }
  }

  /// What is waiting to be sent (for tests and This device).
  Future<List<Map<String, Object?>>> waiting() => _list(_queueKey);
}

final crashReportsProvider = Provider<CrashReports>(CrashReports.new);
