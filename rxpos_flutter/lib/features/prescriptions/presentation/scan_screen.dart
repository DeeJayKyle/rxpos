import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/network/files.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../auth/application/session_controller.dart';
import '../../sales_pos/application/sale_controller.dart';

const _skip = {'tablet', 'tablets', 'tabs', 'capsule', 'capsules', 'caps', 'syrup', 'suspension', 'cream', 'injection', 'drops'};
List<String> _words(String s) => s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9 ]+'), ' ').split(RegExp(r'\s+')).where((w) => w.length >= 4 && !_skip.contains(w)).toList();
String _digits(String s) => RegExp(r'\d+(\.\d+)?').allMatches(s).map((m) => m[0]).join(' ');

/// A prescribed medicine against the pharmacy's medicines (src/pages/Scan.jsx matchMedicine): the item in stock, or
/// in-stock alternatives with the same generic, or nothing.
({List<Product> inStock, List<Product> alternatives, bool known}) matchMedicine(Map<String, Object?> rx, List<Product> products, double Function(String) stockOf) {
  final ws = _words('${rx['name'] ?? ''}');
  if (ws.isEmpty) return (inStock: const [], alternatives: const [], known: false);
  final strength = _digits('${rx['strength'] ?? rx['name'] ?? ''}');
  double score(Product p) {
    final hay = '${p.name} ${p.generic}'.toLowerCase();
    var s = ws.where(hay.contains).length / ws.length;
    if (strength.isNotEmpty && _digits(p.name).contains(strength.split(' ').first)) s += .5;
    return s;
  }

  final scored = [for (final p in products) (p: p, s: score(p))].where((x) => x.s >= .99).toList()
    ..sort((a, b) => b.s != a.s ? b.s.compareTo(a.s) : stockOf(b.p.id).compareTo(stockOf(a.p.id)));
  final inStock = scored.where((x) => stockOf(x.p.id) > 0).map((x) => x.p).take(4).toList();
  final generics = {for (final x in scored) ?_words(x.p.generic).firstOrNull};
  final alternatives = inStock.isNotEmpty || generics.isEmpty
      ? <Product>[]
      : products.where((p) => stockOf(p.id) > 0 && generics.any((g) => p.generic.toLowerCase().contains(g))).take(4).toList();
  return (inStock: inStock, alternatives: alternatives, known: scored.isNotEmpty);
}

/// Scan a prescription (src/pages/Scan.jsx): a photo is read by AI (typed or handwritten); each medicine is matched to
/// what is on the shelf or what could replace it; add them to a sale, or save as a prescription.
class ScanPrescriptionScreen extends ConsumerStatefulWidget {
  const ScanPrescriptionScreen({super.key});
  @override
  ConsumerState<ScanPrescriptionScreen> createState() => _ScanPrescriptionScreenState();
}

class _ScanPrescriptionScreenState extends ConsumerState<ScanPrescriptionScreen> {
  String _photo = '';
  bool _busy = false;
  Map<String, Object?>? _result;
  final _pick = <int, String>{};

  Future<void> _choose() async {
    final files = await pickFiles(extensions: const ['jpg', 'jpeg', 'png', 'webp'], multiple: false);
    if (files.isEmpty) return;
    try {
      setState(() {
        _photo = shrinkPhoto(files.first.bytes);
        _result = null;
        _pick.clear();
      });
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    }
  }

  Future<void> _read() async {
    setState(() => _busy = true);
    try {
      final r = await ref.read(cloudApiProvider).aiPrescription(_photo);
      final d = await ref.read(pharmacyProvider.future);
      setState(() {
        _result = r;
        _pick.clear();
        for (final (i, m) in ((r['medicines'] as List?) ?? const []).cast<Map>().indexed) {
          final x = matchMedicine(m.cast<String, Object?>(), d.products, d.stockOf);
          final first = x.inStock.firstOrNull ?? x.alternatives.firstOrNull;
          if (first != null) _pick[i] = first.id;
        }
      });
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final r = _result;
    final meds = ((r?['medicines'] as List?) ?? const []).cast<Map>().map((m) => m.cast<String, Object?>()).toList();
    final th = Theme.of(context);
    return PageFrame(
      title: 'Scan a prescription',
      subtitle: 'Snap the prescription. RxPOS reads it, typed or handwritten, and shows what you have on the shelf or what could replace it',
      scroll: true,
      child: Wrap(spacing: 16, runSpacing: 16, children: [
        SizedBox(
          width: 460,
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (_photo.isEmpty) ...[
                  const Icon(Icons.document_scanner_outlined, size: 48),
                  const Text('Lay the prescription flat in good light and fill the frame.', textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  FilledButton.icon(onPressed: _choose, icon: const Icon(Icons.photo_camera_outlined), label: const Text('Take or choose a photo')),
                ] else ...[
                  Image.memory(dataUrlBytes(_photo), height: 360, fit: BoxFit.contain),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: [
                    FilledButton.icon(onPressed: _busy ? null : _read, icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.document_scanner),
                        label: Text(_busy ? 'Reading…' : 'Read prescription')),
                    OutlinedButton.icon(onPressed: () => setState(() {
                      _photo = '';
                      _result = null;
                    }), icon: const Icon(Icons.refresh), label: const Text('New photo')),
                  ]),
                ],
                const SizedBox(height: 8),
                Text('⚠ AI can misread handwriting. A pharmacist must always check the prescription before dispensing.', style: th.textTheme.bodySmall),
              ]),
            ),
          ),
        ),
        SizedBox(
          width: 520,
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('What it says', style: th.textTheme.titleMedium),
                if (r == null) Text(_busy ? 'Reading the prescription…' : 'Take or choose a photo, then press "Read prescription".'),
                if (r != null) ...[
                  Wrap(spacing: 12, children: [
                    for (final k in ['patient', 'prescriber', 'facility', 'date', 'diagnosis'])
                      if ('${r[k] ?? ''}'.isNotEmpty) Text('${k[0].toUpperCase()}${k.substring(1)}: ${r[k]}'),
                  ]),
                  for (final (i, m) in meds.indexed)
                    () {
                      final x = matchMedicine(m, d.products, d.stockOf);
                      final color = x.inStock.isNotEmpty ? Colors.green.shade700 : x.alternatives.isNotEmpty ? Colors.orange.shade800 : th.colorScheme.error;
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Icon(x.inStock.isNotEmpty ? Icons.check_circle : x.alternatives.isNotEmpty ? Icons.warning_amber : Icons.cancel, color: color, size: 18),
                            const SizedBox(width: 6),
                            Expanded(child: Text('${m['name'] ?? ''} ${m['strength'] ?? ''}${m['unclear'] == true ? '  (check)' : ''}', style: const TextStyle(fontWeight: FontWeight.w700))),
                          ]),
                          Text([m['form'], m['dose'], m['frequency'], if ('${m['duration'] ?? ''}'.isNotEmpty) 'for ${m['duration']}', if ('${m['quantity'] ?? ''}'.isNotEmpty) 'qty ${m['quantity']}']
                              .where((y) => y != null && '$y'.isNotEmpty).join(' · '), style: th.textTheme.bodySmall),
                          if (x.inStock.isNotEmpty || x.alternatives.isNotEmpty)
                            DropdownButton<String>(
                              value: _pick[i] ?? '',
                              isExpanded: true,
                              items: [
                                const DropdownMenuItem(value: '', child: Text("Don't add")),
                                for (final p in x.inStock) DropdownMenuItem(value: p.id, child: Text('In stock: ${p.name} · ${formatQty(d.stockOf(p.id))} left · ${st.money(p.price)}')),
                                for (final p in x.alternatives) DropdownMenuItem(value: p.id, child: Text('Alternative: ${p.name} · ${formatQty(d.stockOf(p.id))} left · ${st.money(p.price)}')),
                              ],
                              onChanged: (v) => setState(() => _pick[i] = v ?? ''),
                            )
                          else
                            Text(x.known ? 'Out of stock: no alternative in stock. Add it to the reorder list.' : 'Not in your medicine list.', style: TextStyle(color: th.colorScheme.error)),
                        ]),
                      );
                    }(),
                  if (meds.isEmpty) const Text('No medicines could be read. Try a clearer photo.'),
                  Wrap(spacing: 8, children: [
                    FilledButton.icon(
                      onPressed: () async {
                        final items = [
                          for (final id in _pick.values.where((x) => x.isNotEmpty))
                            if (d.byId[id] case final p?) {'id': p.id, 'name': p.name, 'price': p.price, 'cost': p.cost, 'qty': 1},
                        ];
                        if (items.isEmpty) return say(context, 'Choose at least one medicine', error: true);
                        await ref.read(saleControllerProvider(false).notifier).loadProforma({'items': items, 'customerId': 'walk-in', 'discount': 0});
                        if (context.mounted) context.go('/pos');
                      },
                      icon: const Icon(Icons.shopping_cart_outlined),
                      label: const Text('Add to a sale'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () async {
                        final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                        final text = meds.map((m) => [m['name'], m['strength'], m['form'], m['dose'], m['frequency'], if ('${m['duration'] ?? ''}'.isNotEmpty) 'for ${m['duration']}']
                            .where((y) => y != null && '$y'.isNotEmpty).join(' ')).join('\n');
                        await ref.read(recordStoreProvider).update((dd) {
                          dd.put('prescriptions', {
                            'id': uid(), 'date': today(), 'status': 'Pending', 'doctor': r['prescriber'] ?? '', 'facility': r['facility'] ?? '', 'diagnosis': r['diagnosis'] ?? '',
                            'medications': text, 'notes': 'Read from a photo by AI and checked by $user. ${r['notes'] ?? ''}'.trim(), 'customerId': 'walk-in', 'refillsAllowed': 0, 'refillsUsed': 0,
                          });
                          dd.audit(user, 'Prescription scanned', '${meds.length} medicines', d.branch);
                        });
                        if (context.mounted) say(context, 'Saved in Prescriptions. Attach the patient there.');
                      },
                      icon: const Icon(Icons.assignment_add),
                      label: const Text('Save as prescription'),
                    ),
                  ]),
                ],
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}
