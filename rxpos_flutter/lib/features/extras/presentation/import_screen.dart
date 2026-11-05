// Import medicines (src/pages/Import.jsx): the standard catalogue (built in, or added when the owner switched it
// off), and an Excel / CSV file (or pasted rows) whose columns are matched, previewed and imported.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/catalog.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/files.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../auth/application/session_controller.dart';
import '../../inventory/domain/medicines.dart' show newInternalBarcode;
import '../domain/import_sheet.dart';

class ImportScreen extends ConsumerStatefulWidget {
  const ImportScreen({super.key});
  @override
  ConsumerState<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends ConsumerState<ImportScreen> {
  String _tab = 'catalog';
  Sheet? _sheet;
  Map<String, int> _map = {};
  bool _skip = false, _busy = false;
  ({int added, int updated, int skipped, int stocked})? _result;
  final _paste = TextEditingController();

  @override
  void dispose() {
    _paste.dispose();
    super.dispose();
  }

  void _open(String name, List<List<Object?>> rows) {
    try {
      final s = toSheet(name, rows);
      setState(() {
        _sheet = s;
        _map = autoMap(s.headers);
        _result = null;
      });
    } on FormatException catch (e) {
      say(context, e.message);
    }
  }

  Future<void> _pick() async {
    final fs = await pickFiles(extensions: const ['xlsx', 'csv', 'txt'], multiple: false);
    if (fs.isEmpty || !mounted) return;
    final f = fs.first;
    try {
      final rows = f.name.toLowerCase().endsWith('.xlsx') ? readXlsx(f.bytes) : parseCsv(utf8.decode(f.bytes, allowMalformed: true));
      _open(f.name, rows);
    } catch (e) {
      if (mounted) say(context, 'Could not read that file: $e');
    }
  }

  Future<void> _importCatalog(PharmacyData d) async {
    setState(() => _busy = true);
    try {
      final cat = await loadCatalog();
      final store = ref.read(recordStoreProvider);
      final own = await store.rows('products');
      final have = {for (final p in own) '${p['name']}'.trim().toLowerCase()};
      final ids = {for (final p in own) '${p['id']}'};
      final fresh = cat.where((p) => !ids.contains(p.id) && !have.contains(p.name.toLowerCase())).toList();
      if (!mounted) return;
      if (!await confirmAction(context, 'Add ${fresh.length} medicines?',
          '${cat.length - fresh.length} are already in your list and will be skipped. Prices come from a typical Ugandan price list. Review them in Quick Edit. No stock is added.', 'Add medicines')) {
        return;
      }
      final me = await ref.read(sessionControllerProvider.future);
      final forms = {for (final f in await store.rows('formulations')) '${f['name']}'};
      final used = {for (final p in own) if ('${p['barcode'] ?? ''}'.isNotEmpty) '${p['barcode']}'};
      await store.update((x) {
        for (final f in {for (final p in fresh) p.form}) {
          if (f.isNotEmpty && forms.add(f)) x.put('formulations', {'id': 'form-${f.toLowerCase().replaceAll(RegExp(r'\W+'), '-')}', 'name': f});
        }
        for (final p in fresh) {
          final code = p.barcode.isNotEmpty && !used.contains(p.barcode) ? p.barcode : newInternalBarcode(used);
          used.add(code);
          x.put('products', {...p.toRecord(), 'barcode': code, 'fromCatalog': true}..remove('_base'));
        }
        x.audit(me?.userName ?? '', 'Catalog imported', '${fresh.length} medicines added from the standard catalog', d.branch);
      });
      setState(() => _result = (added: fresh.length, updated: 0, skipped: cat.length - fresh.length, stocked: 0));
      if (mounted) say(context, '${fresh.length} medicines added');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _run(PharmacyData d) async {
    final sheet = _sheet!;
    if (_map['name'] == null) {
      say(context, 'Choose which column holds the medicine name');
      return;
    }
    final n = sheet.rows.where((r) => '${sheetRecord(r, _map)['name'] ?? ''}'.trim().isNotEmpty).length;
    if (!await confirmAction(context, 'Import $n rows?', _skip ? 'Existing medicines are skipped; only new ones are added.' : 'Existing medicines (same barcode or name) will be updated; new ones added.', 'Import')) {
      return;
    }
    final me = await ref.read(sessionControllerProvider.future);
    final r = await importSheet(ref.read(recordStoreProvider), sheet, _map,
        skipExisting: _skip, retailMarkup: d.settings.retailMarkup, wholesaleMarkup: d.settings.wholesaleMarkup, user: me?.userName ?? '', branchId: d.branch);
    setState(() {
      _result = r;
      _sheet = null;
      _paste.clear();
    });
    if (mounted) say(context, 'Import finished');
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final r = _result;
    return PageFrame(
      title: 'Import medicines',
      subtitle: 'Fill your medicine list in minutes',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'catalog', label: Text('Standard catalog')), ButtonSegment(value: 'file', label: Text('Excel / CSV file'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() {
              _tab = v.first;
              _result = null;
            }),
          ),
        ),
        const SizedBox(height: 12),
        if (r != null)
          Card(
            color: Theme.of(context).colorScheme.secondaryContainer,
            child: ListTile(
              leading: const Icon(Icons.check_circle_outline),
              title: Text('${r.added} added · ${r.updated} updated · ${r.skipped} skipped${r.stocked > 0 ? ' · ${r.stocked} with opening stock' : ''}'),
            ),
          ),
        if (_tab == 'catalog')
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Wrap(spacing: 16, runSpacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
                const Icon(Icons.local_library_outlined, size: 40),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('9,710 medicines & sundries, ready to sell', style: Theme.of(context).textTheme.titleMedium),
                    const Text('Trade and generic names, formulations, retail and wholesale prices from a typical Ugandan pharmacy price list. Medicines already in your list are skipped. '
                        'Stock is added later with Add Stock or the Excel import.'),
                  ]),
                ),
                if (d.features['catalog'] != false)
                  const Chip(avatar: Icon(Icons.check, size: 16), label: Text('Already included: built into RxPOS'))
                else
                  FilledButton(onPressed: _busy ? null : () => _importCatalog(d), child: Text(_busy ? 'Loading…' : 'Add standard catalog')),
              ]),
            ),
          )
        else if (_sheet == null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Icon(Icons.table_view_outlined, size: 44),
                const SizedBox(height: 8),
                const Text('Choose your Excel (.xlsx) or CSV file', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700)),
                const Text('Any column order works. You’ll match the columns next.', textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
                  FilledButton.icon(onPressed: _pick, icon: const Icon(Icons.upload_file), label: const Text('Choose a file')),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final f = await saveDownload('rxpos-import-template.csv', utf8.encode(importTemplate));
                      if (context.mounted) say(context, 'Template saved: ${f.path}');
                    },
                    icon: const Icon(Icons.download),
                    label: const Text('Download a template'),
                  ),
                ]),
                const SizedBox(height: 16),
                const Text('Or paste rows copied from Excel (with the column names in the first row):'),
                const SizedBox(height: 6),
                TextField(
                  key: const Key('import-paste'),
                  controller: _paste,
                  minLines: 4,
                  maxLines: 10,
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Name\tGeneric\tFormulation\tRetail price\tCost\nAmoxa 500mg Caps\tAmoxicillin\tCapsules\t500\t300'),
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: OutlinedButton(onPressed: () => _paste.text.trim().isEmpty ? null : _open('Pasted rows', parseCsv(_paste.text)), child: const Text('Use the pasted rows')),
                ),
              ]),
            ),
          )
        else
          ..._mapping(d, _sheet!),
      ]),
    );
  }

  List<Widget> _mapping(PharmacyData d, Sheet sheet) {
    final shown = importTargets.where((t) => _map[t.$1] != null).toList();
    return [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('${sheet.fileName} · ${sheet.rows.length} rows', style: Theme.of(context).textTheme.titleMedium)),
              TextButton(onPressed: () => setState(() => _sheet = null), child: const Text('Choose another file')),
            ]),
            const SizedBox(height: 8),
            LayoutBuilder(
              builder: (_, c) => Wrap(spacing: 12, runSpacing: 10, children: [
                for (final (key, label, _, required) in importTargets)
                  SizedBox(
                    width: c.maxWidth >= 720 ? (c.maxWidth - 24) / 3 : c.maxWidth,
                    child: DropdownButtonFormField<int>(
                      key: ValueKey('map-$key'),
                      initialValue: _map[key] ?? -1,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: '$label${required ? ' *' : ''}', border: const OutlineInputBorder(), isDense: true),
                      items: [
                        const DropdownMenuItem(value: -1, child: Text('— not in file —')),
                        for (var i = 0; i < sheet.headers.length; i++) DropdownMenuItem(value: i, child: Text(sheet.headers[i], overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (v) => setState(() => v == null || v < 0 ? _map.remove(key) : _map[key] = v),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 8),
            RadioGroup<bool>(
              groupValue: _skip,
              onChanged: (v) => setState(() => _skip = v ?? false),
              child: const Wrap(spacing: 12, children: [
                SizedBox(width: 340, child: RadioListTile<bool>(value: false, contentPadding: EdgeInsets.zero, title: Text('Update medicines that already exist'))),
                SizedBox(width: 300, child: RadioListTile<bool>(value: true, contentPadding: EdgeInsets.zero, title: Text('Skip existing, only add new'))),
              ]),
            ),
          ]),
        ),
      ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Preview (first 8 rows)', style: Theme.of(context).textTheme.titleMedium),
            if (sheet.rows.isEmpty) const Text('The file has no data rows'),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columns: [for (final t in shown) DataColumn(label: Text(t.$2))],
                rows: [
                  for (final row in sheet.rows.take(8))
                    DataRow(cells: [
                      for (final t in shown)
                        DataCell(Text(() {
                          final v = sheetRecord(row, _map)[t.$1];
                          return t.$1 == 'expiry' ? toDate(v) : const ['cost', 'price', 'wholesale'].contains(t.$1) ? d.settings.money(toNumber(v)) : '${v ?? ''}';
                        }())),
                    ]),
                ],
              ),
            ),
          ]),
        ),
      ),
      Align(
        alignment: Alignment.centerRight,
        child: FilledButton.icon(onPressed: () => _run(d), icon: const Icon(Icons.upload), label: Text('Import ${sheet.rows.length} rows')),
      ),
    ];
  }
}
