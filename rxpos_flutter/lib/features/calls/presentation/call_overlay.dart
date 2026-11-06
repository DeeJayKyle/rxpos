// The call screen over the whole app (src/calls.jsx): the colleague's initials and name, "Ringing…" / the call's
// length, Answer and Decline for an incoming call, Mute and Hang up otherwise. Stays up while moving between screens.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/call_controller.dart';
import '../domain/rtc_peer.dart';

class CallOverlay extends ConsumerStatefulWidget {
  const CallOverlay({super.key});

  @override
  ConsumerState<CallOverlay> createState() => _CallOverlayState();
}

class _CallOverlayState extends ConsumerState<CallOverlay> {
  Timer? _tick;
  StreamSubscription<CallNotice>? _notices;

  @override
  void initState() {
    super.initState();
    _notices = ref.read(callProvider.notifier).notices.listen((n) {
      if (!mounted) return;
      final scheme = Theme.of(context).colorScheme;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(n.text), backgroundColor: n.warn ? scheme.error : null));
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _notices?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = ref.watch(callProvider);
    final live = c?.status == 'live';
    if (live && _tick == null) {
      _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
    } else if (!live && _tick != null) {
      _tick!.cancel();
      _tick = null;
    }
    if (c == null) return const SizedBox.shrink();
    final calls = ref.read(callProvider.notifier);
    final secs = c.startedAt == null ? 0 : DateTime.now().difference(c.startedAt!).inSeconds;
    final initials = c.peerName.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0]).join().toUpperCase();
    final scheme = Theme.of(context).colorScheme;
    Widget btn(String label, IconData icon, VoidCallback onTap, {Color? color}) => Column(mainAxisSize: MainAxisSize.min, children: [
          IconButton.filled(
            key: Key('call-$label'),
            tooltip: label,
            iconSize: 26,
            style: IconButton.styleFrom(backgroundColor: color, padding: const EdgeInsets.all(16)),
            onPressed: onTap,
            icon: Icon(icon),
          ),
          const SizedBox(height: 4),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ]);
    final ringingIn = c.dir == 'in' && c.status == 'ringing';
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black54,
        child: Center(
          child: Card(
            key: const Key('call-screen'),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(32, 28, 32, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 220, maxWidth: 320),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  CircleAvatar(radius: 40, backgroundColor: scheme.primaryContainer, child: Text(initials, style: TextStyle(fontSize: 26, color: scheme.onPrimaryContainer))),
                  const SizedBox(height: 12),
                  Text(c.peerName, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    if (ringingIn) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.phone_callback, size: 14)),
                    Text(callLabel(c, secs), key: const Key('call-status')),
                  ]),
                  if (c.muted) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Muted', style: TextStyle(color: scheme.error, fontSize: 12))),
                  const SizedBox(height: 20),
                  if (ringingIn)
                    Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                      btn('Decline', Icons.call_end, calls.decline, color: Colors.red.shade600),
                      btn('Answer', Icons.call, calls.accept, color: Colors.green.shade600),
                    ])
                  else if (c.active)
                    Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                      btn(c.muted ? 'Unmute' : 'Mute', c.muted ? Icons.mic_off : Icons.mic, calls.mute),
                      btn('Hang up', Icons.call_end, calls.hangup, color: Colors.red.shade600),
                    ]),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
