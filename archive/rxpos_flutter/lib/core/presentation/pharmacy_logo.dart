// The pharmacy's logo (1.13, E6; src/logo.jsx pharmacyLogo): uploaded in Settings → Pharmacy (made 320 px, kept as a
// file in the pharmacy's cloud: its path in the settings' `logo`), else the one the RxPOS provider set; shown at the
// top of the menu, on the sign-in page, on printed receipts and invoices, and on the customer display.
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;

import '../../features/auth/application/session_controller.dart';
import '../data/pharmacy_providers.dart';
import '../data/record_store.dart';
import '../network/cloud_api.dart';
import '../network/dio_client.dart';
import '../network/files.dart';
import 'widgets.dart';

/// A file path of the pharmacy's cloud as a link (only http(s)), or null.
String? cloudFileUrl(CloudApi api, Object? path) {
  final s = '${path ?? ''}';
  if (s.isEmpty) return null;
  final u = Uri.tryParse(api.fileUrl(s));
  return u != null && (u.scheme == 'http' || u.scheme == 'https') ? u.toString() : null;
}

// ---------- the pharmacy's logo (1.13, E6; src/photo.jsx pharmacyLogo) ----------

/// The logo to show (as src/logo.jsx): the one the RxPOS provider set (a data: URL in the licence's branding), else
/// the one uploaded in Settings → Pharmacy (a file in the pharmacy's cloud, as an http(s) link), else null (the RxPOS mark).
final pharmacyLogoProvider = Provider.autoDispose<String?>((ref) {
  final b = '${ref.watch(brandingProvider)?['logo'] ?? ''}';
  if (b.startsWith('data:image')) return b;
  return cloudFileUrl(ref.watch(cloudApiProvider), ref.watch(settingsProvider).value?.raw['logo']);
});

/// The logo's bytes for printed receipts and invoices; kept in [pharmacyLogoBytes] once read.
Uint8List? pharmacyLogoBytes;
final pharmacyLogoBytesProvider = FutureProvider.autoDispose<Uint8List?>((ref) async {
  final src = ref.watch(pharmacyLogoProvider);
  Uint8List? out;
  try {
    if (src == null) {
      out = null;
    } else if (src.startsWith('data:')) {
      out = dataUrlBytes(src);
    } else {
      final r = await ref.read(dioProvider).get<List<int>>(src, options: Options(responseType: ResponseType.bytes));
      out = r.data == null ? null : Uint8List.fromList(r.data!);
    }
  } catch (_) {
    out = null;
  }
  return pharmacyLogoBytes = out;
});

/// The pharmacy's logo at [size], or [fallback] when there is none (or it can't be shown).
class PharmacyLogo extends ConsumerWidget {
  const PharmacyLogo({super.key, this.size = 34, required this.fallback});
  final double size;
  final Widget fallback;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(pharmacyLogoBytesProvider); // read once, for the printed receipts
    final src = ref.watch(pharmacyLogoProvider);
    if (src == null) return fallback;
    final img = src.startsWith('data:')
        ? Image.memory(dataUrlBytes(src), width: size, height: size, fit: BoxFit.contain, errorBuilder: (_, _, _) => fallback)
        : Image.network(src, width: size, height: size, fit: BoxFit.contain, errorBuilder: (_, _, _) => fallback);
    return ClipRRect(key: const Key('pharmacy-logo'), borderRadius: BorderRadius.circular(size * .22), child: img);
  }
}

/// Settings → Pharmacy: upload the logo (made 320 px, kept in the pharmacy's cloud), saved at once for every device.
class LogoField extends ConsumerStatefulWidget {
  const LogoField({super.key});
  @override
  ConsumerState<LogoField> createState() => _LogoFieldState();
}

class _LogoFieldState extends ConsumerState<LogoField> {
  bool _busy = false;
  Future<void> _save(String path, String what) async {
    final store = ref.read(recordStoreProvider);
    final me = await ref.read(sessionControllerProvider.future);
    await store.update((d) async {
      d.saveSettings({...await store.settingsRecord(), 'logo': path});
      d.audit(me?.userName ?? '', 'Logo changed', what);
    });
    if (mounted) say(context, path.isEmpty ? 'Logo removed' : 'Logo saved. Every device shows it after its next sync.');
  }

  @override
  Widget build(BuildContext context) {
    final own = '${ref.watch(settingsProvider).value?.raw['logo'] ?? ''}';
    return Row(children: [
      SizedBox.square(dimension: 72, child: PharmacyLogo(size: 72, fallback: Container(alignment: Alignment.center, color: Theme.of(context).colorScheme.surfaceContainerHighest, child: const Text('RxPOS')))),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Logo', style: TextStyle(fontWeight: FontWeight.w700)),
          Text('Shown on the sign-in page, at the top of the menu, on receipts and invoices, and on the customer display.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          Wrap(spacing: 8, children: [
            OutlinedButton.icon(
              key: const Key('logo-upload'),
              onPressed: _busy ? null : () async {
                final f = await pickFiles(extensions: const ['jpg', 'jpeg', 'png', 'webp'], multiple: false);
                if (f.isEmpty) return;
                setState(() => _busy = true);
                try {
                  final decoded = img.decodeImage(f.first.bytes);
                  if (decoded == null) throw Exception('That file is not a picture');
                  final long = decoded.width > decoded.height ? decoded.width : decoded.height;
                  final small = long > 320 ? img.copyResize(decoded, width: (decoded.width * 320 / long).round(), height: (decoded.height * 320 / long).round()) : decoded;
                  final a = await uploadFile(ref.read(cloudApiProvider), Uint8List.fromList(img.encodePng(small)), 'pharmacy-logo.png', type: 'image/png');
                  await _save('${a['path']}', 'new logo uploaded');
                } catch (e) {
                  if (context.mounted) say(context, 'The logo could not be saved: $e', error: true);
                } finally {
                  if (mounted) setState(() => _busy = false);
                }
              },
              icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
              label: Text(_busy ? 'Saving…' : 'Upload logo'),
            ),
            if (own.isNotEmpty && !_busy) TextButton.icon(key: const Key('logo-remove'), onPressed: () => _save('', 'logo removed'), icon: const Icon(Icons.delete_outline, size: 18), label: const Text('Remove')),
          ]),
        ]),
      ),
    ]);
  }
}
