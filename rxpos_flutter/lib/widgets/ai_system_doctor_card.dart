// AI System Doctor (This device, and Sync & diagnostics; the web app's components/AiSystemDoctor.jsx): this device's
// sync queue depth, database health and recent errors, explained by the AI copilot (POST /api/ai/copilot, mode
// "diagnose") in plain English, with one-tap local maintenance. Telemetry carries counts and states only (the cloud
// scrubs it again). Every repair asks first, and none deletes anything that hasn't reached the cloud:
//   compact-snapshots  compact the local database file (SQLite VACUUM: same records, less space)
//   reset-sync-cursor  send what is waiting, then download everything again (adds, never deletes)
//   test-connection    reach the cloud or the pharmacy's hub (/api/health)
//   reload-app         restart syncing now
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/database/app_database.dart';
import '../core/network/cloud_api.dart';
import '../core/presentation/widgets.dart';
import '../features/sync_status/application/sync_controller.dart';
import '../theme/rxpos_theme.dart';
import 'bento_card.dart';
import 'glow_status_chip.dart';

const _repairs = {
  'compact-snapshots': ('Compact local database', Icons.compress),
  'reset-sync-cursor': ('Reset stuck sync', Icons.cloud_sync_outlined),
  'test-connection': ('Test cloud / hub connection', Icons.wifi_tethering),
  'reload-app': ('Restart syncing', Icons.restart_alt),
};

class AiSystemDoctorCard extends ConsumerStatefulWidget {
  const AiSystemDoctorCard({super.key});
  @override
  ConsumerState<AiSystemDoctorCard> createState() => _AiSystemDoctorCardState();
}

class _AiSystemDoctorCardState extends ConsumerState<AiSystemDoctorCard> {
  String _busy = '';
  Map<String, Object?>? _dx;
  String _dbHealth = '';
  String _error = '';

  /// Database health: SQLite's own quick check ('ok' when the file is sound)
  Future<String> _quickCheck() async {
    try {
      final rows = await ref.read(appDatabaseProvider).customSelect('PRAGMA quick_check').get();
      return rows.isEmpty ? 'unknown' : '${rows.first.data.values.first}';
    } catch (e) {
      return 'check failed';
    }
  }

  Future<Map<String, Object?>> _telemetry() async {
    final s = ref.read(syncControllerProvider);
    final health = await _quickCheck();
    if (mounted) setState(() => _dbHealth = health);
    final last = s.lastSync == null ? null : DateTime.tryParse(s.lastSync!);
    return {
      'app': 'flutter',
      'syncState': s.state.name,
      'changesWaiting': s.pending,
      'changesRefused': s.rejected,
      'syncError': s.error,
      'minutesSinceLastSync': last == null ? null : DateTime.now().difference(last).inMinutes,
      'databaseQuickCheck': health,
    };
  }

  Future<void> _diagnose() async {
    setState(() {
      _busy = 'diagnose';
      _error = '';
    });
    try {
      final r = await ref.read(cloudApiProvider).post('/api/ai/copilot', {'mode': 'diagnose', 'telemetry': await _telemetry()});
      if (r['error'] != null) throw Exception('${r['error']}');
      setState(() => _dx = r);
    } catch (e) {
      setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _repair(String id) async {
    setState(() => _busy = id);
    try {
      switch (id) {
        case 'compact-snapshots':
          if (await confirmAction(context, 'Compact the local database?', 'Rewrites this device\'s database file without wasted space. Every record stays; nothing is sent or deleted.', 'Compact')) {
            await ref.read(appDatabaseProvider).customStatement('VACUUM');
            if (mounted) say(context, 'Local database compacted');
          }
        case 'reset-sync-cursor':
          if (await confirmAction(context, 'Reset the sync?', 'Sends anything waiting first, then downloads the whole pharmacy again and adds what is missing. Nothing is deleted. It can take a few minutes on mobile data.', 'Reset sync')) {
            await ref.read(syncControllerProvider.notifier).downloadEverything();
            if (mounted) say(context, 'Sync reset: everything downloaded again');
          }
        case 'test-connection':
          final t0 = DateTime.now();
          final r = await ref.read(cloudApiProvider).get('/api/health');
          if (mounted) say(context, r['ok'] == true ? 'Reached the cloud in ${DateTime.now().difference(t0).inMilliseconds} ms' : 'Reached it, but it reports a problem', error: r['ok'] != true);
        case 'reload-app':
          await ref.read(syncControllerProvider.notifier).runNow();
          if (mounted) say(context, 'Syncing restarted');
      }
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(syncControllerProvider);
    final t = Theme.of(context);
    final suggested = [for (final a in (_dx?['actions'] as List?) ?? const []) '$a'].where(_repairs.containsKey).toList();
    final order = [...suggested, ..._repairs.keys.where((k) => !suggested.contains(k))];
    return BentoCard(
      key: const Key('ai-system-doctor'),
      span: 2,
      icon: Icons.medical_services_outlined,
      label: 'AI System Doctor',
      title: 'This device\'s health',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          GlowStatusChip(label: s.label, status: s.error != null ? 'error' : s.pending > 0 ? 'warn' : 'ok'),
          GlowStatusChip(label: '${s.pending} waiting to send', status: s.pending > 50 ? 'warn' : 'ok', icon: Icons.outbox_outlined),
          if (s.rejected > 0) GlowStatusChip(label: '${s.rejected} refused', status: 'warn', icon: Icons.block),
          if (_dbHealth.isNotEmpty) GlowStatusChip(label: 'Database: $_dbHealth', status: _dbHealth == 'ok' ? 'ok' : 'error', icon: Icons.storage),
        ]),
        const SizedBox(height: 12),
        Text('Checks sync, storage and errors and explains what to do. Only counts and states are sent, never sales or patient details.', style: t.textTheme.bodySmall),
        const SizedBox(height: 10),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size(0, kMinTouch)),
          onPressed: _busy.isNotEmpty ? null : _diagnose,
          icon: _busy == 'diagnose' ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
          label: const Text('Diagnose this device'),
        ),
        if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, style: TextStyle(color: t.colorScheme.error))),
        if (_dx != null)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: t.colorScheme.surfaceContainerLow, borderRadius: BorderRadius.circular(14), border: Border.all(color: t.colorScheme.outlineVariant)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${_dx!['summary'] ?? ''}'),
              for (final c in (_dx!['causes'] as List?) ?? const []) Text('• $c', style: t.textTheme.bodySmall),
            ]),
          ),
        const SizedBox(height: 12),
        Text(suggested.isEmpty ? 'ONE-TAP REPAIRS' : 'ONE-TAP REPAIRS · SUGGESTED FIRST', style: microLabel(context)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final id in order)
            (suggested.contains(id) ? FilledButton.tonalIcon : OutlinedButton.icon)(
              style: ButtonStyle(minimumSize: const WidgetStatePropertyAll(Size(0, kMinTouch))),
              onPressed: _busy.isNotEmpty ? null : () => _repair(id),
              icon: _busy == id ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(_repairs[id]!.$2),
              label: Text(_repairs[id]!.$1),
            ),
        ]),
      ]),
    );
  }
}
