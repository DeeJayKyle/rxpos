import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/purchase.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/export.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/fefo.dart';
import '../../inventory/domain/medicines.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/money.dart';
import '../../extras/domain/extras.dart';
import '../../../core/rules/stock.dart';
import '../../auth/application/session_controller.dart';
import '../../returns/presentation/returns_screen.dart';
import '../domain/reorder.dart';

/// Purchase history: every delivery received (newest first), what is still owed on each.
class PurchasesScreen extends ConsumerStatefulWidget {
  const PurchasesScreen({super.key});
  @override
  ConsumerState<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends ConsumerState<PurchasesScreen> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('purchases')).value;
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    if (rows == null) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    final list = rows.map(Purchase.fromRecord).where((p) => q.isEmpty || [p.number, p.invoice, p.supplierName, ...p.items.map((i) => i.name)].any((x) => x.toLowerCase().contains(q))).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final owed = list.fold(0.0, (a, p) => a + (p.total - p.paid));
    return PageFrame(
      title: 'Purchase history',
      subtitle: '${list.length} deliveries · ${st.money(list.fold(0.0, (a, p) => a + p.total))}${owed > 0 ? ' · ${st.money(owed)} unpaid' : ''}',
      actions: [SearchField(onChanged: (v) => setState(() => _q = v), hint: 'Supplier, invoice, medicine…')],
      child: list.isEmpty
          ? const EmptyState('No deliveries yet')
          : ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final p = list[i];
                return ExpansionTile(
                  title: Text('${p.number} · ${p.supplierName}'),
                  subtitle: Text('${p.date} · invoice ${p.invoice.isEmpty ? '—' : p.invoice} · ${p.items.length} lines · by ${p.receivedBy}${p.paid < p.total ? ' · ${st.money(p.total - p.paid)} unpaid' : ''}'),
                  trailing: Text(st.money(p.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                  children: [
                    for (final it in p.items)
                      ListTile(dense: true, title: Text(it.name), subtitle: Text('batch ${it.batch} · expires ${it.expiry}'),
                          trailing: Text('${it.pack != null ? '${formatQty(it.pack!.count)} ${it.pack!.name} = ' : ''}${formatQty(it.qty)} @ ${st.money(it.cost)}')),
                  ],
                );
              },
            ),
    );
  }
}

/// Reorder & dead stock (src/pages/Reorder.jsx): suggestions from how fast each item really sells (buy from the
/// cheapest or the last supplier, or pick one), reorder levels from sales, dead stock, purchase orders (create, open,
/// print, WhatsApp to the supplier, receive, delete).
class ReorderScreen extends ConsumerStatefulWidget {
  const ReorderScreen({super.key});
  @override
  ConsumerState<ReorderScreen> createState() => _ReorderScreenState();
}

class _ReorderScreenState extends ConsumerState<ReorderScreen> {
  String _tab = 'reorder';
  int _window = 30;
  int? _lead, _cover, _dead;
  bool _cheapest = true;
  final _picked = <String, bool>{};
  final _chosen = <String, String>{};

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final sales = ref.watch(tableProvider('sales')).value;
    final purchases = ref.watch(tableProvider('purchases')).value;
    final pos = ref.watch(tableProvider('purchaseOrders')).value ?? const [];
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    if (d == null || sales == null || purchases == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    int setting(String k, int def) => (st.raw[k] as num?)?.round() ?? def;
    final lead = _lead ?? setting('leadDays', 7), cover = _cover ?? setting('coverDays', 30), deadDays = _dead ?? setting('deadDays', 90);
    final saleList = sales.map(Sale.fromRecord).toList();
    final v = salesVelocity(saleList, days: _window, branch: d.branch);
    final prices = supplierPrices(purchases);
    final suggestions = reorderSuggestions(d.products, d.stockOf, v.sold, window: _window, lead: lead, cover: cover, prices: prices, last: lastBuys(purchases),
        fromCheapest: _cheapest, chosen: _chosen);
    final dead = deadStock(d.products, d.stockOf, v.lastSale, deadDays: deadDays);
    final chosen = suggestions.where((r) => _picked[r.p.id] ?? true).toList();
    final orders = pos.where((o) => (o['branchId'] ?? 'main') == d.branch).toList()..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    final deadValue = dead.fold<double>(0, (a, r) => a + r.value);
    Widget numBox(String label, int value, ValueChanged<int> set) => SizedBox(width: 170,
        child: TextFormField(initialValue: '$value', keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label, isDense: true), onChanged: (x) => setState(() => set(int.tryParse(x) ?? value))));
    return PageFrame(
      title: 'Reorder & dead stock',
      subtitle: 'Based on how fast each item really sells',
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          StatCard(label: 'Need reordering', value: '${suggestions.length}', sub: 'cover ${lead + cover} days', color: Colors.orange.shade800),
          StatCard(label: 'Est. order value', value: st.money(suggestions.fold<double>(0, (a, r) => a + r.cost))),
          StatCard(label: 'Dead stock', value: '${dead.length}', sub: '${st.money(deadValue)} tied up', color: Theme.of(context).colorScheme.error),
          StatCard(label: 'Open purchase orders', value: '${orders.where((o) => o['status'] != 'Received').length}', color: Colors.deepPurple),
        ]),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'reorder', label: Text('Reorder suggestions')), ButtonSegment(value: 'dead', label: Text('Dead stock')), ButtonSegment(value: 'orders', label: Text('Purchase orders'))],
            selected: {_tab},
            onSelectionChanged: (x) => setState(() => _tab = x.first),
          ),
        ),
        const SizedBox(height: 8),
        if (_tab == 'reorder') ...[
          Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.end, children: [
            DropdownButton<int>(value: _window, items: const [DropdownMenuItem(value: 30, child: Text('Last 30 days')), DropdownMenuItem(value: 60, child: Text('Last 60 days')), DropdownMenuItem(value: 90, child: Text('Last 90 days'))],
                onChanged: (x) => setState(() => _window = x ?? 30)),
            numBox('Supplier lead time (days)', lead, (x) => _lead = x),
            numBox('Order enough for (days)', cover, (x) => _cover = x),
            ExportButtons(name: 'reorder', settings: st, csv: () => [
              for (final r in chosen)
                {'medicine': r.p.name, 'inStock': r.stock, 'soldPerDay': r.perDay.toStringAsFixed(2), 'daysLeft': r.daysLeft.isFinite ? r.daysLeft.floor() : '', 'orderQty': r.qty,
                  'supplier': r.buy?.supplierName ?? '', 'lastCost': (r.buy?.cost ?? 0) > 0 ? r.buy!.cost : r.p.cost},
            ]),
            if (can.contains('medicines.manage'))
              OutlinedButton.icon(onPressed: () => _levels(saleList, d), icon: const Icon(Icons.auto_fix_high), label: const Text('Set reorder levels from sales')),
            FilledButton.icon(
              onPressed: chosen.isEmpty ? null : () async {
                final groups = {for (final r in chosen) r.buy?.supplierId ?? ''}.length;
                if (!await confirmAction(context, 'Create $groups purchase order${groups == 1 ? '' : 's'}?', '${chosen.length} medicines, grouped by the supplier you buy each from.', 'Create')) return;
                final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
                await createPurchaseOrders(ref.read(recordStoreProvider), chosen, supplierNames: {for (final x in d.suppliers) x.id: x.name}, user: user, branchId: d.branch);
                if (!context.mounted) return;
                say(context, 'Purchase orders created');
                setState(() => _tab = 'orders');
              },
              icon: const Icon(Icons.assignment_outlined),
              label: Text('Create purchase orders (${chosen.length})'),
            ),
          ]),
          ExpansionTile(title: const Text('How the order quantity is worked out'), children: [
            Padding(padding: const EdgeInsets.all(8), child: Text('Order qty = sells per day (last $_window days) × (lead time $lead + cover $cover days) − in stock, rounded up. '
                'A medicine with no sales in that window but at or below its reorder level is suggested at 2 × reorder level − in stock. Listed when the stock lasts '
                '${lead + cover} days or less, or is at or below the reorder level. The reorder level itself (set on each medicine) drives the Low stock alerts.')),
          ]),
          Row(children: [
            const Text('Order each medicine from  '),
            SegmentedButton<bool>(segments: const [ButtonSegment(value: true, label: Text('Cheapest supplier')), ButtonSegment(value: false, label: Text('Last supplier'))],
                selected: {_cheapest}, onSelectionChanged: (x) => setState(() {
                  _cheapest = x.first;
                  _chosen.clear();
                })),
          ]),
          if (suggestions.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Stock levels look healthy. Nothing needs ordering.')),
          for (final r in suggestions)
            ListTile(
              leading: Checkbox(value: _picked[r.p.id] ?? true, onChanged: (x) => setState(() => _picked[r.p.id] = x ?? false)),
              title: Text(r.p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
                Text('in stock ${formatQty(r.stock)} · sells ${r.perDay.toStringAsFixed(1)}/day · days left ${r.daysLeft.isFinite ? r.daysLeft.floor() : '—'} · buy from'),
                if (r.options.length > 1)
                  DropdownButton<String>(
                    value: r.buy?.supplierId,
                    isDense: true,
                    items: [for (final (n, o) in r.options.indexed) DropdownMenuItem(value: o.supplierId, child: Text('${n == 0 ? '★ ' : ''}${o.supplierName} · ${st.money(o.cost)}'))],
                    onChanged: (x) => setState(() => _chosen[r.p.id] = x ?? ''),
                  )
                else
                  Text(r.buy?.supplierName ?? '—'),
                if (r.options.length > 1 && r.buy != null && r.buy!.cost > r.options.first.cost)
                  Text('${st.money(r.buy!.cost - r.options.first.cost)} more than ${r.options.first.supplierName}', style: TextStyle(color: Colors.orange.shade800, fontSize: 12)),
              ]),
              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('order ${formatQty(r.qty)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(st.money(r.cost), style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
        ],
        if (_tab == 'dead') ...[
          Wrap(spacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
            numBox('Not sold for at least (days)', deadDays, (x) => _dead = x < 7 ? 90 : x),
            const Text('Consider returning these to the supplier, discounting them, or moving them to a branch where they sell.'),
          ]),
          if (dead.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No dead stock. Everything is moving.')),
          for (final r in dead)
            ListTile(
              title: Text(r.p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('last sold ${r.last.isEmpty ? 'never' : '${dayOf(r.last)} (${r.idle} days)'} · in stock ${formatQty(r.stock)}'
                  '${d.stock.batchesOf(r.p.id).where((b) => b.qty > 0 && b.expiry.isNotEmpty).firstOrNull?.expiry.let((e) => ' · next expiry $e') ?? ''}'),
              trailing: Text(st.money(r.value), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
        ],
        if (_tab == 'orders') ...[
          if (orders.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No purchase orders yet. Create them from Reorder suggestions.')),
          for (final po in orders)
            ListTile(
              title: Text('${po['number']} · ${po['supplierName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${dayOf('${po['date']}')} · ${((po['items'] as List?) ?? const []).length} lines · ${po['status']}'),
              trailing: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(st.money(_poValue(po))),
                TextButton(onPressed: () => _openPo(po, d), child: const Text('Open')),
                if (po['status'] != 'Received') FilledButton.tonal(onPressed: () => context.go('/add-stock?po=${po['id']}'), child: const Text('Receive')),
              ]),
            ),
        ],
      ]),
    );
  }

  double _poValue(Map<String, Object?> po) => ((po['items'] as List?) ?? const []).cast<Map>().fold<double>(0, (a, i) => a + ((i['qty'] as num?) ?? 0) * ((i['cost'] as num?) ?? 0));

  Future<void> _levels(List<Sale> sales, PharmacyData d) async {
    final st = d.settings;
    final days = (st.raw['autoReorderDays'] as num?)?.round() ?? 30, lead = (st.raw['leadDays'] as num?)?.round() ?? 7, safety = (st.raw['safetyDays'] as num?)?.round() ?? 7;
    final changes = computeReorderLevels(sales, d.products, days: days, lead: lead, safety: safety, branch: d.branch);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Reorder levels from sales'),
        content: SizedBox(
          width: 520,
          child: ListView(shrinkWrap: true, children: [
            Text('Level = average daily sales over the last $days days × (lead time $lead + safety $safety days). Only medicines that sold are changed. '
                '${st.raw['autoReorder'] == false ? 'Weekly automatic updates are off (Settings → Receipts & stock).' : 'RxPOS also does this automatically every week.'}'),
            if (changes.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('All reorder levels already match recent sales.')),
            for (final x in changes)
              ListTile(dense: true, title: Text(x.product.name), subtitle: Text('sold ${formatQty(x.sold)} · ${x.perDay.toStringAsFixed(1)} a day'),
                  trailing: Text('${formatQty(x.product.reorder)} → ${x.level}', style: const TextStyle(fontWeight: FontWeight.w700))),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: changes.isEmpty ? null : () => Navigator.pop(c, true), child: Text('Apply ${changes.length} change${changes.length == 1 ? '' : 's'}')),
        ],
      ),
    );
    if (ok != true) return;
    final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    await applyReorderLevels(ref.read(recordStoreProvider), changes, user: user, branchId: d.branch);
    if (mounted) say(context, '${changes.length} reorder levels updated');
  }

  Future<void> _openPo(Map<String, Object?> po, PharmacyData d) async {
    final st = d.settings;
    final supplier = d.suppliers.where((x) => x.id == po['supplierId']).firstOrNull;
    final phone = normalizePhone(supplier?.phone ?? '');
    final items = ((po['items'] as List?) ?? const []).cast<Map>();
    Future<void> markSent() async {
      if (po['status'] == 'Draft') await ref.read(recordStoreProvider).update((x) => x.put('purchaseOrders', {...po, 'status': 'Sent'}));
    }

    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Purchase order ${po['number']}'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${st.name} · ${dayOf('${po['date']}')}\nTo: ${po['supplierName']} · ${po['status']}'),
            const Divider(),
            for (final (n, i) in items.indexed)
              Row(children: [Expanded(child: Text('${n + 1}. ${i['name']} × ${formatQty(i['qty'] as num? ?? 0)} @ ${st.money(i['cost'] as num? ?? 0)}')), Text(st.money(((i['qty'] as num?) ?? 0) * ((i['cost'] as num?) ?? 0)))]),
            const Divider(),
            Text('Estimated total ${st.money(_poValue(po))}', style: const TextStyle(fontWeight: FontWeight.w800), textAlign: TextAlign.right),
          ])),
        ),
        actions: [
          if (po['status'] != 'Received')
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
              onPressed: () async {
                if (!await confirmAction(c, 'Delete this purchase order?', '${po['number']} · ${po['supplierName']}', 'Delete')) return;
                await ref.read(recordStoreProvider).update((x) => x.del('purchaseOrders', po['id'] as String));
                if (c.mounted) Navigator.pop(c);
              },
              child: const Text('Delete'),
            ),
          TextButton.icon(
            onPressed: phone.length < 12 ? null : () async {
              await markSent();
              await launchUrl(Uri.parse(whatsappLink(phone, poText(po, st.name))), mode: LaunchMode.externalApplication);
            },
            icon: const Icon(Icons.chat_outlined),
            label: Text(phone.length < 12 ? 'Add the supplier’s phone number first' : 'WhatsApp to supplier'),
          ),
          FilledButton.icon(
            onPressed: () async {
              await markSent();
              await Printing.layoutPdf(name: '${po['number']}', onLayout: (_) => tablesPdf(st, title: 'Purchase order ${po['number']}', subtitle: 'To: ${po['supplierName']} · ${dayOf('${po['date']}')}', tables: [
                PdfTable(head: const ['#', 'Medicine', 'Qty', 'Last cost', 'Total'], numeric: const [2, 3, 4], body: [
                  for (final (n, i) in items.indexed) ['${n + 1}', '${i['name']}', formatQty(i['qty'] as num? ?? 0), st.money(i['cost'] as num? ?? 0), st.money(((i['qty'] as num?) ?? 0) * ((i['cost'] as num?) ?? 0))],
                ], foot: ['', '', '', 'Estimated total', st.money(_poValue(po))]),
              ]));
            },
            icon: const Icon(Icons.print),
            label: const Text('Print'),
          ),
        ],
      ),
    );
  }
}

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}

/// Expiring / Expired (src/pages/Inventory.jsx Expiry): batches in stock expiring within the warning days, or expired,
/// earliest first; return one to the supplier, or write off an expired one; PDF.
class ExpiryScreen extends ConsumerStatefulWidget {
  const ExpiryScreen({super.key});
  @override
  ConsumerState<ExpiryScreen> createState() => _ExpiryScreenState();
}

class _ExpiryScreenState extends ConsumerState<ExpiryScreen> {
  String _tab = 'soon';

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final session = ref.watch(sessionControllerProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final st = d.settings;
    final warn = st.expiryWarnDays.round();
    final e = expiryBatches(d.products.where((p) => d.stockOf(p.id) > 0), d.stock.batchesOf, d.stockOf, warn);
    final rows = _tab == 'expired' ? e.expired : e.soon;
    double worth((Product, BatchStock, int) x) => x.$2.qty * (x.$2.cost != 0 ? x.$2.cost : x.$1.cost);
    final value = rows.fold(0.0, (a, x) => a + worth(x));
    final title = _tab == 'expired' ? 'Expired stock' : 'Expiring within $warn days';
    return PageFrame(
      title: 'Expiring / Expired',
      subtitle: '${rows.length} batches · ${st.money(value)} at cost',
      actions: [
        ExportButtons(
          name: _tab == 'expired' ? 'expired-stock' : 'expiring-stock',
          settings: st,
          title: title,
          subtitle: '${rows.length} batches in stock · ${st.money(value)} at cost',
          pdf: () => [
            PdfTable(head: const ['Medicine', 'Batch', 'Expiry', 'When', 'Qty', 'Value'], numeric: const [4, 5], body: [
              for (final (p, b, days) in rows) [p.name, b.batch, b.expiry, days < 0 ? '${-days} days ago' : days == 0 ? 'today' : 'in $days days', formatQty(b.qty), st.money(b.qty * (b.cost != 0 ? b.cost : p.cost))],
            ]),
          ],
        ),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [ButtonSegment(value: 'soon', label: Text('Expiring within $warn days (${e.soon.length})')), ButtonSegment(value: 'expired', label: Text('Expired (${e.expired.length})'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: rows.isEmpty
              ? EmptyState(_tab == 'expired' ? 'No expired stock 🎉' : 'Nothing expiring soon 🎉')
              : ListView.separated(
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final (p, b, days) = rows[i];
                    return ListTile(
                      title: Text(p.name),
                      subtitle: Text('batch ${b.batch} · ${formatQty(b.qty)} in stock · ${st.money(b.qty * (b.cost != 0 ? b.cost : p.cost))} · expires ${b.expiry} (${days < 0 ? '${-days} days ago' : days == 0 ? 'today' : 'in $days days'})'),
                      leading: Icon(days < 0 ? Icons.error_outline : Icons.schedule, color: days < 0 ? Theme.of(context).colorScheme.error : Colors.orange.shade800),
                      trailing: Wrap(spacing: 4, children: [
                        if (can.contains('stock.receive') || can.contains('stock.adjust'))
                          TextButton(onPressed: () => returnDialog(context, ref, p, b, days < 0 ? 'Expired' : 'Short expiry'), child: const Text('Return')),
                        if (_tab == 'expired' && session?.role != 'cashier')
                          TextButton(
                            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                            onPressed: () async {
                              if (!await confirmAction(context, 'Write off expired stock?', '${formatQty(b.qty)} × ${p.name} (batch ${b.batch}) will be removed from stock.', 'Write off')) return;
                              await writeOffBatch(ref.read(recordStoreProvider), p, b, settings: st, user: session?.userName ?? '', branchId: d.branch);
                              if (context.mounted) say(context, '${p.name} batch ${b.batch} written off');
                            },
                            child: const Text('Write off'),
                          ),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

