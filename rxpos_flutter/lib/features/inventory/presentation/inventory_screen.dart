import 'package:flutter/material.dart';
import '../../../core/theme/line_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/product.dart';
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
  static const _page = 300;
  int _limit = _page; // rows drawn; counts, totals and exports always cover every match

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
    if (d == null) return const Center(child: CircularProgressIndicator());
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
    final drawn = list.length > _limit ? list.take(_limit).toList() : list;
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
    const cols = [ColourCol('Medicine', flex: 4), ColourCol('Next batch', flex: 2), ColourCol('Expiry', flex: 2), ColourCol('Shelf'), ColourCol('Reorder at', flex: 2, numeric: true),
      ColourCol('In stock', flex: 2, numeric: true), ColourCol('Value (cost)', flex: 2, numeric: true)];
    const editWidth = 96.0;
    final ok = Color(Theme.of(context).brightness == Brightness.dark ? 0xFF34D399 : 0xFF047857), warnC = Color(Theme.of(context).brightness == Brightness.dark ? 0xFFFBBF24 : 0xFFB45309);
    return PageFrame(
      scroll: phone,
      title: 'Inventory',
      subtitle: can.contains('reports')
          ? '$count · ${s.money(shownValue.value)} at cost · ${s.money(retail)} at retail · all stock ${s.money(value.value)}${value.expired > 0 ? ' · ${s.money(value.expired)} expired (not included)' : ''}'
          : count,
      actions: [
        SearchField(onChanged: (v) => setState(() {
          _q = v;
          _limit = _page;
        }), hint: 'Medicine, generic, barcode…'),
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
          for (final (k, l) in _filters) ChoiceChip(label: Text(l), selected: _filter == k, onSelected: (_) => setState(() {
            _filter = k;
            _limit = _page;
          })),
          const MedicineOrderMenu(),
        ]),
        const SizedBox(height: 8),
        if (table && list.isNotEmpty) ColourTableHead(columns: cols, trailing: canEdit ? editWidth : 0),
        _fill(
          phone,
          list.isEmpty
              ? const EmptyState('No medicines here')
              : ListView.separated(
                  shrinkWrap: phone,
                  physics: phone ? const NeverScrollableScrollPhysics() : null,
                  itemCount: rows.length + (more > 0 ? 1 : 0),
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: hued((_, i) {
                    if (i == rows.length) {
                      return Padding(
                        padding: const EdgeInsets.all(12),
                        child: Center(child: OutlinedButton.icon(
                          key: const Key('inventory-more'),
                          onPressed: () => setState(() => _limit += _page),
                          icon: const Icon(Icons.expand_more),
                          label: Text('Show ${more > _page ? _page : more} more ($more not shown; totals and exports include them)'),
                        )),
                      );
                    }
                    final row = rows[i];
                    if (row is GroupHeading) {
                      return GroupHeadingTile(heading: row, onToggle: () => setState(() => _folded.contains(row.name) ? _folded.remove(row.name) : _folded.add(row.name)));
                    }
                    final p = (row as GroupedMedicine).p;
                    final st = d.stockOf(p.id);
                    final days = soonest(p);
                    final cls = drugClassOf(p).cls;
                    if (table) {
                      final next = sellsNext(d.stock.batchesOf(p.id).where((b) => b.qty > 0).toList());
                      final low = isLowStock(p, st);
                      final soon = days != null && days >= 0 && days <= warn;
                      final err = Theme.of(context).colorScheme.error;
                      final stockC = st <= 0 ? err : low ? warnC : ok;
                      return ColourTableRow(
                        columns: cols,
                        onTap: () => _open(p),
                        trailingWidth: canEdit ? editWidth : 0,
                        trailing: canEdit
                            ? OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 10)),
                                onPressed: () => editMedicine(context, ref, p), icon: const Icon(Icons.edit_outlined, size: 16), label: const Text('Edit'))
                            : null,
                        cells: [
                          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                            Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (p.form.isNotEmpty) Text(p.form, style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 3),
                            Wrap(spacing: 6, runSpacing: 4, children: [
                              StatusPill(st <= 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock', color: stockC),
                              if (soon) StatusPill('Expiring soon', color: warnC),
                            ]),
                            if (days != null && days < 0) Text(_expiredNote(d.stock.batchesOf(p.id)), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: err)),
                          ]),
                          Text(next?.batch.isNotEmpty == true ? next!.batch : '—'),
                          Text(next?.expiry.isNotEmpty == true ? next!.expiry : '—', style: TextStyle(color: soon ? warnC : null)),
                          Text(shelfLabel(p).isEmpty ? '—' : shelfLabel(p)),
                          Text(formatQty(p.reorder)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                            decoration: BoxDecoration(color: tint(stockC, Theme.of(context).colorScheme.surface, 16), borderRadius: BorderRadius.circular(99)),
                            child: Text(formatQty(st, '${p.unit.isEmpty ? 'unit' : p.unit.toLowerCase()}s'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: stockC)),
                          ),
                          Text(s.money(stockValue([p], d.stock.batchesOf).value)),
                        ],
                      );
                    }
                    return ListTile(
                      title: Text(p.name),
                      subtitle: Text([p.generic, p.form, if (order != MedicineOrder.drugClass && cls != unclassified) cls, if (order != MedicineOrder.shelf && shelfLabel(p).isNotEmpty) 'shelf ${shelfLabel(p)}',
                        if (days != null) days >= 0 ? 'expires in $days days' : _expiredNote(d.stock.batchesOf(p.id))].where((x) => x.isNotEmpty).join(' · ')),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(formatQty(st, '${p.unit.isEmpty ? 'unit' : p.unit.toLowerCase()}s'),
                            style: TextStyle(fontWeight: FontWeight.w700, color: st <= 0 ? Theme.of(context).colorScheme.error : isLowStock(p, st) ? Colors.orange.shade800 : null)),
                        Text(s.money(p.price), style: Theme.of(context).textTheme.bodySmall),
                      ]),
                      onTap: () => _open(p),
                    );
                  }),
                ),
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
                    style: TextStyle(color: b.expiry.isEmpty ? null : daysUntil(b.expiry) < 0 ? Theme.of(c).colorScheme.error : daysUntil(b.expiry) <= warn ? Colors.orange.shade800 : null))),
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
