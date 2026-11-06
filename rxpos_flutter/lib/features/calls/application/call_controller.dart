// In-app voice calls between staff (src/calls.jsx CallManager): the audio goes directly between the two devices; the
// cloud only passes the short call set-up messages, instantly over the live line, by HTTP when a colleague isn't on
// it, and polled only while this device's live line is down. Ring and ringback, 45 s with no answer, a missed call
// after 46 s, "busy" when already on a call, a fresh route after a network change (~15 s before giving up), mute,
// and the call line in the private chat ("Missed voice call", "Voice call · 2:31"), written once by the caller.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/live/live_connection.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/notify/os_notifications.dart';
import '../../../core/rules/ids.dart';
import '../../../core/sound/sounds.dart';
import '../../auth/application/session_controller.dart';
import '../data/webrtc_peer.dart';
import '../domain/rtc_peer.dart';

/// How a call's audio connection is made (WebRTC in the apps, a fake in tests).
final rtcPeerFactoryProvider = Provider<RtcPeerFactory>((_) => WebRtcPeer.create);

/// Whether calls run on this device (switched off in tests that don't look at them).
final callsOnProvider = Provider<bool>((_) => true);

/// A message for the person on the screen ("Ben didn't pick up", "Allow the microphone to make calls").
class CallNotice {
  const CallNotice(this.text, {this.warn = false});
  final String text;
  final bool warn;
}

class CallController extends Notifier<CallState?> {
  RtcPeer? _pc;
  final _subs = <StreamSubscription<Object?>>[];
  StreamSubscription<Map<String, Object?>>? _live;
  Timer? _ring, _noAnswer, _drop, _poll, _clear;
  final _pendingIce = <Map<String, Object?>>[];
  final _lastSent = <String, Map<String, Object?>>{};
  bool _accepted = false, _restarted = false;
  int _since = 0;
  List<Object?>? _ice;
  DateTime? _iceAt;
  final _notices = StreamController<CallNotice>.broadcast();

  /// Short messages for the screen (shown as a snack bar).
  Stream<CallNotice> get notices => _notices.stream;

  @override
  CallState? build() {
    ref.onDispose(_stopAll);
    final s = ref.watch(sessionControllerProvider).value;
    if (!ref.watch(callsOnProvider) || s == null || !s.token.startsWith('u.')) return null;
    _live = ref.read(liveProvider.notifier).rtcMessages.listen(_fromLive);
    _schedulePoll(Duration.zero);
    return null;
  }

  bool get _can {
    final s = ref.read(sessionControllerProvider).value;
    return ref.read(callsOnProvider) && s != null && s.token.startsWith('u.');
  }

  void _say(String t, {bool warn = false}) => _notices.add(CallNotice(t, warn: warn));

  void _stopAll() {
    for (final t in [_ring, _noAnswer, _drop, _poll, _clear]) {
      t?.cancel();
    }
    _live?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _pc?.close();
  }

  // ---- signalling ----
  Future<void> _signal(String type, String to, String callId, [Object? data]) async {
    if (ref.read(liveProvider.notifier).send({'type': 'rtc', 'kind': type, 'to': to, 'callId': callId, 'data': data})) {
      _lastSent['$callId:$type'] = {'type': type, 'to': to, 'callId': callId, 'data': data};
      return;
    }
    await _http({'type': type, 'to': to, 'callId': callId, 'data': data});
  }

  Future<void> _http(Map<String, Object?> body) async {
    final r = await ref.read(cloudApiProvider).post('/api/rtc', body, timeout: const Duration(seconds: 15));
    if (r['error'] != null) throw Exception(r['error']);
  }

  void _fromLive(Map<String, Object?> m) {
    if (m['type'] == 'rtc') {
      _onMessage({'type': m['kind'], 'call_id': m['call_id'], 'from_uid': m['from_uid'], 'from_name': m['from_name'], 'data': m['data'], 'at': m['at']});
    } else if (m['type'] == 'rtc-offline') {
      // that colleague isn't on the live line (older app or poor network): send by HTTP instead
      final id = '${m['call_id']}:';
      for (final k in _lastSent.keys.where((k) => k.startsWith(id)).toList()) {
        unawaited(_http(_lastSent.remove(k)!).catchError((Object _) {}));
      }
    }
  }

  void _schedulePoll(Duration d) {
    _poll?.cancel();
    _poll = Timer(d, _pollOnce);
  }

  /// Polling only while the live line is down (every 1.5 s, 0.6 s during a call; checked every 4 s otherwise).
  Future<void> _pollOnce() async {
    if (!_can) return;
    if (ref.read(liveProvider).up) return _schedulePoll(const Duration(seconds: 4));
    try {
      final j = await ref.read(cloudApiProvider).get('/api/rtc?since=$_since');
      for (final m in (j['messages'] as List?) ?? const []) {
        if (m is Map) await _onMessage(m.cast<String, Object?>());
      }
      _since = (j['last'] as num?)?.toInt() ?? _since;
    } catch (_) {}
    _schedulePoll(Duration(milliseconds: state?.active == true ? 600 : 1500));
  }

  Future<List<Object?>> _iceServers() async {
    if (_ice != null && _iceAt != null && DateTime.now().difference(_iceAt!) < const Duration(hours: 6)) return _ice!;
    try {
      final j = await ref.read(cloudApiProvider).get('/api/rtc/config');
      _ice = (j['iceServers'] as List?) ?? const [];
      _iceAt = DateTime.now();
    } catch (_) {
      _ice = const [
        {'urls': ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']},
      ];
    }
    return _ice!;
  }

  // ---- the audio connection ----
  Future<RtcPeer> _newPc(CallState c) async {
    final pc = await ref.read(rtcPeerFactoryProvider)(await _iceServers());
    _pc = pc;
    _subs.add(pc.iceCandidates.listen((cand) {
      if (state?.id == c.id) unawaited(_signal('ice', c.peerId, c.id, cand).catchError((Object _) {}));
    }));
    _subs.add(pc.connectionState.listen((st) => _connection(pc, c, st)));
    return pc;
  }

  void _connection(RtcPeer pc, CallState c, String st) {
    if (_pc != pc || state?.id != c.id) return;
    if (st == 'connected') {
      _drop?.cancel();
      state = state!.copyWith(status: 'live', startedAt: state!.startedAt ?? DateTime.now(), weak: false);
    }
    // a moment of bad signal is normal on phones: wait, try a fresh route, and only give up after ~15 s
    if (st == 'disconnected') {
      state = state!.copyWith(weak: true);
      _drop?.cancel();
      _drop = Timer(const Duration(seconds: 3), () => _restart(c));
    }
    if (st == 'failed') {
      if (!_restarted) {
        _restart(c);
        return;
      }
      _say(state?.startedAt != null ? 'The call dropped: the network went away.' : 'The call could not connect on this network. Try WhatsApp or a normal phone call.', warn: true);
      unawaited(_signal('hangup', c.peerId, c.id).catchError((Object _) {}));
      _cleanup('ended');
    }
  }

  Future<void> _restart(CallState c) async {
    final pc = _pc;
    if (pc == null || state?.id != c.id) return;
    _restarted = true;
    _drop?.cancel();
    _drop = Timer(const Duration(seconds: 12), () {
      if (_pc == pc && state?.status != 'live' || state?.weak == true) {
        _say('The call dropped: the network went away.', warn: true);
        unawaited(_signal('hangup', c.peerId, c.id).catchError((Object _) {}));
        _cleanup('ended');
      }
    });
    if (c.dir != 'out') return;
    try {
      await _signal('reoffer', c.peerId, c.id, await pc.createOffer(iceRestart: true));
    } catch (_) {
      // the timer above ends it
    }
  }

  Future<void> _addIce(Map<String, Object?> cand) async {
    final pc = _pc;
    if (pc == null || !pc.hasRemote) {
      _pendingIce.add(cand);
      return;
    }
    try {
      await pc.addIce(cand);
    } catch (_) {}
  }

  Future<void> _drainIce() async {
    final list = [..._pendingIce];
    _pendingIce.clear();
    for (final c in list) {
      await _addIce(c);
    }
  }

  // ---- the call line in the private chat, written once by the caller ----
  Future<void> _logCall(CallState c, String status) async {
    if (c.dir != 'out' || !const {'calling', 'connecting', 'live'}.contains(c.status)) return;
    final s = ref.read(sessionControllerProvider).value;
    if (s == null) return;
    final secs = c.startedAt == null ? 0 : DateTime.now().difference(c.startedAt!).inSeconds;
    final branch = (await ref.read(pharmacyProvider.future)).branch;
    await ref.read(recordStoreProvider).update((d) => d.put('messages', {
          'id': 'call-${c.id}', 'date': DateTime.now().toUtc().toIso8601String(), 'fromId': s.userId, 'fromName': s.userName, 'conv': dmConv(s.userId, c.peerId),
          'branchId': branch, 'channel': 'team', 'call': {'status': secs > 0 ? 'done' : status, 'secs': secs},
        }));
  }

  void _cleanup(String status) {
    _ring?.cancel();
    _noAnswer?.cancel();
    _drop?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    final pc = _pc;
    _pc = null;
    unawaited(pc?.close());
    _pendingIce.clear();
    _accepted = false;
    _restarted = false;
    final c = state;
    if (c == null) return;
    unawaited(_logCall(c, status).catchError((Object _) {}));
    state = c.copyWith(status: status);
    _clear?.cancel();
    _clear = Timer(const Duration(milliseconds: 1800), () {
      if (state?.id == c.id && state?.status == status) state = null;
    });
  }

  void _sound(String kind) => unawaited(ref.read(soundsProvider).play(kind == 'ringback' ? 'ring' : kind, tone: kind == 'ringback' ? 'ringback' : null));

  // ---- outgoing ----
  /// Call a colleague (their user id and name).
  Future<void> start(String peerId, String peerName) async {
    if (!_can) return _say('Calls need the internet and your own sign-in.', warn: true);
    if (state?.active == true) return _say('You are already on a call', warn: true);
    final c = CallState(id: uid(), peerId: peerId, peerName: peerName, dir: 'out', status: 'calling');
    state = c;
    unawaited(_signal('ring', peerId, c.id).catchError((Object _) {})); // rings straight away
    try {
      final pc = await _newPc(c);
      await pc.createOffer();
      final offer = await pc.gathered();
      if (state?.id != c.id) return;
      await _signal('offer', peerId, c.id, offer);
      _sound('ringback');
      _ring = Timer.periodic(const Duration(seconds: 3), (_) => _sound('ringback'));
      _noAnswer = Timer(const Duration(seconds: 45), () {
        if (state?.id == c.id && state?.status == 'calling') {
          unawaited(_signal('hangup', peerId, c.id).catchError((Object _) {}));
          _say("$peerName didn't pick up");
          _cleanup('no answer');
        }
      });
    } on MicrophoneRefused {
      _say('Allow the microphone to make calls', warn: true);
      _cleanup('failed');
    } catch (e) {
      _say('$e'.replaceFirst('Exception: ', ''), warn: true);
      _cleanup('failed');
    }
  }

  // ---- incoming ----
  Future<void> _onMessage(Map<String, Object?> m) async {
    final c = state;
    final type = '${m['type']}', callId = '${m['call_id']}', from = '${m['from_uid']}';
    final data = (m['data'] as Map?)?.cast<String, Object?>();
    if (type == 'ice') {
      if (c != null && c.id == callId && data != null) await _addIce(data);
      return;
    }
    if (type == 'offer' && c != null && c.id == callId && c.dir == 'in') {
      // the connection details follow the ring a moment later
      state = c.copyWith(offer: data);
      if (_accepted) {
        _accepted = false;
        await _answer(state!);
      }
      return;
    }
    if (type == 'ring' || type == 'offer') {
      if (c != null && c.active) {
        if (c.id != callId) unawaited(_signal('busy', from, callId).catchError((Object _) {}));
        return;
      }
      final at = (m['at'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch;
      if (DateTime.now().millisecondsSinceEpoch - at > 40000) return;
      var name = '${m['from_name'] ?? ''}';
      if (name.isEmpty) {
        final users = await ref.read(recordStoreProvider).rows('users');
        name = '${users.where((u) => u['id'] == from).firstOrNull?['name'] ?? 'Colleague'}';
      }
      state = CallState(id: callId, peerId: from, peerName: name, dir: 'in', status: 'ringing', offer: type == 'offer' ? data : null);
      _sound('ring');
      _ring?.cancel();
      _ring = Timer.periodic(const Duration(seconds: 3), (_) => _sound('ring'));
      unawaited(ref.read(systemNoticesProvider).notify('Incoming call', '$name is calling you on RxPOS'));
      _noAnswer?.cancel();
      _noAnswer = Timer(const Duration(seconds: 46), () {
        if (state?.id == callId && state?.status == 'ringing') _cleanup('missed');
      });
      return;
    }
    if (c == null || c.id != callId) return;
    switch (type) {
      case 'answer':
        _ring?.cancel();
        state = c.copyWith(status: 'connecting');
        try {
          if (data != null) await _pc?.setRemote(data);
        } catch (_) {}
        await _drainIce();
      case 'reoffer': // the caller found a new route after a network change
        final pc = _pc;
        if (pc == null || data == null) return;
        try {
          await pc.setRemote(data);
          await _signal('reanswer', c.peerId, c.id, await pc.createAnswer());
        } catch (_) {}
      case 'reanswer':
        try {
          if (data != null) await _pc?.setRemote(data);
        } catch (_) {}
      case 'decline' || 'busy':
        _say(type == 'busy' ? '${c.peerName} is on another call' : "${c.peerName} can't talk right now");
        _cleanup(type == 'busy' ? 'busy' : 'declined');
      case 'hangup':
        _cleanup(c.status == 'ringing' ? 'missed' : 'ended');
    }
  }

  void accept() {
    final c = state;
    if (c == null || c.status != 'ringing') return;
    _ring?.cancel();
    _noAnswer?.cancel();
    state = c.copyWith(status: 'connecting');
    if (c.offer == null) {
      _accepted = true; // answered before the details arrived: connect as soon as they do
      return;
    }
    unawaited(_answer(state!));
  }

  Future<void> _answer(CallState c) async {
    try {
      final pc = await _newPc(c);
      await pc.setRemote(c.offer!);
      await _drainIce();
      await pc.createAnswer();
      await _signal('answer', c.peerId, c.id, await pc.gathered());
    } on MicrophoneRefused {
      _say('Allow the microphone to answer calls', warn: true);
      hangup();
    } catch (e) {
      _say('$e'.replaceFirst('Exception: ', ''), warn: true);
      hangup();
    }
  }

  void decline() {
    final c = state;
    if (c == null) return;
    unawaited(_signal('decline', c.peerId, c.id).catchError((Object _) {}));
    _cleanup('declined');
  }

  void hangup() {
    final c = state;
    if (c == null) return;
    unawaited(_signal('hangup', c.peerId, c.id).catchError((Object _) {}));
    _cleanup('ended');
  }

  void mute() {
    final c = state;
    if (c == null) return;
    _pc?.mute(!c.muted);
    state = c.copyWith(muted: !c.muted);
  }
}

final callProvider = NotifierProvider<CallController, CallState?>(CallController.new);
