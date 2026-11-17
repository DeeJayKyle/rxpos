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
    final pending = ref.watch(classicPendingProvider);
    final th = Theme.of(context);
    // a read error is not "nothing waiting": the classic app's unsent work could be lost, so ask to check again
    if (pending.hasError) return _couldNotCheck(context, ref, th, retrying: pending.isLoading);
    final n = pending.value ?? 0;
    if (n == 0) return child;
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

  Widget _couldNotCheck(BuildContext context, WidgetRef ref, ThemeData th, {required bool retrying}) => Material(
        key: const Key('classic-gate-error'),
        color: th.scaffoldBackgroundColor,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Icon(Icons.error_outline, size: 48, color: th.colorScheme.error),
                  const SizedBox(height: 12),
                  Text("Couldn't check for earlier work", style: th.textTheme.headlineSmall, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  const Text(
                    'This browser may still hold changes from the classic RxPOS that have not reached the cloud, '
                    "but they couldn't be read just now. Try again.",
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    key: const Key('classic-retry'),
                    onPressed: retrying ? null : () => ref.invalidate(classicPendingProvider),
                    icon: const Icon(Icons.refresh),
                    label: Text(retrying ? 'Checking…' : 'Retry'),
                  ),
                ]),
              ),
            ),
          ),
        ),
      );
}
