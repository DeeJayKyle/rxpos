// Web sign-in: continue in the browser, or download the Windows / Android app (src/components/AppDownloads.jsx).
// Shown only in the browser; the installed apps never show it.
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/dio_client.dart';
import '../../../core/sync/sync_engine.dart' show syncBase;
import '../domain/app_downloads.dart';

/// The browser's device (Flutter reads the operating system from the browser).
WebDevice webDevice() => switch (defaultTargetPlatform) {
      TargetPlatform.android => WebDevice.android,
      TargetPlatform.windows => WebDevice.windows,
      TargetPlatform.iOS || TargetPlatform.macOS => WebDevice.apple,
      _ => WebDevice.other,
    };

/// The cloud's version files for the Windows and Android apps (null when the cloud can't answer).
final appDownloadsProvider = FutureProvider<({AppDownload windows, AppDownload android})>((ref) async {
  final base = syncBase(ref.watch(appConfigProvider).cloudUrl);
  final dio = ref.watch(dioProvider);
  Future<Map<String, Object?>?> get(String name) async {
    try {
      final r = await dio.get<Object?>('$base/api/app/$name', options: Options(validateStatus: (_) => true));
      return r.statusCode == 200 && r.data is Map ? (r.data as Map).cast<String, Object?>() : null;
    } catch (_) {
      return null;
    }
  }

  return downloadLinks(base, await get('flutter-windows.json'), await get('flutter-android.json'));
});

class AppDownloadsCard extends ConsumerWidget {
  const AppDownloadsCard({super.key, this.device});
  /// for tests; else read from the browser
  final WebDevice? device;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final dev = device ?? webDevice();
    final links = ref.watch(appDownloadsProvider).value ?? downloadLinks('', null, null);
    final small = t.textTheme.bodySmall;
    Widget choice(IconData icon, String title, String text) => Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(border: Border.all(color: t.dividerColor), borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Icon(icon, size: 16), const SizedBox(width: 6), Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)))]),
            const SizedBox(height: 4),
            Text(text, style: small),
          ]),
        );
    Widget button(AppDownload d, bool mine, IconData icon) {
      final sub = [if (mine) 'this device', if (d.version.isNotEmpty) 'v${d.version}', if (d.size.isNotEmpty) d.size].join(' · ');
      final label = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text('Download for ${d.name}'),
        Text(sub.isEmpty ? 'release page' : sub, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
      ]);
      void open() => launchUrl(Uri.parse(d.url), webOnlyWindowName: d.direct ? '_self' : '_blank');
      final style = ButtonStyle(alignment: Alignment.centerLeft, padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 14, vertical: 10)));
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Semantics(
          label: 'Download for ${d.name}${d.version.isEmpty ? '' : ', version ${d.version}'}${d.size.isEmpty ? '' : ', ${d.size}'}',
          button: true,
          excludeSemantics: true,
          child: mine
              ? FilledButton.icon(key: Key('download-${d.name.toLowerCase()}'), style: style, onPressed: open, icon: Icon(icon), label: label)
              : OutlinedButton.icon(key: Key('download-${d.name.toLowerCase()}'), style: style, onPressed: open, icon: Icon(icon), label: label),
        ),
      );
    }

    final win = button(links.windows, dev == WebDevice.windows, Icons.desktop_windows_outlined);
    final and = button(links.android, dev == WebDevice.android, Icons.phone_android);
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Card(
        key: const Key('app-downloads'),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: LayoutBuilder(builder: (context, box) {
            final browser = choice(Icons.public, 'Continue in the browser',
                'Nothing to install. Needs the internet the whole time and keeps nothing on this computer. Good for checking reports or a shared computer.');
            final app = choice(Icons.wifi_off, 'Download the app',
                'For the counter: keeps selling when the internet drops and syncs later, keeps your pharmacy on the device, works with scanners and receipt printers, quick PIN or fingerprint sign-in, and updates itself.');
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
              Row(children: [const Icon(Icons.download, size: 20), const SizedBox(width: 8), Text('Browser or app?', style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))]),
              const SizedBox(height: 10),
              if (box.maxWidth >= 360)
                IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: browser), const SizedBox(width: 10), Expanded(child: app)]))
              else ...[browser, const SizedBox(height: 8), app],
              if (dev == WebDevice.apple)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.info_outline, size: 16),
                    const SizedBox(width: 6),
                    Expanded(child: Text('There is no RxPOS app for iPhone, iPad or Mac yet: use the browser here, or the Windows or Android app on another device.', style: small)),
                  ]),
                ),
              ...(dev == WebDevice.android ? [and, win] : [win, and]),
              const SizedBox(height: 10),
              Text('Same account and data in the app: sign in with this email and password. Android may ask you to allow installing apps from your browser (the app is not from the Play Store).',
                  style: small),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(onPressed: () => launchUrl(Uri.parse(releasesPage), webOnlyWindowName: '_blank'), child: const Text('All downloads and release notes')),
              ),
            ]);
          }),
        ),
      ),
    );
  }
}
