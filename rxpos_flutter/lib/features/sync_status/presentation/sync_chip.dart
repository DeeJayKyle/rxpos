import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../application/sync_controller.dart';

/// The sync status in the top bar; tapping it opens Sync & storage.
class SyncChip extends ConsumerWidget {
  const SyncChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncControllerProvider);
    final (icon, color) = switch (s.state) {
      SyncState.synced => (Icons.cloud_done_outlined, Colors.green),
      SyncState.syncing => (Icons.sync, Theme.of(context).colorScheme.primary),
      SyncState.offline => (Icons.cloud_off_outlined, Colors.orange),
      SyncState.signedOut => (Icons.phone_android, Colors.grey),
      _ => (Icons.error_outline, Colors.red),
    };
    return Tooltip(
      message: s.error ?? (s.lastSync == null ? 'Not synced yet' : 'Last synced ${s.lastSync}'),
      child: ActionChip(
        avatar: Icon(icon, size: 18, color: color),
        label: Text(s.label, overflow: TextOverflow.ellipsis),
        onPressed: () => context.go('/sync'),
      ),
    );
  }
}
