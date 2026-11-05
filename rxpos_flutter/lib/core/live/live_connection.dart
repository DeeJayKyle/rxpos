// One live connection per device to the pharmacy's cloud hub (src/live.js, worker/live.js): an instant "something
// changed, pull now" when another device saves. It opens with a short-lived ticket so the sign-in token never appears in
// the address; it is pinged every 20 s and replaced when no answer comes within 15 s; when it drops, RxPOS keeps
// syncing on its timer and reconnects in the background (1 s doubling to 30 s).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/sync_status/application/sync_controller.dart';
import '../network/dio_client.dart';
import '../sync/sync_config.dart';
import '../sync/sync_engine.dart';
import '../database/app_database.dart';

/// How the line is opened (replaced in tests).
typedef LiveConnect = Future<Stream<Object?>> Function(Uri url, void Function(void Function(String) send) onSend);

final liveConnectProvider = Provider<LiveConnect>((ref) => (url, onSend) async {
      final ws = await WebSocket.connect(url.toString()).timeout(const Duration(seconds: 15));
      onSend(ws.add);
      return ws.map<Object?>((x) => x);
    });

/// Whether the live line runs (tests switch it off unless they look at it).
final liveOnProvider = Provider<bool>((_) => true);

String liveAddress(String cloudUrl) => syncBase(cloudUrl).replaceFirst(RegExp('^http'), 'ws');

class LiveState {
  const LiveState({this.up = false, this.changes = 0});
  final bool up;
  final int changes;
}

class LiveConnection extends Notifier<LiveState> {
  StreamSubscription<Object?>? _sub;
  Timer? _retry, _ping;
  int _attempt = 0;
  DateTime _heard = DateTime.fromMillisecondsSinceEpoch(0);
  void Function(String)? _send;
  String _key = '';

  @override
  LiveState build() {
    ref.onDispose(_close);
    final session = ref.watch(sessionControllerProvider).value;
    if (!ref.watch(liveOnProvider) || session == null || !session.token.startsWith('u.')) {
      _close();
      return const LiveState();
    }
    final key = '${session.tenant}|${session.token}';
    if (key != _key) {
      _key = key;
      _close();
      scheduleMicrotask(_open);
    }
    return const LiveState();
  }

  void _close() {
    _sub?.cancel();
    _sub = null;
    _retry?.cancel();
    _ping?.cancel();
    _send = null;
  }

  Future<void> _open() async {
    _retry?.cancel();
    final session = ref.read(sessionControllerProvider).value;
    if (session == null) return;
    final cloud = ref.read(appConfigProvider).cloudUrl;
    var auth = 'token=${Uri.encodeComponent(session.token)}';
    try {
      final r = await ref.read(dioProvider).post<Object?>('${syncBase(cloud)}/api/live-ticket', options: Options(validateStatus: (_) => true, receiveTimeout: const Duration(seconds: 10)));
      final t = r.data is Map ? (r.data as Map)['ticket'] : null;
      if (t is String && t.isNotEmpty) auth = 'ticket=${Uri.encodeComponent(t)}';
    } catch (_) {
      // offline or an older cloud: the token below
    }
    final device = (await SyncConfig.load(ref.read(appDatabaseProvider))).deviceId;
    try {
      final stream = await ref.read(liveConnectProvider)(Uri.parse('${liveAddress(cloud)}/api/live?$auth&device=${Uri.encodeComponent(device)}'), (s) => _send = s);
      _attempt = 0;
      _heard = DateTime.now();
      state = LiveState(up: true, changes: state.changes);
      _ping = Timer.periodic(const Duration(seconds: 20), (_) {
        if (DateTime.now().difference(_heard) > const Duration(seconds: 35)) return _drop(); // a silent line: replace it
        try {
          _send?.call('ping');
        } catch (_) {}
      });
      _sub = stream.listen(_message, onDone: _drop, onError: (_) => _drop(), cancelOnError: true);
    } catch (_) {
      _drop();
    }
  }

  void _message(Object? data) {
    _heard = DateTime.now();
    if (data == 'pong' || data is! String) return;
    Object? m;
    try {
      m = jsonDecode(data);
    } catch (_) {
      return;
    }
    if (m is Map && m['type'] == 'changed') {
      state = LiveState(up: true, changes: state.changes + 1);
      ref.read(syncControllerProvider.notifier).runNow(); // pull now instead of waiting for the next sync
    }
  }

  void _drop() {
    _sub?.cancel();
    _sub = null;
    _ping?.cancel();
    _send = null;
    state = LiveState(changes: state.changes);
    if (_key.isEmpty) return;
    final wait = Duration(milliseconds: (1000 * (1 << _attempt.clamp(0, 5))).clamp(1000, 30000));
    _attempt++;
    _retry = Timer(wait, _open);
  }

  /// The internet is back or the app came to the front: try at once instead of waiting.
  void reconnectNow() {
    if (state.up || _key.isEmpty) return;
    _attempt = 0;
    _close();
    _open();
  }
}

final liveProvider = NotifierProvider<LiveConnection, LiveState>(LiveConnection.new);
