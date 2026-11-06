// Drug Information (src/pages/DrugInfo.jsx): dispensing information from the FDA drug label database, saved on this
// device for offline use, plus links to clinical references; a counselling sheet to print. The panel is also shown
// from the till ("Drug info" on a sale line).
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/database/app_database.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/search.dart';
import '../domain/drug_label.dart';

/// How the lookup reaches the network (replaced in tests).
final drugFetchProvider = Provider<Fetch>((ref) {
  final dio = Dio();
  return (url, timeout) async {
    final r = await dio.get<Object?>(url, options: Options(receiveTimeout: timeout, sendTimeout: timeout, validateStatus: (_) => true)).timeout(timeout);
    return (r.statusCode ?? 0, r.data is String ? jsonDecode(r.data! as String) : r.data);
  };
});

/// One lookup for the app, its answers kept in this device's database (never synced).
final drugLookupProvider = Provider<DrugLookup>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return DrugLookup(
    fetch: ref.watch(drugFetchProvider),
    get: (k) async {
      final r = await (db.select(db.kv)..where((x) => x.k.equals('device:$k'))).getSingleOrNull();
      return r == null ? null : jsonDecode(r.v);
    },
    set: (k, v) => db.into(db.kv).insertOnConflictUpdate(KvCompanion(k: Value('device:$k'), v: Value(jsonEncode(v)))),
  );
});

const _compactSections = ['Uses', 'Dosage & administration', 'Do not use when', 'Warnings & precautions', 'Warnings', 'Side effects', 'Interactions'];

/// Dispensing information for one medicine (what the device has at once, then the network).
class DrugInfoPanel extends ConsumerStatefulWidget {
  const DrugInfoPanel({super.key, required this.name, this.generic = '', this.compact = false, this.onInfo});
  final String name, generic;
  final bool compact;
  final ValueChanged<Map<String, Object?>?>? onInfo;
  @override
  ConsumerState<DrugInfoPanel> createState() => _DrugInfoPanelState();
}

class _DrugInfoPanelState extends ConsumerState<DrugInfoPanel> {
  Map<String, Object?>? _info;
  bool _loading = true, _cached = false, _refreshing = false, _notFound = false;
  String? _error, _warning;
  int _retry = 0;

  List<String> get _keys {
    final k = lookupKeys(widget.name, widget.generic);
    final raw = (widget.generic.isNotEmpty ? widget.generic : widget.name).trim().toLowerCase();
    return k.isNotEmpty ? k : raw.length >= 2 ? [raw] : const [];
  }

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  void didUpdateWidget(DrugInfoPanel old) {
    super.didUpdateWidget(old);
    if (old.name != widget.name || old.generic != widget.generic) _run();
  }

  void _show({Map<String, Object?>? info, bool cached = false, bool refreshing = false, bool notFound = false, String? error, String? warning, bool loading = false}) {
    if (!mounted) return;
    setState(() {
      _info = info;
      _cached = cached;
      _refreshing = refreshing;
      _notFound = notFound;
      _error = error;
      _warning = warning;
      _loading = loading;
    });
    widget.onInfo?.call(info);
  }

  Future<void> _run() async {
    final lookup = ref.read(drugLookupProvider);
    final keys = _keys, retry = _retry;
    if (keys.isEmpty) return _show(notFound: true);
    final peek = keys.map(lookup.peek).whereType<Map<String, Object?>>().firstOrNull;
    if (peek != null) _show(info: peek);
    ({Map<String, Object?>? info, bool fresh, bool miss})? known;
    for (final k in keys) {
      final s = await lookup.saved(k);
      if (s?.info != null) {
        known = s;
        break;
      }
    }
    if (known != null) _show(info: known.info, cached: true, refreshing: !known.fresh);
    if (known != null && known.fresh && retry == 0) return;
    if (known == null) _show(loading: true);
    try {
      Map<String, Object?>? info;
      for (final k in keys) {
        if (retry == 0 && (await lookup.saved(k))?.miss == true) continue;
        info = await lookup.refresh(k);
        if (info != null) break;
      }
      if (info != null) {
        _show(info: info);
      } else if (known != null) {
        _show(info: known.info, cached: true);
      } else {
        _show(notFound: true);
      }
    } on LookupError catch (e) {
      known != null ? _show(info: known.info, cached: true, warning: e.message) : _show(error: e.message);
    }
  }

  void _again() {
    _retry++;
    _run();
  }

  @override
  Widget build(BuildContext context) {
    final key = _keys.firstOrNull ?? '';
    final info = _info;
    final sections = [for (final s in (info?['sections'] as List?) ?? const []) ('${(s as List)[0]}', '${s[1]}')];
    final shown = widget.compact ? sections.where((s) => _compactSections.contains(s.$1)).toList() : sections;
    final t = Theme.of(context);
    Widget notice(IconData icon, String text, {bool again = false}) => Card(
          color: t.colorScheme.surfaceContainerHighest,
          child: ListTile(
            leading: Icon(icon),
            title: Text(text),
            trailing: again && key.isNotEmpty ? TextButton.icon(onPressed: _again, icon: const Icon(Icons.refresh), label: const Text('Look again')) : null,
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      if (_loading && info == null) Padding(padding: const EdgeInsets.all(12), child: Row(children: [const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)), const SizedBox(width: 10), Text('Looking up $key…')])),
      if (_notFound) notice(Icons.info_outline, 'No label found for “${key.isEmpty ? widget.name : key}” in the FDA database (common for local brands and sundries). Use the references below.', again: true),
      if (_error != null) notice(Icons.wifi_off, '$_error', again: true),
      if (_warning != null) notice(Icons.wifi_off, 'Showing the copy saved on this device. $_warning', again: true),
      if (info != null) ...[
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${info['title'] ?? ''}'.isEmpty ? key : '${info['title']}', style: t.textTheme.titleMedium),
              Text(['${info['form'] ?? ''}', '${info['route'] ?? ''}'].where((x) => x.isNotEmpty).join(' · '), style: t.textTheme.bodySmall),
            ]),
          ),
          if (_cached) Chip(label: Text(_refreshing ? 'updating…' : 'saved ${'${info['fetchedAt']}'.split('T').first}'), visualDensity: VisualDensity.compact),
        ]),
        for (final (label, text) in shown)
          ExpansionTile(
            key: PageStorageKey('drug-$label'),
            initiallyExpanded: label == 'Dosage & administration' || label == 'Uses',
            tilePadding: EdgeInsets.zero,
            title: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
            children: [Align(alignment: Alignment.centerLeft, child: SelectableText(text))],
          ),
        const SizedBox(height: 6),
        Text("Summary of the U.S. FDA product label (openFDA, public domain). Always check local guidelines and the prescriber's instructions.", style: t.textTheme.bodySmall),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(onPressed: () => launchUrl(Uri.parse('${info['source']}'), mode: LaunchMode.externalApplication), child: const Text('Full label')),
        ),
      ],
      const SizedBox(height: 6),
      Wrap(spacing: 6, runSpacing: 6, children: [
        for (final (label, url) in drugReferences(key.isEmpty ? widget.name : key))
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
            onPressed: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new, size: 14),
            label: Text(label),
          ),
      ]),
    ]);
  }
}

/// A counselling sheet: the medicine's dispensing information on A4.
Future<Uint8List> counsellingSheetPdf(PharmacySettings st, String name, Map<String, Object?> info) {
  final doc = pw.Document();
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(36),
    build: (_) => [
      pw.Text(st.name, style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
      if (st.phone.isNotEmpty || st.address.isNotEmpty) pw.Text([st.address, st.phone].where((x) => x.isNotEmpty).join(' · '), style: const pw.TextStyle(fontSize: 9)),
      pw.SizedBox(height: 12),
      pw.Text(name, style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
      if ('${info['title'] ?? ''}'.isNotEmpty) pw.Text('${info['title']}', style: const pw.TextStyle(fontSize: 11)),
      pw.SizedBox(height: 10),
      for (final s in (info['sections'] as List?) ?? const []) ...[
        pw.Text('${(s as List)[0]}', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
        pw.Text('${s[1]}', style: const pw.TextStyle(fontSize: 9)),
        pw.SizedBox(height: 8),
      ],
      pw.Text("Summary of the U.S. FDA product label (openFDA, public domain). Always check local guidelines and the prescriber's instructions.",
          style: const pw.TextStyle(fontSize: 8)),
    ],
  ));
  return doc.save();
}

class DrugInfoScreen extends ConsumerStatefulWidget {
  const DrugInfoScreen({super.key});
  @override
  ConsumerState<DrugInfoScreen> createState() => _DrugInfoScreenState();
}

class _DrugInfoScreenState extends ConsumerState<DrugInfoScreen> {
  final _q = TextEditingController();
  ({String name, String generic})? _picked;
  Map<String, Object?>? _info;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  void _pick(String name, String generic) => setState(() {
        _picked = (name: name, generic: generic);
        _info = null;
        _q.text = name;
      });

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final q = _q.text.trim();
    final matches = q.length < 2 || _picked != null ? const <Product>[] : searchProducts(d.products, q, stockOf: (p) => d.stockOf(p.id)).take(12).toList();
    final picked = _picked;
    return PageFrame(
      title: 'Drug Information',
      subtitle: 'Dispensing information and clinical references, available offline once looked up',
      scroll: true,
      actions: [
        if (picked != null && _info != null)
          OutlinedButton.icon(
            onPressed: () => Printing.layoutPdf(name: 'counselling-${picked.name}', onLayout: (_) => counsellingSheetPdf(d.settings, picked.name, _info!)),
            icon: const Icon(Icons.print),
            label: const Text('Print counselling sheet'),
          ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TextField(
                key: const Key('drug-search'),
                controller: _q,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Medicine or generic name, e.g. amoxicillin', border: OutlineInputBorder()),
                onChanged: (_) => setState(() => _picked = null),
                onSubmitted: (v) => v.trim().isEmpty ? null : _pick(v.trim(), v.trim()),
              ),
              if (matches.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final p in matches) ActionChip(label: Text(p.name), onPressed: () => _pick(p.name, p.generic)),
                  ActionChip(label: Text('Search “$q”'), onPressed: () => _pick(q, q)),
                ]),
              ],
            ]),
          ),
        ),
        if (picked == null)
          const EmptyState('Type a medicine name above. The first lookup needs internet; after that it is saved on this device.')
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text(picked.name, style: Theme.of(context).textTheme.titleLarge)),
                  TextButton(
                    onPressed: () => setState(() {
                      _picked = null;
                      _info = null;
                      _q.clear();
                    }),
                    child: const Text('New search'),
                  ),
                ]),
                DrugInfoPanel(
                  key: ValueKey('${picked.name}|${picked.generic}'),
                  name: picked.name,
                  generic: picked.generic,
                  onInfo: (i) => WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted && i != _info) setState(() => _info = i);
                  }),
                ),
              ]),
            ),
          ),
      ]),
    );
  }
}
