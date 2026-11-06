// Pop-up cards with a sound (src/notify.jsx popup / PopupHost): stock and weather alerts, new messages, the hourly
// reminder, daily greetings and the weekly summary. The same id replaces an open card; at most four show; each closes
// after its time unless it stays (sticky). At the till, routine cards (weekly, hourly, greetings) wait until the POS is
// left; urgent alerts and messages from colleagues still show.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/sound/sounds.dart';
import '../../alerts/presentation/notification_bell.dart';

class PopupAction {
  const PopupAction(this.label, {this.icon, this.to, this.onTap, this.primary = false, this.keep = false});
  final String label;
  final IconData? icon;
  final String? to;
  final VoidCallback? onTap;
  final bool primary, keep;
}

class Popup {
  Popup({required this.id, required this.title, this.tone = 'info', this.icon, this.body, this.content, this.to, this.actions = const [], this.sticky = false, this.ttl = const Duration(seconds: 15), this.wide = false, this.sound})
      : at = DateTime.now();
  final String id, title, tone;
  final IconData? icon;
  final String? body, to, sound;
  /// Its own content (a list of alerts, the weekly figures…), given a way to close the card.
  final Widget Function(BuildContext context, VoidCallback close)? content;
  final List<PopupAction> actions;
  final bool sticky, wide;
  final Duration ttl;
  final DateTime at;
}

const routinePopups = {'weekly', 'hour', 'greet'};

class PopupController extends Notifier<List<Popup>> {
  final _timers = <Popup, Timer>{};

  @override
  List<Popup> build() {
    ref.onDispose(() {
      for (final t in _timers.values) {
        t.cancel();
      }
    });
    return const [];
  }

  void show(Popup p) {
    final list = [...state.where((x) => x.id != p.id), p];
    state = list.length > 4 ? list.sublist(list.length - 4) : list;
    if (!p.sticky) _timers[p] = Timer(p.ttl, () => close(p));
    if (p.sound != null) unawaited(ref.read(soundsProvider).play(p.sound!));
  }

  void close(Popup p) {
    _timers.remove(p)?.cancel();
    state = state.where((x) => x != p).toList();
  }

  void closeId(String id) {
    for (final p in state.where((x) => x.id == id).toList()) {
      close(p);
    }
  }
}

final popupsProvider = NotifierProvider<PopupController, List<Popup>>(PopupController.new);

/// The cards, top right of the app.
class PopupHost extends ConsumerWidget {
  const PopupHost({super.key, required this.location});
  final String location;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(popupsProvider);
    final selling = location.startsWith('/pos');
    final shown = selling ? all.where((p) => !routinePopups.contains(p.id) || p.tone == 'danger').toList() : all;
    if (shown.isEmpty) return const SizedBox.shrink();
    final t = Theme.of(context);
    final narrow = MediaQuery.sizeOf(context).width < 600;
    return Positioned(
      top: 8,
      right: 8,
      left: narrow ? 8 : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
        for (final p in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: p.wide ? 460 : 380),
              child: Material(
                key: ValueKey('popup-${p.id}'),
                elevation: 8,
                borderRadius: BorderRadius.circular(12),
                color: t.colorScheme.surface,
                child: Container(
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border(left: BorderSide(width: 4, color: toneColor(context, p.tone)))),
                  padding: const EdgeInsets.fromLTRB(12, 6, 4, 10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Row(children: [
                      if (p.icon != null) ...[Icon(p.icon, size: 18, color: toneColor(context, p.tone)), const SizedBox(width: 8)],
                      Expanded(child: Text(p.title, style: const TextStyle(fontWeight: FontWeight.w800))),
                      IconButton(tooltip: 'Close', icon: const Icon(Icons.close, size: 16), onPressed: () => ref.read(popupsProvider.notifier).close(p)),
                    ]),
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: p.content != null
                          ? p.content!(context, () => ref.read(popupsProvider.notifier).close(p))
                          : p.body != null
                              ? Text(p.body!)
                              : const SizedBox.shrink(),
                    ),
                    if (p.to != null || p.actions.isNotEmpty)
                      Wrap(spacing: 8, children: [
                        for (final a in p.actions)
                          (a.primary ? FilledButton.icon : TextButton.icon)(
                            onPressed: () {
                              a.onTap?.call();
                              if (a.to != null) context.go(a.to!);
                              if (!a.keep) ref.read(popupsProvider.notifier).close(p);
                            },
                            icon: Icon(a.icon ?? Icons.open_in_new, size: 16),
                            label: Text(a.label),
                          ),
                        if (p.to != null)
                          TextButton(
                            onPressed: () {
                              context.go(p.to!);
                              ref.read(popupsProvider.notifier).close(p);
                            },
                            child: const Text('Open'),
                          ),
                      ]),
                  ]),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}
