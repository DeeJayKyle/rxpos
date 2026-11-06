// "New version ready · Update" in the top bar (src/App.jsx update-pill), and "RxPOS updated (1.0.N)" once after an
// update. Watching it starts the update checks.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';
import 'app_updates.dart';

class UpdatePill extends ConsumerStatefulWidget {
  const UpdatePill({super.key});

  @override
  ConsumerState<UpdatePill> createState() => _UpdatePillState();
}

class _UpdatePillState extends ConsumerState<UpdatePill> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _justUpdated());
  }

  Future<void> _justUpdated() async {
    try {
      final from = int.tryParse(await ref.read(deviceValueProvider(updatedFromKey).future) ?? '');
      if (from == null) return;
      final now = await ref.read(currentBuildProvider.future);
      await ref.read(deviceValueProvider(updatedFromKey).notifier).set(null);
      if (now != from && mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text('RxPOS updated (1.0.$now)')));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final u = ref.watch(appUpdaterProvider);
    if (u.status != 'ready') return const SizedBox.shrink();
    final narrow = MediaQuery.sizeOf(context).width < 760;
    return Tooltip(
      message: ref.read(updatePlatformProvider) == 'windows' ? 'It also installs by itself when nothing is in progress' : 'Install version ${u.label}',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: narrow
            ? IconButton(key: const Key('update-pill'), onPressed: () => ref.read(appUpdaterProvider.notifier).apply(), icon: const Icon(Icons.system_update_alt))
            : FilledButton.tonalIcon(
                key: const Key('update-pill'),
                onPressed: () => ref.read(appUpdaterProvider.notifier).apply(),
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('New version · Update'),
              ),
      ),
    );
  }
}
