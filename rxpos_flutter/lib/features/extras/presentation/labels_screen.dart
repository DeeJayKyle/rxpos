// Barcode Labels (src/pages/Labels.jsx): price and barcode labels for shelves and products, on a thermal label printer
// (one label per page in its size) or A4 label sheets (21 per page). A medicine without a barcode gets an internal one.
import 'dart:typed_data';

import 'package:barcode/barcode.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/search.dart';
import '../../inventory/domain/medicines.dart' show newInternalBarcode;

/// key → (width mm, height mm, label)
const labelSizes = {
  '38x25': (38.0, 25.0, '38 × 25 mm (small)'),
  '50x30': (50.0, 30.0, '50 × 30 mm (standard)'),
  '60x40': (60.0, 40.0, '60 × 40 mm (large)'),
  'a4': (63.5, 38.1, 'A4 sheet, 21 per page'),
};

/// The earliest expiry of a medicine's batches in stock here ('' when none).
String labelExpiry(PharmacyData d, String productId) =>
    d.stock.batchesOf(productId).where((b) => b.qty > 0 && b.expiry.isNotEmpty).map((b) => b.expiry).firstOrNull ?? '';

class LabelsScreen extends ConsumerStatefulWidget {
  const LabelsScreen({super.key});
  @override
  ConsumerState<LabelsScreen> createState() => _LabelsScreenState();
}

class _LabelsScreenState extends ConsumerState<LabelsScreen> {
  final _items = <({String id, int qty})>[];
  final _search = TextEditingController();
  String _q = '', _size = '50x30';
  bool _price = true, _expiry = true, _pharmacy = true;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _add(PharmacyData d, Product p) async {
    if (p.barcode.isEmpty) {
      final store = ref.read(recordStoreProvider);
      final code = newInternalBarcode({for (final x in await store.rows('products')) '${x['barcode'] ?? ''}'});
      final rec = await store.get('products', p.id) ?? p.toRecord();
      await store.update((x) => x.put('products', {...rec, 'barcode': code}));
      if (mounted) say(context, 'Barcode $code created for ${p.name}');
    }
    setState(() {
      if (!_items.any((i) => i.id == p.id)) _items.add((id: p.id, qty: 1));
      _q = '';
      _search.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final matches = _q.trim().isEmpty ? const <Product>[] : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).take(10).toList();
    final items = [for (final i in _items) if (d.byId[i.id] != null) (p: d.byId[i.id]!, qty: i.qty)];
    final labels = [for (final i in items) for (var n = 0; n < i.qty; n++) i.p];
    final sz = labelSizes[_size]!;
    final st = d.settings;

    final chooser = Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Choose medicines', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            key: const Key('labels-search'),
            controller: _search,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search medicine or scan barcode…', isDense: true, border: OutlineInputBorder()),
            onChanged: (v) => setState(() => _q = v),
            onSubmitted: (_) {
              if (matches.isNotEmpty) _add(d, matches.first);
            },
          ),
          for (final p in matches)
            ListTile(dense: true, title: Text(p.name), subtitle: Text('${st.money(p.price)} · ${p.barcode.isEmpty ? 'no barcode yet' : p.barcode}'), onTap: () => _add(d, p)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            OutlinedButton(
              onPressed: () async {
                for (final p in d.products.where((p) => d.stockOf(p.id) > 0).take(60).toList()) {
                  await _add(d, p);
                }
              },
              child: const Text('Add all in-stock items'),
            ),
            if (_items.isNotEmpty) OutlinedButton.icon(onPressed: () => setState(_items.clear), icon: const Icon(Icons.delete_outline), label: const Text('Clear')),
          ]),
          const SizedBox(height: 8),
          if (items.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('Search above to add medicines')),
          for (var n = 0; n < items.length; n++)
            ListTile(
              key: ValueKey('label-${items[n].p.id}'),
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(items[n].p.name),
              subtitle: Text(items[n].p.barcode),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(tooltip: 'Fewer', onPressed: () => setState(() => _items[n] = (id: _items[n].id, qty: (_items[n].qty - 1).clamp(0, 999))), icon: const Icon(Icons.remove)),
                Text('${items[n].qty}'),
                IconButton(tooltip: 'More', onPressed: () => setState(() => _items[n] = (id: _items[n].id, qty: _items[n].qty + 1)), icon: const Icon(Icons.add)),
                IconButton(tooltip: 'Remove', onPressed: () => setState(() => _items.removeAt(n)), icon: const Icon(Icons.close)),
              ]),
            ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            FilterChip(label: const Text('Show price'), selected: _price, onSelected: (v) => setState(() => _price = v)),
            FilterChip(label: const Text('Show expiry'), selected: _expiry, onSelected: (v) => setState(() => _expiry = v)),
            FilterChip(label: const Text('Show pharmacy name'), selected: _pharmacy, onSelected: (v) => setState(() => _pharmacy = v)),
          ]),
        ]),
      ),
    );

    const mm = 3.2; // screen pixels per millimetre in the preview
    final preview = Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Preview', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (labels.isEmpty) const Text('Labels appear here.'),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final p in labels.take(200))
              Container(
                width: sz.$1 * mm,
                height: sz.$2 * mm,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.black26)),
                child: DefaultTextStyle(
                  style: const TextStyle(color: Colors.black, fontSize: 9),
                  child: Column(children: [
                    if (_pharmacy) Text(st.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 7)),
                    Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                    Expanded(child: p.barcode.isEmpty ? const SizedBox() : CustomPaint(size: Size.infinite, painter: _BarcodePainter(p.barcode))),
                    Text(p.barcode, style: const TextStyle(fontSize: 7)),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      if (_price) Flexible(child: Text(st.money(p.price), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800))),
                      if (_expiry && labelExpiry(d, p.id).isNotEmpty) Flexible(child: Text('Exp ${labelExpiry(d, p.id)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 7))),
                    ]),
                  ]),
                ),
              ),
          ]),
        ]),
      ),
    );

    final wide = MediaQuery.sizeOf(context).width >= 900;
    return PageFrame(
      title: 'Barcode Labels',
      subtitle: 'Price and barcode labels for shelves and products',
      scroll: !wide,
      actions: [
        // as wide as its longest size, never wider than a phone
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 300),
          child: IntrinsicWidth(
            child: DropdownButton<String>(
              isExpanded: true,
              value: _size,
              items: [for (final e in labelSizes.entries) DropdownMenuItem(value: e.key, child: Text(e.value.$3, overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _size = v ?? _size),
            ),
          ),
        ),
        FilledButton.icon(
          onPressed: labels.isEmpty ? null : () => Printing.layoutPdf(name: 'labels', onLayout: (_) => labelsPdf(d, labels, size: _size, price: _price, expiry: _expiry, pharmacy: _pharmacy)),
          icon: const Icon(Icons.print),
          label: Text('Print ${labels.length} label${labels.length == 1 ? '' : 's'}'),
        ),
      ],
      child: wide
          ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: SingleChildScrollView(child: chooser)),
              const SizedBox(width: 12),
              Expanded(child: SingleChildScrollView(child: preview)),
            ])
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [chooser, preview]),
    );
  }
}

class _BarcodePainter extends CustomPainter {
  _BarcodePainter(this.data);
  final String data;
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black;
    try {
      for (final e in Barcode.code128().make(data, width: size.width, height: size.height)) {
        if (e is BarcodeBar && e.black) canvas.drawRect(Rect.fromLTWH(e.left, e.top, e.width, e.height), paint);
      }
    } catch (_) {
      // a code the symbology can't draw
    }
  }

  @override
  bool shouldRepaint(_BarcodePainter old) => old.data != data;
}

/// The labels as a PDF: one per page in the label's size, or 21 to an A4 sheet (3 × 7).
Future<Uint8List> labelsPdf(PharmacyData d, List<Product> labels, {String size = '50x30', bool price = true, bool expiry = true, bool pharmacy = true}) {
  final sz = labelSizes[size]!;
  final st = d.settings;
  pw.Widget label(Product p) => pw.Container(
        width: sz.$1 * PdfPageFormat.mm,
        height: sz.$2 * PdfPageFormat.mm,
        padding: const pw.EdgeInsets.all(3),
        child: pw.Column(children: [
          if (pharmacy) pw.Text(st.name, maxLines: 1, style: const pw.TextStyle(fontSize: 6)),
          pw.Text(p.name, maxLines: 1, style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold)),
          pw.Expanded(child: pw.BarcodeWidget(barcode: pw.Barcode.code128(), data: p.barcode.isEmpty ? '-' : p.barcode, textStyle: const pw.TextStyle(fontSize: 6))),
          pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
            if (price) pw.Text(st.money(p.price), style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
            if (expiry && labelExpiry(d, p.id).isNotEmpty) pw.Text('Exp ${labelExpiry(d, p.id)}', style: const pw.TextStyle(fontSize: 6)),
          ]),
        ]),
      );
  final doc = pw.Document();
  if (size == 'a4') {
    for (var i = 0; i < labels.length; i += 21) {
      final page = labels.skip(i).take(21).toList();
      doc.addPage(pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.symmetric(horizontal: 7 * PdfPageFormat.mm, vertical: 15 * PdfPageFormat.mm),
        build: (_) => pw.Wrap(spacing: 2.5 * PdfPageFormat.mm, children: [for (final p in page) label(p)]),
      ));
    }
  } else {
    for (final p in labels) {
      doc.addPage(pw.Page(pageFormat: PdfPageFormat(sz.$1 * PdfPageFormat.mm, sz.$2 * PdfPageFormat.mm), margin: pw.EdgeInsets.zero, build: (_) => label(p)));
    }
  }
  return doc.save();
}
