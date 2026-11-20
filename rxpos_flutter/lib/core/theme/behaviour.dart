// 1.18.0 (the owner's choice, as the web app's src/behaviour.js): how the app behaves on this device, the iPhone way.
//   island  messages (snack bars) as a Dynamic Island: a black pill
//   sheets  pop-ups rise from the bottom as sheets; drag one down to close it
//   lock    the till locks itself after this many idle minutes (0: never)
// Kept on this device only (device:behaviour), with the appearance preferences.
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';

const behaviourKey = 'behaviour';
const lockAfterChoices = [(0, 'Never'), (2, '2 min'), (5, '5 min'), (15, '15 min')];

class Behaviour {
  const Behaviour({this.island = false, this.sheets = false, this.lock = 0});
  final bool island, sheets;
  final int lock;

  Behaviour copyWith({bool? island, bool? sheets, int? lock}) => Behaviour(island: island ?? this.island, sheets: sheets ?? this.sheets, lock: lock ?? this.lock);
  Map<String, Object?> toJson() => {'island': island, 'sheets': sheets, 'lock': lock};

  static Behaviour parse(String? v) {
    try {
      final j = (jsonDecode(v ?? '{}') as Map).cast<String, Object?>();
      final lock = (j['lock'] as num?)?.toInt() ?? 0;
      return Behaviour(island: j['island'] == true, sheets: j['sheets'] == true, lock: lockAfterChoices.any((c) => c.$1 == lock) ? lock : 0);
    } catch (_) {
      return const Behaviour();
    }
  }
}

final behaviourProvider = Provider<Behaviour>((ref) => Behaviour.parse(ref.watch(deviceValueProvider(behaviourKey)).value));

Behaviour? _pending; // a change on its way to the store, so quick taps build on each other

/// Change this device's behaviour (from the latest choice, even while an earlier change is still being saved)
Future<void> updateBehaviour(WidgetRef ref, Behaviour Function(Behaviour) change) {
  final next = change(_pending ?? ref.read(behaviourProvider));
  _pending = next;
  return ref.read(deviceValueProvider(behaviourKey).notifier).set(jsonEncode(next.toJson())).whenComplete(() {
    if (identical(_pending, next)) _pending = null;
  });
}

/// Sheets on (read by showAppDialog, which has no ref): set by the app as the choice changes.
final sheetsOn = ValueNotifier<bool>(false);

/// The till lock (device:locked holds the person who locked it): kept across a restart / reload.
const lockedKey = 'locked';
