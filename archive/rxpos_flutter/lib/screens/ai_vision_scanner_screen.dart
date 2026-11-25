// Vision AI scanner (POST /api/ai/vision; the web app's components/AiVisionScanner.jsx): a supplier invoice for Add
// Stock or a prescription for the till. Android: the camera (image_picker); Windows, the web and any device: choose an
// image or a PDF (each page becomes a compressed JPEG on the device: core/network/files.dart shrinkPhoto / filePages).
// What was read is matched to this pharmacy's medicines and shown on a verification sheet; nothing is saved or sold
// here: the screen returns the checked lines (Navigator.pop) for Add Stock's own review or the till's cart.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../core/data/pharmacy_providers.dart';
import '../core/entities/product.dart';
import '../core/network/cloud_api.dart';
import '../core/network/files.dart';
import '../features/prescriptions/presentation/scan_screen.dart' show matchMedicine;
import '../features/stock/presentation/invoice_scan.dart' show matchProduct;
import '../theme/rxpos_theme.dart';
import '../widgets/bento_card.dart';
import '../widgets/fefo_batch_badge.dart';

/// One line read off an invoice, as checked by the person
class VisionInvoiceLine {
  VisionInvoiceLine({required this.name, this.productId, this.batch = '', this.expiry = '', this.boxes = 1, this.unitsPerBox = 1, this.unitCost = 0, this.use = true});
  final String name;
  String? productId;
  String batch, expiry;
  int boxes, unitsPerBox;
  double unitCost;
  bool use;
  /// units received: boxes × units per box (Add Stock receives in single units, the cost per unit)
  int get units => (boxes < 1 ? 1 : boxes) * (unitsPerBox < 1 ? 1 : unitsPerBox);
}

/// One medicine read off a prescription
class VisionRxItem {
  VisionRxItem({required this.name, this.productId, this.qty = 1, this.unit = 'tablet', this.use = true});
  final String name;
  String? productId;
  int qty;
  String unit;
  bool use;
}

/// What a prescription scan returns to the till
class VisionPrescription {
  const VisionPrescription({required this.patient, required this.prescriber, required this.items});
  final String patient, prescriber;
  final List<VisionRxItem> items;
}

/// Open the scanner; returns a `List<VisionInvoiceLine>` (mode 'invoice') or a `VisionPrescription` (mode 'prescription'), or
/// null when closed.
Future<Object?> openVisionScanner(BuildContext context, String mode) =>
    Navigator.of(context).push<Object?>(MaterialPageRoute(builder: (_) => AiVisionScannerScreen(mode: mode), fullscreenDialog: true));

class AiVisionScannerScreen extends ConsumerStatefulWidget {
  const AiVisionScannerScreen({super.key, required this.mode});
  final String mode;
  @override
  ConsumerState<AiVisionScannerScreen> createState() => _AiVisionScannerScreenState();
}

class _AiVisionScannerScreenState extends ConsumerState<AiVisionScannerScreen> {
  String _busy = '';
  String _error = '';
  List<VisionInvoiceLine>? _lines;
  List<VisionRxItem>? _items;
  final _patient = TextEditingController(), _prescriber = TextEditingController();
  bool get _invoice => widget.mode == 'invoice';

  @override
  void dispose() {
    _patient.dispose();
    _prescriber.dispose();
    super.dispose();
  }

  Future<void> _camera() async {
    try {
      final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1600, imageQuality: 85);
      if (x == null) return;
      await _read([shrinkPhoto(await x.readAsBytes())]);
    } catch (e) {
      setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _file() async {
    final files = await pickFiles(extensions: _invoice ? const ['jpg', 'jpeg', 'png', 'webp', 'pdf'] : const ['jpg', 'jpeg', 'png', 'webp', 'pdf'], multiple: false);
    if (files.isEmpty) return;
    setState(() => _busy = 'Preparing the image…');
    try {
      final r = await filePages(files.first.name, files.first.bytes);
      await _read(_invoice ? r.pages.take(6).toList() : r.pages.take(1).toList());
    } catch (e) {
      setState(() {
        _error = '$e'.replaceFirst('Exception: ', '');
        _busy = '';
      });
    }
  }

  Future<void> _read(List<String> pages) async {
    setState(() {
      _error = '';
      _busy = 'Reading with AI…';
    });
    try {
      final d = await ref.read(pharmacyProvider.future);
      final api = ref.read(cloudApiProvider);
      if (_invoice) {
        final lines = <VisionInvoiceLine>[];
        for (final (i, page) in pages.indexed) {
          if (pages.length > 1) setState(() => _busy = 'Reading page ${i + 1} of ${pages.length}…');
          final r = await api.post('/api/ai/vision', {'mode': 'invoice', 'image': page}, timeout: const Duration(seconds: 120));
          if (r['error'] != null) throw Exception('${r['error']}');
          for (final l in ((r['lines'] as List?) ?? const []).cast<Map>()) {
            final name = '${l['name'] ?? ''}';
            lines.add(VisionInvoiceLine(
              name: name, productId: matchProduct(name, d.products, d.stockOf)?.id, batch: '${l['batch'] ?? ''}', expiry: '${l['expiry'] ?? ''}',
              boxes: (l['boxes'] as num?)?.toInt() ?? 1, unitsPerBox: (l['unitsPerBox'] as num?)?.toInt() ?? 1, unitCost: (l['unitCostUGX'] as num?)?.toDouble() ?? 0,
            ));
          }
        }
        setState(() => _lines = lines);
      } else {
        final r = await api.post('/api/ai/vision', {'mode': 'prescription', 'image': pages.first}, timeout: const Duration(seconds: 120));
        if (r['error'] != null) throw Exception('${r['error']}');
        _patient.text = '${r['patient'] ?? ''}';
        _prescriber.text = '${r['prescriber'] ?? ''}';
        setState(() => _items = [
              for (final it in ((r['items'] as List?) ?? const []).cast<Map>())
                () {
                  final m = matchMedicine({'name': it['name']}, d.products, d.stockOf);
                  final p = m.inStock.firstOrNull ?? m.alternatives.firstOrNull;
                  return VisionRxItem(name: '${it['name']}', productId: p?.id, qty: (it['qty'] as num?)?.toInt() ?? 1, unit: '${it['unit'] ?? 'tablet'}', use: p != null);
                }(),
            ]);
      }
    } catch (e) {
      setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  void _done() {
    if (_invoice) {
      Navigator.pop(context, _lines!.where((l) => l.use).toList());
    } else {
      Navigator.pop(context, VisionPrescription(patient: _patient.text.trim(), prescriber: _prescriber.text.trim(), items: _items!.where((x) => x.use && x.productId != null).toList()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final t = Theme.of(context);
    final camera = ImagePicker().supportsImageSource(ImageSource.camera);
    final read = _invoice ? _lines != null : _items != null;
    final chosen = _invoice ? (_lines?.where((l) => l.use).length ?? 0) : (_items?.where((x) => x.use && x.productId != null).length ?? 0);
    return Scaffold(
      appBar: AppBar(title: Text(_invoice ? 'Scan Invoice with AI' : 'Scan Prescription (Rx)')),
      body: d == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              if (!read)
                BentoCard(
                  label: _invoice ? 'Supplier invoice or delivery note' : 'Prescription (typed or handwritten)',
                  child: _busy.isNotEmpty
                      ? Row(children: [const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)), const SizedBox(width: 12), Text(_busy)])
                      : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('Take a photo, or choose an image or PDF. A clear, flat, well-lit photo reads best. Reading needs the internet.'),
                          const SizedBox(height: 12),
                          Wrap(spacing: 8, runSpacing: 8, children: [
                            if (camera)
                              FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size(0, kMinTouch)), onPressed: _camera, icon: const Icon(Icons.photo_camera_outlined), label: const Text('Take photo')),
                            OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size(0, kMinTouch)), onPressed: _file, icon: const Icon(Icons.upload_file), label: const Text('Choose image or PDF')),
                          ]),
                        ]),
                ),
              if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error, style: TextStyle(color: t.colorScheme.error))),
              if (_items != null) ...[
                Row(children: [
                  Expanded(child: TextField(controller: _patient, decoration: const InputDecoration(labelText: 'Patient'))),
                  const SizedBox(width: 12),
                  Expanded(child: TextField(controller: _prescriber, decoration: const InputDecoration(labelText: 'Prescriber'))),
                ]),
                const SizedBox(height: 12),
                for (final it in _items!) _rxRow(it, d.products, d),
              ],
              if (_lines != null) for (final l in _lines!) _invoiceRow(l, d.products),
              if (read && (_invoice ? _lines!.isEmpty : _items!.isEmpty)) const Padding(padding: EdgeInsets.all(12), child: Text('Nothing could be read. Try a clearer photo.')),
            ]),
      bottomNavigationBar: !read
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  TextButton(onPressed: () => setState(() => _invoice ? _lines = null : _items = null), child: const Text('Scan again')),
                  const Spacer(),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, kMinTouch)),
                    onPressed: chosen == 0 ? null : _done,
                    icon: const Icon(Icons.check),
                    label: Text(_invoice ? 'Use $chosen line${chosen == 1 ? '' : 's'} in Add Stock' : 'Add $chosen to the sale'),
                  ),
                ]),
              ),
            ),
    );
  }

  Widget _picker(String read, String? id, List<Product> products, ValueChanged<String?> onChanged, {String none = '— not matched —'}) {
    final first = read.toLowerCase().split(' ').first;
    final p = products.where((x) => x.id == id).firstOrNull;
    final options = [?p, ...products.where((x) => x.id != id && (x.name.toLowerCase().contains(first) || x.generic.toLowerCase().contains(first))).take(12)];
    return DropdownButtonFormField<String?>(
      initialValue: id,
      isExpanded: true,
      items: [DropdownMenuItem(value: null, child: Text(none)), for (final x in options) DropdownMenuItem(value: x.id, child: Text(x.name, overflow: TextOverflow.ellipsis))],
      onChanged: onChanged,
    );
  }

  Widget _invoiceRow(VisionInvoiceLine l, List<Product> products) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: BentoCard(
          label: 'Read: ${l.name}',
          trailing: Checkbox(value: l.use, onChanged: (v) => setState(() => l.use = v ?? false)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _picker(l.name, l.productId, products, (v) => setState(() => l.productId = v), none: '— new medicine (add it in Add Stock) —'),
            const SizedBox(height: 8),
            Wrap(spacing: 10, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              _field('Batch', l.batch, (v) => l.batch = v),
              _field('Expiry (YYYY-MM-DD)', l.expiry, (v) => setState(() => l.expiry = v)),
              _field('Boxes', '${l.boxes}', (v) => setState(() => l.boxes = int.tryParse(v) ?? l.boxes), number: true),
              _field('Units / box', '${l.unitsPerBox}', (v) => setState(() => l.unitsPerBox = int.tryParse(v) ?? l.unitsPerBox), number: true),
              _field('Unit cost (UGX)', l.unitCost == 0 ? '' : '${l.unitCost}', (v) => setState(() => l.unitCost = double.tryParse(v) ?? l.unitCost), number: true),
              if (l.expiry.isNotEmpty) FefoBatchBadge(expiry: l.expiry, batch: l.batch),
            ]),
          ]),
        ),
      );

  Widget _rxRow(VisionRxItem it, List<Product> products, PharmacyData d) {
    final p = products.where((x) => x.id == it.productId).firstOrNull;
    final first = p == null ? null : d.stock.batchesOf(p.id).where((b) => b.qty > 0 && b.expiry.isNotEmpty).firstOrNull;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: BentoCard(
        label: 'Read: ${it.name}',
        trailing: Checkbox(value: it.use, onChanged: (v) => setState(() => it.use = v ?? false)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _picker(it.name, it.productId, products, (v) => setState(() => it.productId = v)),
          const SizedBox(height: 8),
          Wrap(spacing: 10, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            _field('Quantity', '${it.qty}', (v) => setState(() => it.qty = int.tryParse(v) ?? it.qty), number: true),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'tablet', label: Text('Tablet')), ButtonSegment(value: 'strip', label: Text('Strip')), ButtonSegment(value: 'box', label: Text('Box'))],
              selected: {it.unit},
              onSelectionChanged: (v) => setState(() => it.unit = v.first),
            ),
            if (p != null) Text('${d.stockOf(p.id).toStringAsFixed(0)} in stock${p.controlled ? ' · CD register' : p.rx ? ' · Rx' : ''}', style: tabular(Theme.of(context).textTheme.bodySmall)),
            if (first != null) FefoBatchBadge(expiry: first.expiry, batch: first.batch),
          ]),
        ]),
      ),
    );
  }

  Widget _field(String label, String value, ValueChanged<String> onChanged, {bool number = false}) => SizedBox(
        width: 150,
        child: TextFormField(
          initialValue: value,
          keyboardType: number ? TextInputType.number : TextInputType.text,
          style: number ? tabular(null) : null,
          decoration: InputDecoration(labelText: label, isDense: true),
          onChanged: onChanged,
        ),
      );
}
