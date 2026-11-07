// The web app's first start in a browser that ran the classic RxPOS: if that app still has changes it never sent to the
// cloud, they are sent first, by the classic app itself (rxposug.com/classic), before this one is used; nothing is
// lost and nothing is sent twice.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'classic_outbox_stub.dart' if (dart.library.js_interop) 'classic_outbox_web.dart';

/// How many changes the classic app still has to send from this browser (0 off the web).
final classicPendingProvider = FutureProvider<int>((_) => classicPending());

class ClassicGate extends ConsumerWidget {
  const ClassicGate({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.watch(classicPendingProvider).value ?? 0;
    if (n == 0) return child;
    final th = Theme.of(context);
    return Material(
      key: const Key('classic-gate'),
      color: th.scaffoldBackgroundColor,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Icon(Icons.cloud_upload_outlined, size: 48, color: th.colorScheme.primary),
                const SizedBox(height: 12),
                Text('Send your earlier work first', style: th.textTheme.headlineSmall, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(
                  'This browser has $n change${n == 1 ? '' : 's'} saved in the classic RxPOS that ${n == 1 ? 'has' : 'have'} not reached the cloud yet. '
                  'Open the classic RxPOS, sign in and let it sync (the dot turns green), then come back here.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  key: const Key('open-classic'),
                  onPressed: () => launchUrl(Uri.base.resolve('/classic/'), webOnlyWindowName: '_self'),
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Open the classic RxPOS'),
                ),
                const SizedBox(height: 8),
                TextButton(onPressed: () => ref.invalidate(classicPendingProvider), child: const Text('I have synced: check again')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
