// One side of a voice call (src/calls.jsx): the audio connection between two devices. The apps use WebRTC
// (data/webrtc_peer.dart); tests use a fake. Descriptions and candidates are plain maps in the browser's JSON shape
// ({type, sdp} / {candidate, sdpMid, sdpMLineIndex}), so a Flutter device and a React device can call each other.
abstract class RtcPeer {
  Future<Map<String, Object?>> createOffer({bool iceRestart = false});
  Future<Map<String, Object?>> createAnswer();
  Future<void> setRemote(Map<String, Object?> description);
  Future<void> addIce(Map<String, Object?> candidate);
  bool get hasRemote;
  /// The local description once the first candidates are in (at most [wait], like the React app's 700 ms).
  Future<Map<String, Object?>> gathered({Duration wait = const Duration(milliseconds: 700)});
  /// 'connected' | 'disconnected' | 'failed' | 'closed' (and the states before).
  Stream<String> get connectionState;
  Stream<Map<String, Object?>> get iceCandidates;
  void mute(bool on);
  Future<void> close();
}

/// Makes a peer with the cloud's ICE servers, the microphone on (echo cancellation, noise suppression). Throws
/// [MicrophoneRefused] when the person doesn't allow the microphone.
typedef RtcPeerFactory = Future<RtcPeer> Function(List<Object?> iceServers);

class MicrophoneRefused implements Exception {
  const MicrophoneRefused();
}

/// The call's state on this device.
class CallState {
  const CallState({required this.id, required this.peerId, required this.peerName, required this.dir, required this.status, this.muted = false, this.startedAt, this.offer, this.weak = false});
  final String id, peerId, peerName;
  /// 'out' (this device called) or 'in'
  final String dir;
  /// calling | ringing | connecting | live | ended | declined | busy | no answer | missed | failed
  final String status;
  final bool muted, weak;
  final DateTime? startedAt;
  final Map<String, Object?>? offer;

  CallState copyWith({String? status, bool? muted, DateTime? startedAt, Map<String, Object?>? offer, bool? weak}) => CallState(
        id: id, peerId: peerId, peerName: peerName, dir: dir, status: status ?? this.status, muted: muted ?? this.muted,
        startedAt: startedAt ?? this.startedAt, offer: offer ?? this.offer, weak: weak ?? this.weak,
      );

  bool get active => const {'calling', 'ringing', 'connecting', 'live'}.contains(status);
}

String fmtSecs(int secs) => '${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}';

/// What the call screen says (src/calls.jsx label).
String callLabel(CallState c, int secs) => switch (c.status) {
      'calling' => 'Ringing…',
      'ringing' => 'Incoming call',
      'connecting' => 'Connecting…',
      'live' => c.weak ? 'Reconnecting…' : fmtSecs(secs),
      'ended' => secs > 0 ? 'Call ended · ${fmtSecs(secs)}' : 'Call ended',
      'declined' => 'Busy right now',
      'busy' => 'On another call',
      'no answer' => 'No answer',
      'missed' => 'Missed call',
      'failed' => 'Call failed',
      _ => c.status,
    };

/// The private conversation of two people (the same id the chat uses).
String dmConv(String a, String b) => 'dm:${([a, b]..sort()).join(':')}';
