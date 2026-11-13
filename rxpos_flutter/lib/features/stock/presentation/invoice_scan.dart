// Scanning supplier invoices into Add Stock (src/invoiceScan.js, src/invoicedates.js, the InvoiceScanner of
// src/pages/Purchases.jsx): photos or PDFs → page images → kept in the pharmacy's cloud → two AI models read every page
// (/api/ai/invoice) → lines matched to this pharmacy's medicines → filled in now, or one delivery draft per invoice
// waiting for review. Nothing reaches stock until someone checks it and presses "Receive stock".
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/party.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/network/files.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/packs.dart';
import '../../auth/application/session_controller.dart';
import '../domain/stock_form.dart';

const _months = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12};
String _lastDay(int y, int m) => localDate(DateTime(y, m + 1, 0));
int _year4(String y) => y.length == 2 ? 2000 + int.parse(y) : int.parse(y);
String _p2(Object v) => '$v'.padLeft(2, '0');

/// Dates as written on invoices → YYYY-MM-DD ('' when it can't be read); a month and year means the month's end.
String normDate(Object? v, {bool endOfMonth = true}) {
  final s = '${v ?? ''}'.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  if (s.isEmpty) return '';
  var m = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})').firstMatch(s);
  if (m != null) return '${m[1]}-${_p2(m[2]!)}-${_p2(m[3]!)}';
  m = RegExp(r'^(\d{4})[/.-](\d{1,2})$').firstMatch(s);
  if (m != null) return endOfMonth ? _lastDay(int.parse(m[1]!), int.parse(m[2]!)) : '${m[1]}-${_p2(m[2]!)}-01';
  m = RegExp(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$').firstMatch(s);
  if (m != null) return '${_year4(m[3]!)}-${_p2(m[2]!)}-${_p2(m[1]!)}';
  m = RegExp(r'^(\d{1,2})[/.-](\d{2,4})$').firstMatch(s);
  if (m != null && int.parse(m[1]!) >= 1 && int.parse(m[1]!) <= 12) return _lastDay(_year4(m[2]!), int.parse(m[1]!));
  m = RegExp(r'^(?:(\d{1,2})[ /.-]?)?([a-z]{3,9})[ /.,-]*(\d{2,4})$').firstMatch(s);
  if (m != null) {
    final mo = _months[m[2]!.substring(0, min(4, m[2]!.length))] ?? _months[m[2]!.substring(0, 3)];
    if (mo != null) return m[1] != null ? '${_year4(m[3]!)}-${_p2(mo)}-${_p2(m[1]!)}' : _lastDay(_year4(m[3]!), mo);
  }
  final d = DateTime.tryParse('${v ?? ''}');
  return d == null ? '' : localDate(d);
}

const _stop = {'tablet', 'tablets', 'tabs', 'tab', 'capsule', 'capsules', 'caps', 'cap', 'syrup', 'suspension', 'susp', 'cream', 'injection', 'inj', 'drops', 'the', 'and',
  'with', 'for', 'pack', 'pcs', 'box', 'bottle', 'btl'};
List<String> _tokens(String s) => s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9.]+'), ' ').split(' ').where((w) => w.isNotEmpty && !_stop.contains(w)).toList();
List<String> _strengths(String s) => RegExp(r'\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)').allMatches(s.toLowerCase()).map((m) => m[0]!.replaceAll(RegExp(r'\s+'), '')).toList();

/// Best match for a name read off an invoice among this pharmacy's medicines (null when nothing is close).
Product? matchProduct(String name, Iterable<Product> products, double Function(String) stockOf) {
  final want = _tokens(name);
  if (want.isEmpty) return null;
  final wantStr = _strengths(name);
  final words = want.where((w) => !RegExp(r'^\d').hasMatch(w)).toList();
  if (words.isEmpty) return null;
  Product? best;
  var bestScore = 0.0;
  for (final p in products) {
    final have = _tokens('${p.name} ${p.generic}').toSet();
    final hit = words.where((w) => have.contains(w) || have.any((h) => h.length >= 5 && (h.startsWith(w) || w.startsWith(h)))).length / words.length;
    if (hit < 0.5) continue;
    final pStr = _strengths(p.name);
    final strengthOk = wantStr.isEmpty || pStr.isEmpty || wantStr.any(pStr.contains);
    final score = hit + (strengthOk ? 0.3 : -0.6) + (_tokens(p.name).firstOrNull == want.first ? 0.2 : 0) + (stockOf(p.id) > 0 ? 0.05 : 0);
    if (best == null || score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best != null && bestScore >= 0.75 ? best : null;
}

/// The supplier named on the invoice → one of the pharmacy's suppliers (or null).
Supplier? matchSupplier(String name, Iterable<Supplier> suppliers) {
  final want = _tokens(name).where((w) => !const {'ltd', 'limited', 'co', 'company', 'u', 'uganda', 'pharma', 'pharmaceuticals', 'pharmacy'}.contains(w)).toList();
  if (want.isEmpty) return null;
  Supplier? best;
  var bestScore = 0.0;
  for (final s in suppliers) {
    final have = _tokens(s.name).toSet();
    final score = want.where(have.contains).length / want.length;
    if (score >= 0.6 && (best == null || score > bestScore)) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

/// Read every page and merge them into one invoice.
Future<Map<String, Object?>> readInvoice(CloudApi api, List<String> pages, {void Function(int n, int of)? onPage}) async {
  final merged = <String, Object?>{'supplier': '', 'invoiceNo': '', 'date': '', 'total': 0.0, 'items': <Map<String, Object?>>[], 'linesTotal': 0.0, 'readings': 0};
  for (var i = 0; i < pages.length; i++) {
    onPage?.call(i + 1, pages.length);
    final r = await api.aiInvoice(pages[i]);
    for (final k in ['supplier', 'invoiceNo', 'date']) {
      if ('${merged[k]}'.isEmpty) merged[k] = '${r[k] ?? ''}';
    }
    if (_n(merged['total']) == 0) merged['total'] = _n(r['total']);
    (merged['items'] as List).addAll([for (final it in ((r['items'] as List?) ?? const []).cast<Map>()) {...it.cast<String, Object?>(), 'page': i + 1}]);
    merged['linesTotal'] = _n(merged['linesTotal']) + _n(r['linesTotal']);
    merged['readings'] = max(_n(merged['readings']).round(), _n(r['readings'] ?? 1).round());
  }
  final total = _n(merged['total']), lt = _n(merged['linesTotal']);
  merged['totalMatches'] = total == 0 || (lt - total).abs() <= max(1, total * 0.01);
  return merged;
}

/// "quantity (other reading 24), batch": what to check on a scanned line, in plain words.
String checkTextOf(Map read) {
  final check = ((read['check'] as List?) ?? const []).cast<Object?>();
  if (check.isEmpty) return read['unclear'] == true ? 'hard to read' : '';
  const field = {'qty': 'quantity', 'unitCost': 'cost', 'batch': 'batch', 'expiry': 'expiry', 'name': 'medicine name'};
  final alt = (read['alt'] as Map?) ?? const {};
  return check.map((f) => '${field[f] ?? f}${alt[f] != null && '${alt[f]}'.isNotEmpty ? ' (other reading: ${alt[f]})' : ''}').join(', ');
}

/// How many lines of a scanned delivery still need a person's eye.
int toCheck(List<Line> ls) => ls.where((l) {
      final r = l['read'] as Map?;
      return r != null && ('${l['productId'] ?? ''}'.isEmpty || ((r['check'] as List?)?.isNotEmpty ?? false) || r['unclear'] == true);
    }).length;

/// What was read off an invoice → Add Stock lines (medicines matched, packs or units chosen by the nearest cost,
/// costs and prices worked out) and a summary.
({Supplier? sup, List<Line> lines, Map<String, Object?> summary, String invoice, String date}) fromScan(Map<String, Object?> r, PharmacyData d, Object? markup, String user) {
  final s = d.settings;
  final pf = priceAt(markup, s);
  final sup = matchSupplier('${r['supplier'] ?? ''}', d.suppliers);
  final out = <Line>[];
  for (final it in ((r['items'] as List?) ?? const []).cast<Map>()) {
    final p = matchProduct('${it['name'] ?? ''}', d.products, d.stockOf);
    final qty = _n(it['qty']) > 0 ? _n(it['qty']) : 1.0;
    final read = <String, Object?>{
      'name': it['name'], 'unclear': it['unclear'] == true, 'matched': p != null,
      if ((it['check'] as List?)?.isNotEmpty ?? false) 'check': it['check'], if (it['alt'] != null) 'alt': it['alt'], if (it['why'] != null) 'why': it['why'],
      if (it['note'] != null) 'note': it['note'], if (it['page'] != null) 'page': it['page'],
    };
    final base = {'qty': numOrBlank(qty), 'batch': '${it['batch'] ?? ''}', 'expiry': normDate(it['expiry']), 'read': read};
    final cost = _n(it['unitCost']) > 0 ? _n(it['unitCost']) : (_n(it['lineTotal']) > 0 ? _n(it['lineTotal']) / qty : 0.0);
    var size = 0.0;
    Pack? k;
    if (p != null && cost > 0 && p.cost > 0) {
      size = [1.0, ...packsOf(p).map((k) => k.size)].reduce((b, z) => (log(cost / z / p.cost)).abs() < (log(cost / b / p.cost)).abs() ? z : b);
      k = size > 1 ? packsOf(p).where((x) => x.size == size).firstOrNull : null;
    }
    final l = p != null
        ? lineFor(p, s, extra: {...base, if (size > 0) 'recvPack': k?.name ?? '', if (size > 0) 'recvSize': k != null ? size : 1}, markup: markup)
        : {...blankLine(), ...base, 'name': '${it['name'] ?? ''}'};
    out.add(_n(it['lineTotal']) > 0 && _n(it['unitCost']) == 0 ? editLine(l, {'total': numOrBlank(it['lineTotal'])}, pf) : editLine(l, {'cost': numOrBlank(cost)}, pf));
  }
  final summary = <String, Object?>{
    'supplier': r['supplier'], 'supplierMatched': sup != null, 'invoiceNo': r['invoiceNo'], 'total': r['total'], 'linesTotal': r['linesTotal'] ?? 0,
    'totalMatches': r['totalMatches'] != false, 'readings': r['readings'] ?? 1, 'lines': out.length, 'unmatched': out.where((l) => '${l['productId']}'.isEmpty).length,
    'unclear': toCheck(out), 'readAt': DateTime.now().toUtc().toIso8601String(), 'readBy': user,
  };
  return (sup: sup, lines: out, summary: summary, invoice: '${r['invoiceNo'] ?? ''}', date: normDate(r['date'], endOfMonth: false));
}

/// Put what was read on the Add Stock panel (nothing is saved until "Receive stock").
({Map<String, Object?> form, Map<String, Object?> summary}) applyScan(Map<String, Object?> r, Map<String, Object?> form, PharmacyData d, {String user = ''}) {
  final x = fromScan(r, d, form['markup'], user);
  final keep = lines(form).where((l) => '${l['productId'] ?? ''}'.isNotEmpty).toList();
  return (
    form: {
      ...form, 'supplierId': x.sup?.id ?? form['supplierId'], 'invoice': x.invoice.isEmpty ? form['invoice'] : x.invoice, 'date': x.date.isEmpty ? form['date'] : x.date,
      'lines': keep.isEmpty && x.lines.isEmpty ? [blankLine()] : [...keep, ...x.lines],
    },
    summary: x.summary,
  );
}

/// Several invoices read in one go: each becomes a delivery draft waiting for review.
Future<List<Map<String, Object?>>> scansToDrafts(RecordStore store, List<({Map<String, Object?> r, List<String> pagePaths})> results, PharmacyData d,
    {required String userId, required String userName}) async {
  final recs = [
    for (final x in results)
      () {
        final f = fromScan(x.r, d, d.settings.retailMarkup, userName);
        final form = {...blankForm(d.settings), 'supplierId': f.sup?.id ?? '', 'invoice': f.invoice, 'date': f.date.isEmpty ? today() : f.date, 'lines': f.lines};
        final sum = f.lines.fold<double>(0, (a, l) => a + ('${l['productId']}'.isNotEmpty ? lineTotal(l) : _n(l['total'])));
        return deliveryDraft(form, id: uid(), userId: userId, userName: userName, branchId: d.branch, supplierName: f.sup?.name ?? '${x.r['supplier'] ?? ''}', total: sum,
            scan: {...f.summary, 'pages': x.pagePaths});
      }(),
  ];
  await store.update((dd) {
    for (final r in recs) {
      dd.put('drafts', r);
    }
    dd.audit(userName, 'Invoices scanned',
        '${recs.length} invoice${recs.length > 1 ? 's' : ''} read into delivery drafts for review: ${recs.map((x) => '${'${x['title']}'.replaceFirst('Scanned: ', '')}${'${x['invoice']}'.isEmpty ? '' : ' ${x['invoice']}'} (${x['count']} lines, ${(x['scan'] as Map)['unclear']} to check)').join('; ')}',
        d.branch);
  });
  return recs;
}

/// The outcome of the scanner: one invoice read to fill in now, or drafts saved.
typedef ScanOutcome = ({bool drafts, Map<String, Object?>? result, List<String> pagePaths, List<String> pageImages});

/// The scanner: choose photos or PDFs (one or more invoices, each with its pages), then read them.
Future<ScanOutcome?> scanInvoices(BuildContext context, WidgetRef ref) => showAppDialog<ScanOutcome>(context: context, barrierDismissible: false, builder: (_) => const _Scanner());

class _Invoice {
  _Invoice(this.pages, {this.note = ''});
  final String id = uid();
  final List<String> pages;
  String note, status = '', error = '';
}

class _Scanner extends ConsumerStatefulWidget {
  const _Scanner();
  @override
  ConsumerState<_Scanner> createState() => _ScannerState();
}

class _ScannerState extends ConsumerState<_Scanner> {
  final _invoices = <_Invoice>[];
  int _cur = 0;
  String _busy = '';

  Future<void> _add({bool asNew = false}) async {
    final files = await pickFiles();
    if (files.isEmpty) return;
    setState(() => _busy = 'Opening…');
    try {
      final pdfs = files.where((f) => f.name.toLowerCase().endsWith('.pdf')).toList(), photos = files.where((f) => !f.name.toLowerCase().endsWith('.pdf')).toList();
      for (final f in pdfs) {
        final r = await filePages(f.name, f.bytes);
        _invoices.add(_Invoice(r.pages, note: r.total > r.pages.length ? 'Only the first ${r.pages.length} of ${r.total} pages will be read.' : ''));
      }
      if (photos.isNotEmpty) {
        final pages = [for (final f in photos) ...(await filePages(f.name, f.bytes)).pages];
        if (!asNew && _invoices.length > _cur && pdfs.isEmpty) {
          _invoices[_cur].pages.addAll(pages);
        } else {
          _invoices.add(_Invoice(pages));
        }
      }
      _cur = pdfs.isNotEmpty || asNew || _invoices.length <= _cur ? _invoices.length - 1 : _cur;
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<({Map<String, Object?> r, List<String> pagePaths})> _read(_Invoice inv, int k) async {
    final api = ref.read(cloudApiProvider);
    final label = _invoices.length > 1 ? 'Invoice ${k + 1} of ${_invoices.length}: ' : '';
    setState(() => _busy = '${label}saving the pages…');
    final paths = <String>[];
    for (var n = 0; n < inv.pages.length; n++) {
      paths.add('${(await uploadFile(api, dataUrlBytes(inv.pages[n]), 'invoice-${today()}-${n + 1}.jpg', type: 'image/jpeg'))['path']}');
    }
    final r = await readInvoice(api, inv.pages, onPage: (n, of) => setState(() => _busy = '${label}reading${of > 1 ? ' page $n of $of' : ''} with two AI readings…'));
    if (((r['items'] as List?) ?? const []).isEmpty) throw Exception('No medicine lines could be read. Try a sharper, straighter photo in good light.');
    return (r: r, pagePaths: paths);
  }

  Future<void> _fillNow() async {
    try {
      final x = await _read(_invoices.first, 0);
      if (mounted) Navigator.pop(context, (drafts: false, result: x.r, pagePaths: x.pagePaths, pageImages: _invoices.first.pages));
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _toDrafts() async {
    final done = <({Map<String, Object?> r, List<String> pagePaths})>[];
    for (var k = 0; k < _invoices.length; k++) {
      final inv = _invoices[k];
      if (inv.status == 'saved') continue;
      try {
        done.add(await _read(inv, k));
        inv.status = 'read';
        inv.error = '';
      } catch (e) {
        inv.status = 'failed';
        inv.error = '$e'.replaceFirst('Exception: ', '');
      }
    }
    if (!mounted) return;
    setState(() => _busy = '');
    if (done.isEmpty) return say(context, 'No invoice could be read. See the reason under each one.', error: true);
    try {
      final d = await ref.read(pharmacyProvider.future);
      final session = await ref.read(sessionControllerProvider.future);
      final recs = await scansToDrafts(ref.read(recordStoreProvider), done, d, userId: session?.userId ?? '', userName: session?.userName ?? '');
      if (!mounted) return;
      final check = recs.fold<int>(0, (a, x) => a + ((x['scan'] as Map)['unclear'] as int));
      say(context, '${recs.length} invoice${recs.length > 1 ? 's' : ''} read and saved as draft${recs.length > 1 ? 's' : ''} for review${check > 0 ? ' ($check line${check > 1 ? 's' : ''} to check)' : ''}. Purchase History → Drafts.');
      Navigator.pop(context, (drafts: true, result: null, pagePaths: const <String>[], pageImages: const <String>[]));
    } catch (e) {
      say(context, 'The drafts were NOT saved: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pageCount = _invoices.fold<int>(0, (a, x) => a + x.pages.length);
    return AlertDialog(
      title: const Text('Scan supplier invoices'),
      content: SizedBox(
        width: 640,
        child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Photograph each invoice or delivery note (typed or handwritten), or choose images or PDFs. Two AI models read every page and are cross-checked: '
              'each invoice is saved as a delivery draft waiting for review, with the lines to check marked. Nothing goes into stock until someone checks it and presses Receive stock.'),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            OutlinedButton.icon(onPressed: _busy.isNotEmpty ? null : () => _add(), icon: const Icon(Icons.upload_file), label: Text(_invoices.isEmpty ? 'Choose images or PDFs' : 'Add pages to this invoice')),
            if (_invoices.isNotEmpty) OutlinedButton.icon(onPressed: _busy.isNotEmpty ? null : () => _add(asNew: true), icon: const Icon(Icons.add), label: const Text('Another invoice')),
          ]),
          const Text('Photos chosen together are pages of the same invoice; use Another invoice to start the next one. Flat, straight, in good light, the whole page in the picture.',
              style: TextStyle(fontSize: 12)),
          for (final (k, inv) in _invoices.indexed)
            Card(
              color: k == _cur ? Theme.of(context).colorScheme.secondaryContainer : null,
              child: InkWell(
                onTap: () => setState(() => _cur = k),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('Invoice ${k + 1} · ${inv.pages.length} page${inv.pages.length > 1 ? 's' : ''}', style: const TextStyle(fontWeight: FontWeight.w700))),
                      if (inv.status == 'failed') Text(inv.error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      if (inv.status == 'read') const Text('read ✓'),
                      TextButton(onPressed: _busy.isNotEmpty ? null : () => setState(() {
                        _invoices.remove(inv);
                        _cur = 0;
                      }), child: const Text('Remove')),
                    ]),
                    if (inv.note.isNotEmpty) Text(inv.note, style: TextStyle(color: Colors.orange.shade800)),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final (n, src) in inv.pages.indexed)
                        Stack(children: [
                          Image.memory(dataUrlBytes(src), height: 90),
                          Positioned(right: 0, top: 0, child: IconButton(visualDensity: VisualDensity.compact, tooltip: 'Remove this page', icon: const Icon(Icons.close, size: 16), onPressed: _busy.isNotEmpty ? null : () => setState(() {
                            inv.pages.removeAt(n);
                            if (inv.pages.isEmpty) _invoices.remove(inv);
                          }))),
                        ]),
                    ]),
                  ]),
                ),
              ),
            ),
          if (_busy.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Row(children: [const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)), const SizedBox(width: 8), Expanded(child: Text(_busy))])),
        ])),
      ),
      actions: [
        TextButton(onPressed: _busy.isNotEmpty ? null : () => Navigator.pop(context), child: const Text('Cancel')),
        if (_invoices.length == 1) OutlinedButton(onPressed: pageCount == 0 || _busy.isNotEmpty ? null : _fillNow, child: const Text('Read and fill in now')),
        FilledButton(
          onPressed: pageCount == 0 || _busy.isNotEmpty ? null : _toDrafts,
          child: Text('Read ${_invoices.length > 1 ? '${_invoices.length} invoices' : 'invoice'} into draft${_invoices.length > 1 ? 's' : ''} for review'),
        ),
      ],
    );
  }
}

/// The notice over a delivery filled from a scanned invoice: what was read, what to check, the pages to compare.
class ScanNotice extends StatelessWidget {
  const ScanNotice({super.key, required this.scanned, required this.form, required this.total, required this.settings, required this.onDiscard, required this.onAddSupplier});
  final Map<String, Object?> scanned, form;
  final double total;
  final PharmacySettings settings;
  final VoidCallback onDiscard, onAddSupplier;

  @override
  Widget build(BuildContext context) {
    final s = scanned;
    final warn = TextStyle(color: Colors.orange.shade800);
    final check = toCheck(lines(form));
    final images = ((s['pageImages'] as List?) ?? const []).cast<String>();
    return Card(
      color: Colors.amber.withValues(alpha: .12),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Filled from a scanned invoice${'${s['invoiceNo'] ?? ''}'.isEmpty ? '' : ' (no. ${s['invoiceNo']})'}: check every line before saving', style: const TextStyle(fontWeight: FontWeight.w700))),
            TextButton(onPressed: onDiscard, child: const Text('Discard')),
          ]),
          Text('${s['lines']} line${s['lines'] == 1 ? '' : 's'} read${_n(s['readings']) > 1 ? ' and cross-checked by two AI readings' : ''}${'${s['readBy'] ?? ''}'.isEmpty ? '' : ' · scanned by ${s['readBy']}'}'
              '${_n(s['total']) > 0 ? ' · invoice total ${settings.money(_n(s['total']))} (here ${settings.money(total)})' : ''}'),
          if (_n(s['total']) > 0 && s['totalMatches'] == false)
            Text('The lines read add up to ${settings.money(_n(s['linesTotal']))}, not the invoice total: a line may be missing or misread', style: warn),
          if (_n(s['unmatched']) > 0) Text('${s['unmatched']} not matched to a medicine: choose one or add it as new', style: warn),
          if (check > 0) Text('$check line${check == 1 ? '' : 's'} to check (marked below)', style: warn),
          if ('${s['supplier'] ?? ''}'.isNotEmpty && s['supplierMatched'] != true)
            Row(children: [Text('Supplier on the invoice: ${s['supplier']} (not in your list) '), TextButton(onPressed: onAddSupplier, child: const Text('Add this supplier'))]),
          if (images.isNotEmpty)
            Wrap(spacing: 6, children: [
              for (final (n, src) in images.indexed)
                InkWell(
                  onTap: () => showAppDialog<void>(context: context, builder: (_) => Dialog(child: InteractiveViewer(child: Image.memory(dataUrlBytes(src))))),
                  child: Tooltip(message: 'Page ${n + 1}: open to compare', child: Image.memory(dataUrlBytes(src), height: 70)),
                ),
            ]),
        ]),
      ),
    );
  }
}
