import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/crash/crash_reports.dart';
import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/network/api_failure.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/sync/sync_config.dart';
import '../../../core/sync/sync_engine.dart';
import '../../../core/utils/backoff.dart';
import '../../auth/application/session_controller.dart';

part 'sync_controller.g.dart';

/// The states shown in the top bar (docs/ARCHITECTURE.md §3.7).
enum SyncState { signedOut, syncing, synced, offline, needsAttention, signInAgain }

class SyncStatus {
  const SyncStatus({required this.state, this.pending = 0, this.rejected = 0, this.lastSync, this.error, this.progress, this.first = false});
  final SyncState state;
  /// The first download of the pharmacy on this device (it has never synced, or that download was interrupted).
  final bool first;
  final int pending, rejected;
  final String? lastSync, error, progress;

  String get label => switch (state) {
        SyncState.signedOut => 'On this device',
        SyncState.syncing => progress ?? 'Syncing…',
        SyncState.synced => pending > 0 ? '$pending waiting' : 'Synced',
        SyncState.offline => pending > 0 ? 'Offline · $pending waiting' : 'Offline',
        SyncState.needsAttention => 'Needs attention',
        SyncState.signInAgain => 'Sign in again',
      };
}

/// Whether sync runs on its own (timers, after each change). Tests switch it off and call [SyncController.runNow].
@Riverpod(keepAlive: true)
bool syncAutomatically(Ref ref) => true;

@Riverpod(keepAlive: true)
SyncEngine syncEngine(Ref ref) =>
    SyncEngine(dio: ref.watch(dioProvider), db: ref.watch(appDatabaseProvider), cloudUrl: ref.watch(appConfigProvider).cloudUrl);

/// Runs sync: about every 5 s while the app is in use (60 s in the background), straight after every change, at once
/// when the app comes back to the front, and after a failure with growing pauses (1 s doubling to 60 s, ± half).
@Riverpod(keepAlive: true)
class SyncController extends _$SyncController {
  static const active = Duration(seconds: 5), background = Duration(seconds: 60);
  Timer? _timer;
  bool _busy = false, _again = false, _inBackground = false;
  int _failures = 0;

  @override
  SyncStatus build() {
    final session = ref.watch(sessionControllerProvider).value;
    final auto = ref.watch(syncAutomaticallyProvider);
    ref.onDispose(() => _timer?.cancel());
    if (session == null) return const SyncStatus(state: SyncState.signedOut);
    if (auto) {
      final sub = ref.read(recordStoreProvider).saved.listen((_) => runNow());
      final life = AppLifecycleListener(
        onResume: () {
          _inBackground = false;
          runNow();
        },
        onHide: () => _inBackground = true,
      );
      ref.onDispose(() {
        sub.cancel();
        life.dispose();
      });
      Future.microtask(runNow);
    }
    return const SyncStatus(state: SyncState.syncing);
  }

  Future<({int pending, int rejected})> _counts() async {
    final db = ref.read(appDatabaseProvider);
    return (pending: (await db.select(db.outbox).get()).length, rejected: (await db.select(db.rejectedOps).get()).length);
  }

  /// Sync now. A change made while a sync runs gets one more round straight after.
  Future<SyncStatus> runNow() async {
    if (ref.read(sessionControllerProvider).value == null) return state;
    if (_busy) {
      _again = true;
      return state;
    }
    _busy = true;
    _timer?.cancel();
    try {
      final cfg = await SyncConfig.load(ref.read(appDatabaseProvider));
      final first = cfg.lastSync == null || cfg.fullInProgress;
      state = SyncStatus(state: SyncState.syncing, lastSync: cfg.lastSync, pending: state.pending, rejected: state.rejected, first: first);
      await ref.read(syncEngineProvider).run(onProgress: (p) => state = SyncStatus(state: SyncState.syncing, progress: p.label, lastSync: cfg.lastSync, first: first));
      _failures = 0;
      final c = await _counts();
      final done = await SyncConfig.load(ref.read(appDatabaseProvider));
      state = SyncStatus(state: SyncState.synced, pending: c.pending, rejected: c.rejected, lastSync: done.lastSync);
      unawaited(ref.read(crashReportsProvider).flush()); // crash reports waiting on this device go up too
    } on ApiFailure catch (f) {
      _failures++;
      final c = await _counts();
      final cfg = await SyncConfig.load(ref.read(appDatabaseProvider));
      await cfg.copyWith(lastError: f.message).save(ref.read(appDatabaseProvider));
      state = SyncStatus(
        state: switch (f.kind) {
          ApiFailureKind.offline => SyncState.offline,
          ApiFailureKind.signInAgain => SyncState.signInAgain,
          _ => SyncState.needsAttention,
        },
        pending: c.pending, rejected: c.rejected, lastSync: cfg.lastSync, error: f.message,
      );
    } finally {
      _busy = false;
    }
    if (_again && state.state == SyncState.synced) {
      _again = false;
      return runNow();
    }
    _again = false;
    _schedule();
    return state;
  }

  void _schedule() {
    if (!ref.read(syncAutomaticallyProvider) || state.state == SyncState.signInAgain) return;
    final delay = _failures > 0 ? backoff(_failures) : (_inBackground ? background : active);
    _timer = Timer(delay, runNow);
  }

  /// "Download everything again" (Sync & storage).
  Future<SyncStatus> downloadEverything() async {
    await SyncConfig.requestFullPull(ref.read(appDatabaseProvider));
    return runNow();
  }
}
