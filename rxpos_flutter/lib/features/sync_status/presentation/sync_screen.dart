import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/database/app_database.dart';
import '../../auth/application/session_controller.dart';
import '../application/sync_controller.dart';

@immutable
class _Rejected {
  const _Rejected(this.rows);
  final List<RejectedRow> rows;
}

final _rejectedProvider = StreamProvider.autoDispose<_Rejected>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return db.select(db.rejectedOps).watch().map(_Rejected.new);
});

/// Sync & storage: the status, changes waiting, changes the cloud refused (kept for review), "Download everything
/// again" and signing out.
class SyncScreen extends ConsumerWidget {
  const SyncScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncControllerProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final rejected = ref.watch(_rejectedProvider).value?.rows ?? const [];
    final th = Theme.of(context);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Sync & storage', style: th.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.label, style: th.textTheme.titleLarge),
            if (s.error != null) Text(s.error!, style: TextStyle(color: th.colorScheme.error)),
            Text('Last synced: ${s.lastSync ?? 'not yet'}'),
            Text('Changes waiting to be sent: ${s.pending}'),
            if (session != null) Text('Signed in as ${session.userName} (${session.role}) at ${session.pharmacy}'),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton.icon(onPressed: () => ref.read(syncControllerProvider.notifier).runNow(), icon: const Icon(Icons.sync), label: const Text('Sync now')),
              OutlinedButton.icon(
                onPressed: () => ref.read(syncControllerProvider.notifier).downloadEverything(),
                icon: const Icon(Icons.cloud_download_outlined), label: const Text('Download everything again'),
              ),
              TextButton.icon(onPressed: () => ref.read(sessionControllerProvider.notifier).signOut(), icon: const Icon(Icons.logout), label: const Text('Sign out')),
            ]),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Changes the cloud refused (${rejected.length})', style: th.textTheme.titleMedium),
            const Text('They are kept here for someone to review; nothing is dropped. Usually: no permission for that change.'),
            for (final r in rejected) ListTile(dense: true, title: Text('${r.t} · ${r.id}'), subtitle: Text('${r.at} · ${r.reason ?? ''}')),
            if (rejected.isNotEmpty)
              TextButton(onPressed: () async {
                final db = ref.read(appDatabaseProvider);
                await db.delete(db.rejectedOps).go();
              }, child: const Text('Reviewed: clear the list')),
          ]),
        ),
      ),
    ]);
  }
}
