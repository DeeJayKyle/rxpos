import 'package:flutter/material.dart';
import '../../../core/theme/line_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/medicine_groups.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/drug_class.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/search.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../../core/presentation/export.dart';
import '../../../core/rules/fefo.dart' show BatchStock;
import '../domain/medicines.dart' show expiryFlags, sellsNext;
import 'medicine_screens.dart';
import 'dart:convert' show utf8;
import '../../../core/data/record_store.dart';
import '../../../core/presentation/list_controls.dart';
import '../../../core/presentation/table_kit.dart';
import '../../../core/rules/pricing.dart' show markupPrice;

/// Inventory: every medicine with its stock here, filtered (in stock, low, out, expiring, expired); open one for its
/// batches, to count or adjust stock, or to edit it. Add medicines.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key, this.filter = 'instock'});
  final String filter;
  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  late String _filter = widget.filter;
  String _q = '';
  final _folded = <String>{};
  // UI batch 3: 100 rows, then more as the list scrolls (C7); counts, totals and exports always cover every match
  late final _more = LoadMore(() => setState(() {}));

  static const _filters = [('all', 'All'), ('instock', 'In stock'), ('low', 'Low'), ('out', 'Out of stock'), ('expiring', 'Expiring'), ('expired', 'Expired')];

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(pharmacyProvider);
    final d = data.value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null && data.hasError) {
      // a failed load is said, with a way to try again, never left as an endless spinner
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Could not load the medicines: ${data.error}', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const Key('inventory-retry'),
              onPressed: data.isLoading ? null : () => ref.invalidate(pharmacyProvider),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ]),
        ),
      );
    }
    if (d == null) return const PageSkeleton();
    final s = d.settings;
    final warn = s.expiryWarnDays.round();
    int? soonest(Product p) {
      int? best;
      for (final b in d.stock.batchesOf(p.id)) {
        if (b.qty > 0 && b.expiry.isNotEmpty) {
          final days = daysUntil(b.expiry);
          if (best == null || days < best) best = days;
        }
      }
      return best;
    }

    final found = _q.trim().isEmpty ? d.products : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id));
    // every match: the counts, totals and exports cover all of them; only the drawing of rows is paged
    final list = found.where((p) {
      final st = d.stockOf(p.id);
      return switch (_filter) {
        'instock' => st > 0,
        'low' => isLowStock(p, st),
        'out' => st <= 0 && !p.isCatalog,
        // per batch: a medicine with an expired batch and one expiring soon is in both views
        'expiring' => st > 0 && expiryFlags(d.stock.batchesOf(p.id), warn).expiring,
        'expired' => st > 0 && expiryFlags(d.stock.batchesOf(p.id), warn).expired,
        _ => true,
      };
    }).toList();
    final drawn = list.take(_more.shown(list.length, '$_q|$_filter')).toList();
    final value = stockValue(d.products.where((p) => d.stockOf(p.id) > 0), d.stock.batchesOf);
    final shownValue = stockValue(list, d.stock.batchesOf);
    final retail = list.fold<double>(0, (a, p) => a + (d.stockOf(p.id) > 0 ? d.stockOf(p.id) : 0) * p.price);
    final order = medicineOrderOf(ref);
    final rows = groupedRows(drawn, order, _folded);
    final more = list.length - drawn.length;
    final count = more > 0 ? 'Showing ${drawn.length} of ${list.length} items' : '${list.length} items';
    // phones: the heading, search and filters scroll away with the list, so the medicines always get the screen
    final phone = MediaQuery.sizeOf(context).width < 600;
    // a computer: the React app's table, each column heading its own colour (src/pages/Inventory.jsx)
    final table = MediaQuery.sizeOf(context).width >= 1100;
    final canEdit = can.contains('medicines.manage');
    const allCols = [ColourCol('Medicine', flex: 4), ColourCol('Next batch', flex: 2), ColourCol('Expiry', flex: 2), ColourCol('Shelf'), ColourCol('Reorder at', flex: 2, numeric: true),
      ColourCol('In stock', flex: 2, numeric: true), ColourCol('Retail price', flex: 2, numeric: true), ColourCol('Value (cost)', flex: 2, numeric: true)];
    // C2: the columns chosen and ordered on this device
    final colsC = ColumnsChoice.of(ref, 'inventory', [for (final c in allCols) c.title]);
    final cols = [for (final k in colsC.shown) allCols[k]];
    const editWidth = 96.0;
    final ok = context.tones.ok, warnC = context.tones.warn;
    return PageFrame(
      scroll: phone,
      title: 'Inventory',
      subtitle: can.contains('reports')
          ? '$count · ${s.money(shownValue.value)} at cost · ${s.money(retail)} at retail · all stock ${s.money(value.value)}${value.expired > 0 ? ' · ${s.money(value.expired)} expired (not included)' : ''}'
          : count,
      actions: [
        SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Medicine, generic, barcode…'),
        if (table) colsC.button(context, ref),
        ExportButtons(
          name: 'inventory',
          settings: s,
          title: const {'instock': 'Stock in hand', 'low': 'Low stock', 'out': 'Out of stock', 'all': 'All medicines', 'expiring': 'Expiring soon', 'expired': 'Expired'}[_filter] ?? 'Inventory',
          subtitle: '${list.length} items · ${s.money(shownValue.value)} at cost · ${s.money(retail)} at retail${shownValue.expired > 0 ? ' · ${s.money(shownValue.expired)} expired (not included)' : ''}',
          csv: () => inventoryCsv(list, d),
          pdf: () => [inventoryTable(list, d, s)],
        ),
        if (can.contains('medicines.manage')) FilledButton.icon(onPressed: () => editMedicine(context, ref, null), icon: const Icon(Icons.add), label: const Text('Add medicine')),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          for (final (k, l) in _filters) ChoiceChip(label: Text(l), selected: _filter == k, onSelected: (_) => setState(() => _filter = k)),
          const MedicineOrderMenu(),
        ]),
        const SizedBox(height: 8),
        if (table && list.isNotEmpty) Padding(padding: const EdgeInsets.only(left: 40), child: ColourTableHead(columns: cols, trailing: canEdit ? editWidth : 0)),
        _fill(
          phone,
          list.isEmpty
              ? EmptyState(switch (_filter) {
                  _ when _q.trim().isNotEmpty => 'Nothing matches “${_q.trim()}”. Try the generic name or the barcode.',
                  'instock' => 'No medicines in stock yet. Stock you receive with Add Stock shows here with its batches and value.',
                  'low' => 'Nothing is low on stock: every medicine is above its reorder level.',
                  'out' => 'Nothing is out of stock.',
                  'expiring' => 'Nothing expires soon.',
                  'expired' => 'No expired stock.',
                  _ => 'No medicines yet. Add your medicines, then receive stock.',
                })
              : (Widget Function(RowState Function(int i)? row) build) {
                  // a computer: ticks, the keys and a bar for the ticked medicines (C4, C6); a phone: the list alone
                  if (phone) return build(null);
                  return ListControls(
                    ids: [for (final p in drawn) p.id],
                    onOpen: (i) => _open(drawn[i]),
                    onEdit: canEdit ? (i) => editMedicine(context, ref, drawn[i]) : null,
                    bulk: (rs) => [
                      if (canEdit) ('Print labels', Icons.qr_code_2, (rs, done) => context.go('/labels?ids=${[for (final i in rs) drawn[i].id].join(',')}')),
                      ('Export', Icons.download_outlined, (rs, done) async {
                        final f = await saveDownload('inventory.csv', utf8.encode(toCsv(inventoryCsv([for (final i in rs) drawn[i]], d))));
                        if (context.mounted) say(context, 'Saved ${f.path}');
                      }),
                      if (canEdit) ('Change price', Icons.sell_outlined, (rs, done) => _bulkPrice([for (final i in rs) drawn[i]], s, done)),
                    ],
                    builder: (context, row) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Expanded(child: build(row)),
                      // C1: the value of what is listed stays pinned under it
                      if (table)
                        Material(
                          key: const Key('inventory-total'),
                          color: Theme.of(context).colorScheme.surfaceContainerHighest,
                          child: ListTile(dense: true, title: Text('Inventory value · ${list.length} items', style: const TextStyle(fontWeight: FontWeight.w700)),
                              trailing: Text(s.money(shownValue.value), style: const TextStyle(fontWeight: FontWeight.w800))),
                        ),
                    ]),
                  );
                }((row) => _more.listen(total: list.length, child: ListView.separated(
                  shrinkWrap: phone,
                  physics: phone ? const NeverScrollableScrollPhysics() : null,
                  itemCount: rows.length + 1,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: hued((_, i) {
                    if (i == rows.length) return _more.footer(context, list.length);
                    final r = rows[i];
                    if (r is GroupHeading) {
                      return GroupHeadingTile(heading: r, onToggle: () => setState(() => _folded.contains(r.name) ? _folded.remove(r.name) : _folded.add(r.name)));
                    }
                    final p = (rows[i] as GroupedMedicine).p;
                    final idx = drawn.indexOf(p);
                    Widget wrapRow(Widget w) => row == null || idx < 0 ? w : row(idx).wrap(Row(children: [row(idx).tickBox, Expanded(child: w)]));
                    final st = d.stockOf(p.id);
                    final days = soonest(p);
                    final cls = drugClassOf(p).cls;
                    if (table) {
                      final next = sellsNext(d.stock.batchesOf(p.id).where((b) => b.qty > 0).toList());
                      final low = isLowStock(p, st);
                      final soon = days != null && days >= 0 && days <= warn;
                      final err = Theme.of(context).colorScheme.error;
                      final stockC = st <= 0 ? err : low ? warnC : ok;
                      return wrapRow(ColourTableRow(
                        columns: cols,
                        onTap: () => _open(p),
                        trailingWidth: canEdit ? editWidth : 0,
                        trailing: canEdit
                            ? OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 10)),
                                onPressed: () => editMedicine(context, ref, p), icon: const Icon(Icons.edit_outlined, size: 16), label: const Text('Edit'))
                            : null,
                        cells: [for (final k in colsC.shown) [
                          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                            Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (p.form.isNotEmpty) Text(p.form, style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 3),
                            Wrap(spacing: 6, runSpacing: 4, children: [
                              TonePill(st <= 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock', color: stockC),
                              if (soon) TonePill('Expiring soon', color: warnC),
                            ]),
                            if (days != null && days < 0) Text(_expiredNote(d.stock.batchesOf(p.id)), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: err)),
                          ]),
                          Text(next?.batch.isNotEmpty == true ? next!.batch : '—'),
                          Text(next?.expiry.isNotEmpty == true ? next!.expiry : '—', style: TextStyle(color: soon ? warnC : null)),
                          Text(shelfLabel(p).isEmpty ? '—' : shelfLabel(p)),
                          // C5: the reorder level and the price edited in the table; audited like the form
                          CellEdit(key: ValueKey('reorder-${p.id}'), label: 'Reorder level of ${p.name}', text: formatQty(p.reorder), value: p.reorder, enabled: can.contains('inventory.edit'),
                              onSave: (v) => _saveCell(p, 'reorder', v, s)),
                          Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                              decoration: BoxDecoration(color: tint(stockC, Theme.of(context).colorScheme.surface, 16), borderRadius: BorderRadius.circular(99)),
                              child: Text(formatQty(st, '${p.unit.isEmpty ? 'unit' : p.unit.toLowerCase()}s'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: stockC)),
                            ),
                            HealthBar(stock: st, reorder: p.reorder, width: 90), // C9
                          ]),
                          CellEdit(key: ValueKey('price-${p.id}'), label: 'Retail price of ${p.name}', text: s.money(p.price), value: p.price, enabled: canEdit, onSave: (v) => _saveCell(p, 'price', v, s)),
                          Text(s.money(stockValue([p], d.stock.batchesOf).value)),
                        ][k]],
                      ));
                    }
                    return wrapRow(ListTile(
                      title: Text(p.name),
                      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text([p.generic, p.form, if (order != MedicineOrder.drugClass && cls != unclassified) cls, if (order != MedicineOrder.shelf && shelfLabel(p).isNotEmpty) 'shelf ${shelfLabel(p)}',
                          if (days != null) days >= 0 ? 'expires in $days days' : _expiredNote(d.stock.batchesOf(p.id))].where((x) => x.isNotEmpty).join(' · ')),
                        HealthBar(stock: st, reorder: p.reorder, width: 110), // C9
                      ]),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(formatQty(st, '${p.unit.isEmpty ? 'unit' : p.unit.toLowerCase()}s'),
                            style: TextStyle(fontWeight: FontWeight.w700, color: st <= 0 ? Theme.of(context).colorScheme.error : isLowStock(p, st) ? context.tones.warn : null)),
                        Text(s.money(p.price), style: Theme.of(context).textTheme.bodySmall),
                      ]),
                      onTap: () => _open(p),
                    ));
                  }),
                ))),
        ),
      ]),
    );
  }

  /// A medicine with an expired batch: say so in words, and when another batch still sells, when that one expires
  String _expiredNote(List<BatchStock> batches) {
    final next = sellsNext(batches);
    if (next == null) return 'EXPIRED';
    return next.expiry.isEmpty ? 'has an EXPIRED batch · other stock sells' : 'has an EXPIRED batch · next sells, expires in ${daysUntil(next.expiry)} days';
  }

  /// C5: a figure changed in the table, audited like the form
  Future<void> _saveCell(Product p, String k, double v, PharmacySettings s) async {
    final who = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final branch = (await ref.read(pharmacyProvider.future)).branch;
    await ref.read(recordStoreProvider).update((d) {
      d.put('products', {...p.toRecord(), k: v});
      d.audit(who, k == 'price' ? 'Price changed' : 'Inventory edited',
          k == 'price' ? '${p.name}: ${s.money(p.price)} → ${s.money(v)} (in the table)' : '${p.name}: reorder level ${formatQty(p.reorder)} → ${formatQty(v)} (in the table)', branch);
    });
  }

  /// C4: the ticked medicines' retail price: +10% / -5% or an amount; every change audited
  Future<void> _bulkPrice(List<Product> ps, PharmacySettings s, VoidCallback done) async {
    final v = await editRecord(context, title: 'New retail price for ${ps.length} medicine${ps.length > 1 ? 's' : ''}', save: 'Change prices',
        fields: const [FormFieldSpec('how', 'An amount (1500), or a change in percent (+10% or -5%)', required: true, hint: '+10%')]);
    if (v == null || !mounted) return;
    final m = RegExp(r'^\s*([+-]?\d+(?:\.\d+)?)\s*(%?)\s*$').firstMatch('${v['how']}');
    if (m == null) return say(context, 'Type an amount or a percent like +10%', error: true);
    final n = double.parse(m[1]!), pct = m[2] == '%';
    final who = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await ref.read(recordStoreProvider).update((d) {
      for (final p in ps) {
        final price = pct ? markupPrice(p.price, n, s.priceRound) : n;
        if (price < 0 || price == p.price) continue;
        d.put('products', p.copyWith(price: price).toRecord());
        d.audit(who, 'Price changed', '${p.name}: ${s.money(p.price)} → ${s.money(price)} (several at once)');
      }
    });
    if (mounted) say(context, 'Prices changed for ${ps.length} medicine${ps.length > 1 ? 's' : ''}');
    done();
  }

  /// the list fills the rest of the page on a desktop; on a phone it is part of the page's own scroll
  Widget _fill(bool phone, Widget child) => phone ? child : Expanded(child: child);

  Future<void> _open(Product p) async {
    final d = await ref.read(pharmacyProvider.future);
    final can = ref.read(permissionsProvider).value ?? const <String>{};
    if (!mounted) return;
    final batches = d.stock.batchesOf(p.id).where((b) => b.qty != 0).toList();
    final next = sellsNext(batches); // first expiry first out, never an expired batch
    final warn = d.settings.expiryWarnDays.round();
    await showAppDialog<void>(
      context: context,
      side: true, // C8: beside the list on a wide screen
      builder: (c) => AlertDialog(
        title: Text('${p.name} – batches here'),
        content: SizedBox(
          width: 500,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${[p.generic, p.form, p.unit].where((x) => x.isNotEmpty).join(' · ')}\nBarcode ${p.barcode.isEmpty ? '—' : p.barcode}'),
            Text('Price ${d.settings.money(p.price)} · wholesale ${d.settings.money(p.wholesale)}${can.contains('reports') ? ' · cost ${d.settings.money(p.cost)}' : ''}'),
            const Divider(),
            Text('Stock here: ${formatQty(d.stockOf(p.id))}', style: const TextStyle(fontWeight: FontWeight.w700)),
            for (final b in batches)
              Row(children: [
                Expanded(child: Text('Batch ${b.batch}${b.expiry.isEmpty ? '' : ' · expires ${b.expiry}'}'
                    '${b.expiry.isEmpty ? '' : daysUntil(b.expiry) < 0 ? ' (EXPIRED, not sold)' : daysUntil(b.expiry) <= warn ? ' (expires in ${daysUntil(b.expiry)} days)' : ''}'
                    ' · ${d.settings.money(b.cost != 0 ? b.cost : p.cost)}',
                    style: TextStyle(color: b.expiry.isEmpty ? null : daysUntil(b.expiry) < 0 ? Theme.of(c).colorScheme.error : daysUntil(b.expiry) <= warn ? context.tones.warn : null))),
                if (identical(b, next)) const Padding(padding: EdgeInsets.only(right: 8), child: Chip(key: Key('sells-next'), label: Text('Sells next'), visualDensity: VisualDensity.compact)),
                Text(formatQty(b.qty), style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            if (batches.isEmpty) const Text('No stock at this branch'),
          ]),
        ),
        actions: [
          TextButton(onPressed: () {
            Navigator.pop(c);
            context.go('/stock-card?id=${p.id}');
          }, child: const Text('Stock card')),
          if (can.contains('stock.adjust'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await adjustDialog(context, ref, p);
            }, child: const Text('Count / adjust')),
          if (can.contains('inventory.edit'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await inventoryEditor(context, ref, p);
            }, child: const Text('Edit stock')),
          if (can.contains('medicines.manage'))
            TextButton(onPressed: () async {
              Navigator.pop(c);
              await editMedicine(context, ref, p);
            }, child: const Text('Edit')),
          FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
        ],
      ),
    );
  }
}
