// When something breaks (src/main.jsx ErrorBoundary): "Something went wrong", the data is safe on this device, Reload
// RxPOS, or download a copy of everything on this device as a last-resort rescue. The error goes to the crash reports.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/record_store.dart';
import '../presentation/export.dart';
import 'crash_reports.dart';
import '../router/app_router.dart' show appRouterProvider;

/// The error the app stopped on (null while all is well); [appRestartProvider] counts reloads.
class AppCrash extends Notifier<Object?> {
  @override
  Object? build() => null;
  void crashed(Object e) => state = e;
  void reload() {
    state = null;
    ref.read(appRestartProvider.notifier).bump();
  }
}

final appCrashProvider = NotifierProvider<AppCrash, Object?>(AppCrash.new);

class AppRestart extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state++;
}

final appRestartProvider = NotifierProvider<AppRestart, int>(AppRestart.new);

/// Is this framework error one that breaks a screen (not a layout warning)?
bool breaksTheScreen(FlutterErrorDetails d) => d.library == 'widgets library' && !'${d.exception}'.contains('overflowed');

/// Wire the app's error hooks: every uncaught error is reported; one that breaks a screen shows [CrashScreen].
void watchErrors(ProviderContainer c) {
  final previous = FlutterError.onError;
  FlutterError.onError = (d) {
    previous?.call(d);
    c.read(crashReportsProvider).report(d.exception, d.stack, breaksTheScreen(d) ? 'crash' : 'error');
    if (breaksTheScreen(d)) c.read(appCrashProvider.notifier).crashed(d.exception);
  };
  WidgetsBinding.instance.platformDispatcher.onError = (e, st) {
    c.read(crashReportsProvider).report(e, st, 'promise');
    return true;
  };
}

/// Everything on this device as JSON: {table: [records]} (src/main.jsx exportData).
Future<String> rescueJson(RecordStore store) async {
  final out = <String, Object?>{};
  for (final t in syncedTables) {
    out[t] = await store.rows(t);
  }
  out['settings'] = await store.settingsRecord();
  return jsonEncode(out);
}

class CrashScreen extends ConsumerWidget {
  const CrashScreen({super.key, required this.error});
  final Object error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // E10 (as src/main.jsx ErrorBoundary): said plainly, with Try again, the dashboard and Send report
              Text('Something went wrong on this page', style: t.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              const Text('Nothing you saved is lost: your sales and stock are kept on this device. Try the page again, or go back to the dashboard.'),
              const SizedBox(height: 16),
              Wrap(spacing: 12, runSpacing: 8, children: [
                FilledButton.icon(onPressed: () => ref.read(appCrashProvider.notifier).reload(), icon: const Icon(Icons.refresh), label: const Text('Try again')),
                OutlinedButton.icon(
                  onPressed: () {
                    ref.read(appCrashProvider.notifier).reload();
                    WidgetsBinding.instance.addPostFrameCallback((_) => ref.read(appRouterProvider).go('/'));
                  },
                  icon: const Icon(Icons.dashboard_outlined),
                  label: const Text('Go to the dashboard'),
                ),
                const _SendReport(),
              ]),
              const SizedBox(height: 12),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text('Details for support', style: t.textTheme.bodySmall),
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: t.colorScheme.surfaceContainerHigh, borderRadius: BorderRadius.circular(8)),
                    child: SelectableText(scrub(error, 300), style: const TextStyle(fontFamily: 'monospace')),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final f = await saveDownload('rxpos-rescue.json', utf8.encode(await rescueJson(ref.read(recordStoreProvider))));
                        messenger.showSnackBar(SnackBar(content: Text('Saved ${f.path}')));
                      },
                      icon: const Icon(Icons.download),
                      label: const Text('Download my data'),
                    ),
                  ),
                ],
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Send report: the crash, again, with this person's go-ahead (it was already queued when it happened)
class _SendReport extends ConsumerStatefulWidget {
  const _SendReport();
  @override
  ConsumerState<_SendReport> createState() => _SendReportState();
}

class _SendReportState extends ConsumerState<_SendReport> {
  bool _sent = false;
  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        key: const Key('send-report'),
        onPressed: _sent
            ? null
            : () {
                final e = ref.read(appCrashProvider);
                if (e != null) ref.read(crashReportsProvider).report(e, null, 'crash');
                ref.read(crashReportsProvider).flush().ignore();
                setState(() => _sent = true);
              },
        icon: const Icon(Icons.send_outlined),
        label: Text(_sent ? 'Report sent, thank you' : 'Send report'),
      );
}
