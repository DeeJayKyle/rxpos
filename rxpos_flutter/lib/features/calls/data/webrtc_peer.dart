// The WebRTC side of a call (flutter_webrtc on Android and Windows): audio only, as in src/calls.jsx.
import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../domain/rtc_peer.dart';

class WebRtcPeer implements RtcPeer {
  WebRtcPeer._(this._pc, this._mic);
  final RTCPeerConnection _pc;
  final MediaStream _mic;
  final _state = StreamController<String>.broadcast();
  final _ice = StreamController<Map<String, Object?>>.broadcast();
  bool _remote = false;
  final _gathered = Completer<void>();

  static Future<RtcPeer> create(List<Object?> iceServers) async {
    final MediaStream mic;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        'audio': {'echoCancellation': true, 'noiseSuppression': true, 'autoGainControl': true},
        'video': false,
      });
    } catch (_) {
      throw const MicrophoneRefused();
    }
    final pc = await createPeerConnection({'iceServers': iceServers, 'bundlePolicy': 'max-bundle', 'sdpSemantics': 'unified-plan'});
    for (final t in mic.getAudioTracks()) {
      await pc.addTrack(t, mic);
    }
    final p = WebRtcPeer._(pc, mic);
    pc.onIceCandidate = (c) {
      if (c.candidate != null) p._ice.add({'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex});
    };
    pc.onIceGatheringState = (s) {
      if (s == RTCIceGatheringState.RTCIceGatheringStateComplete && !p._gathered.isCompleted) p._gathered.complete();
    };
    pc.onConnectionState = (s) => p._state.add(switch (s) {
          RTCPeerConnectionState.RTCPeerConnectionStateConnected => 'connected',
          RTCPeerConnectionState.RTCPeerConnectionStateDisconnected => 'disconnected',
          RTCPeerConnectionState.RTCPeerConnectionStateFailed => 'failed',
          RTCPeerConnectionState.RTCPeerConnectionStateClosed => 'closed',
          _ => 'connecting',
        });
    // the other side's voice plays through the device's speaker / earpiece (remote audio tracks play by themselves)
    return p;
  }

  static Map<String, Object?> _desc(RTCSessionDescription d) => {'type': d.type, 'sdp': d.sdp};

  @override
  Future<Map<String, Object?>> createOffer({bool iceRestart = false}) async {
    final o = await _pc.createOffer({if (iceRestart) 'iceRestart': true});
    await _pc.setLocalDescription(o);
    return _desc(o);
  }

  @override
  Future<Map<String, Object?>> createAnswer() async {
    final a = await _pc.createAnswer();
    await _pc.setLocalDescription(a);
    return _desc(a);
  }

  @override
  Future<void> setRemote(Map<String, Object?> d) async {
    await _pc.setRemoteDescription(RTCSessionDescription('${d['sdp']}', '${d['type']}'));
    _remote = true;
  }

  @override
  bool get hasRemote => _remote;

  @override
  Future<void> addIce(Map<String, Object?> c) => _pc.addCandidate(RTCIceCandidate('${c['candidate']}', c['sdpMid'] as String?, (c['sdpMLineIndex'] as num?)?.toInt()));

  @override
  Future<Map<String, Object?>> gathered({Duration wait = const Duration(milliseconds: 700)}) async {
    await _gathered.future.timeout(wait, onTimeout: () {});
    final d = await _pc.getLocalDescription();
    return d == null ? const {} : _desc(d);
  }

  @override
  Stream<String> get connectionState => _state.stream;

  @override
  Stream<Map<String, Object?>> get iceCandidates => _ice.stream;

  @override
  void mute(bool on) {
    for (final t in _mic.getAudioTracks()) {
      t.enabled = !on;
    }
  }

  @override
  Future<void> close() async {
    for (final t in _mic.getTracks()) {
      await t.stop();
    }
    await _mic.dispose();
    await _pc.close();
    await _state.close();
    await _ice.close();
  }
}
