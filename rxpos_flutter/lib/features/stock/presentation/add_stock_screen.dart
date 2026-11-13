import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:rxpos/core/platform.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/gs1.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/packs.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../../purchases/domain/reorder.dart' show supplierPrices, SupplierPrice;
import '../../sales_pos/presentation/camera_scan.dart';
import '../domain/delivery.dart';
import '../domain/stock_form.dart';
import 'invoice_scan.dart';
import '../../../screens/ai_vision_scanner_screen.dart';
import '../../../core/presentation/page_tip.dart';

/// Add Stock (src/pages/Purchases.jsx AddStock): a delivery laid out like the supplier's invoice. Search or scan each
/// medicine (not in the list? add it as new); type the line total (the unit cost is shown, worked out as total ÷ qty,
/// and cannot be typed) and the retail price (a medicine in the list keeps its price until you type one; cost + markup
/// is offered, applied only when tapped); batch and expiry per line. Columns can be moved (kept on
/// this device); dates are typed in this device's format. Save as draft (synced) or receive. The unfinished delivery
/// is kept on this device. [po]: receive a purchase order; [draft]: carry on a saved draft.
class AddStockScreen extends ConsumerStatefulWidget {
  const AddStockScreen({super.key, this.po = '', this.draft = ''});
  final String po, draft;
  @override
  ConsumerState<AddStockScreen> createState() => _AddStockScreenState();
}

class _AddStockScreenState extends ConsumerState<AddStockScreen> {
  Map<String, Object?>? _form;
  bool _restored = false, _busy = false, _checked = false;
  Map<String, Object?>? _scanned;
  Map<String, Object?>? _saved;
  String _q = '';
  final _search = TextEditingController();
  int _round = 0; // rebuilds the typed boxes after the form is replaced
  final _totalRev = <String, int>{}; // rebuilds one line's total box when the app changes the total (not while it is typed)
  Timer? _keep;

  String get _draftKey => 'addstock-draft-${ref.read(pharmacyProvider).value?.branch ?? 'main'}';

  @override
  void dispose() {
    _keep?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _init(PharmacyData d) async {
    final s = d.settings;
    if (widget.draft.isNotEmpty) {
      final dr = await ref.read(recordStoreProvider).get('drafts', widget.draft);
      if (dr != null) return setState(() => _form = formFromDraft(dr, s));
    }
    if (widget.po.isNotEmpty) {
      final po = await ref.read(recordStoreProvider).get('purchaseOrders', widget.po);
      if (po != null) {
        final ls = linesFromPo(po, d.byId, s);
        return setState(() => _form = {...blankForm(s), 'supplierId': po['supplierId'] ?? '', 'poId': po['id'], 'lines': ls.isEmpty ? [blankLine()] : ls});
      }
    }
    final raw = await ref.read(deviceValueProvider(_draftKey).future);
    if (raw != null) {
      try {
        final f = (jsonDecode(raw) as Map).cast<String, Object?>();
        final ls = lines(f).where((l) => l['productId'] == newMedicine || d.byId.containsKey(l['productId'])).toList();
        if (ls.isNotEmpty) {
          return setState(() {
            _form = {...blankForm(s), ...f, 'lines': ls};
            _restored = true;
          });
        }
      } catch (_) {/* no usable draft */}
    }
    setState(() => _form = blankForm(s));
  }

  void _set(Map<String, Object?> f) {
    setState(() => _form = f);
    _keep?.cancel();
    _keep = Timer(const Duration(milliseconds: 300), () {
      final has = lines(f).any((l) => '${l['productId'] ?? ''}'.isNotEmpty);
      ref.read(deviceValueProvider(_draftKey).notifier).set(has ? jsonEncode(f) : null).ignore();
    });
  }

  void _setLine(String key, Map<String, Object?> patch) {
    final f = _form!;
    final next = [for (final l in lines(f)) l['key'] == key ? editLine(l, patch) : l];
    final before = lines(f).where((l) => l['key'] == key).firstOrNull, after = next.where((l) => l['key'] == key).firstOrNull;
    if (!patch.containsKey('total') && before?['total'] != after?['total']) _totalRev[key] = (_totalRev[key] ?? 0) + 1;
    _set({...f, 'lines': next});
  }

  void _replaceLine(String key, Line line) => _set({..._form!, 'lines': [for (final l in lines(_form!)) l['key'] == key ? {...line, 'key': key} : l]});

  String _placeLine(Line line) {
    final ls = lines(_form!);
    final empty = ls.where((l) => '${l['productId'] ?? ''}'.isEmpty).firstOrNull;
    if (empty != null) {
      _replaceLine('${empty['key']}', line);
    } else {
      _set({..._form!, 'lines': [...ls, line]});
    }
    _search.clear();
    setState(() {
      _q = '';
      _round++; // the boxes show the placed line
    });
    return '${empty?['key'] ?? line['key']}';
  }

  void _pick(Product p, PharmacyData d) => _placeLine(lineFor(p, d.settings));
  void _addNew(String name, {String barcode = ''}) => _placeLine({...blankLine(), 'productId': newMedicine, 'name': name.trim(), if (barcode.isNotEmpty) 'barcode': barcode});

  /// A GS1 pack code (workplan step 21): the medicine with that product number gets a line with the batch and expiry
  /// filled; an unknown product number starts a new medicine with them filled. Returns what to tell the user.
  String _receivePack(Gs1 g, PharmacyData d) {
    final p = d.byGtin(g.gtin);
    final extra = {if (g.batch.isNotEmpty) 'batch': g.batch, if (g.expiry.isNotEmpty) 'expiry': g.expiry};
    if (p != null) {
      _placeLine(lineFor(p, d.settings, extra: extra));
      return '${p.name} added${g.batch.isNotEmpty ? ' · batch ${g.batch}' : ''}';
    }
    _placeLine({...blankLine(), 'productId': newMedicine, 'name': '', 'barcode': g.gtin, ...extra});
    return 'New product number: type the medicine name';
  }

  void _discard(PharmacyData d) {
    setState(() {
      _form = blankForm(d.settings);
      _scanned = null;
      _checked = false;
      _restored = false;
      _round++;
    });
    ref.read(deviceValueProvider(_draftKey).notifier).set(null).ignore();
  }

  Future<void> _receive(PharmacyData d) async {
    final f = _form!;
    final problem = checkForm(f, scanned: _scanned != null, checked: _checked);
    if (problem != null) return say(context, problem, error: true);
    final below = belowCost(f, d.byId);
    if (below.isNotEmpty &&
        !await confirmAction(context, 'Selling below cost?', '${below.take(5).join(', ')}${below.length > 5 ? '…' : ''}: the retail price is lower than the cost. Receive anyway?', 'Receive anyway')) {
      return;
    }
    setState(() => _busy = true);
    try {
      final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
      final rec = await receiveForm(ref.read(recordStoreProvider), f, data: d, user: user, scanned: _scanned != null);
      if (!mounted) return;
      _discard(d);
      setState(() => _saved = rec);
    } on DeliveryProblem catch (e) {
      if (mounted) say(context, e.message, error: true);
    } catch (e) {
      if (mounted) say(context, 'The delivery was NOT received: $e Nothing was added to stock; the lines are still here to try again.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveDraft(PharmacyData d) async {
    final session = await ref.read(sessionControllerProvider.future);
    try {
      final scan = _scanned == null
          ? null
          : ({...?_scanned, 'pages': _scanned!['pagePaths'] ?? const [], 'unclear': toCheck(lines(_form!))}
            ..remove('pagePaths')
            ..remove('pageImages'));
      await saveDeliveryDraft(ref.read(recordStoreProvider), _form!, data: d, userId: session?.userId ?? '', userName: session?.userName ?? '', scan: scan);
      if (!mounted) return;
      say(context, 'Delivery saved as a draft. Find it in Purchase History → Drafts.');
      _discard(d);
    } on DeliveryProblem catch (e) {
      if (mounted) say(context, e.message, error: true);
    }
  }

  Future<void> _newSupplier(PharmacyData d) async {
    final v = await editRecord(context, title: 'New supplier', save: 'Add supplier', fields: const [
      FormFieldSpec('name', 'Supplier name', required: true, hint: 'e.g. Aim Pharmaceuticals Ltd'),
      FormFieldSpec('phone', 'Phone'),
      FormFieldSpec('contact', 'Contact person'),
      FormFieldSpec('email', 'Email'),
    ]);
    if (v == null) return;
    try {
      final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
      final r = await addSupplier(ref.read(recordStoreProvider), d.suppliers, name: '${v['name']}', phone: '${v['phone'] ?? ''}', contact: '${v['contact'] ?? ''}',
          email: '${v['email'] ?? ''}', user: user, branchId: d.branch);
      _set({..._form!, 'supplierId': r.id});
      if (mounted) say(context, r.existed ? '${v['name']} is already in your suppliers: chosen' : 'Supplier ${v['name']} added');
    } on DeliveryProblem catch (e) {
      if (mounted) say(context, e.message, error: true);
    }
  }

  Future<void> _rename(Product p, PharmacyData d) async {
    final v = await editRecord(context, title: 'Rename medicine', save: 'Save name', initial: {'name': p.name}, fields: const [
      FormFieldSpec('name', 'Medicine name', required: true, hint: 'The new name is used everywhere; stock, prices and history stay as they are'),
    ]);
    if (v == null) return;
    try {
      final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
      await renameMedicine(ref.read(recordStoreProvider), p, '${v['name']}', d.products, user: user, branchId: d.branch);
      if (mounted) say(context, 'Renamed to ${v['name']}');
    } on DeliveryProblem catch (e) {
      if (mounted) say(context, e.message, error: true);
    }
  }

  Future<void> _choose(Line l, PharmacyData d) async {
    final picked = await showAppDialog<Object>(context: context, builder: (_) => _MedicinePicker(data: d, hint: (l['read'] as Map?)?['name'] as String?));
    if (picked == null) return;
    if (picked is Product) {
      final next = lineFor(picked, d.settings, extra: {'qty': l['qty'], 'batch': l['batch'], 'expiry': l['expiry'], if (l['read'] != null) 'read': l['read']});
      final read = l['read'] != null && ('${l['cost'] ?? ''}'.isNotEmpty || '${l['total'] ?? ''}'.isNotEmpty);
      _replaceLine('${l['key']}', read ? editLine(next, l['by'] == 'total' ? {'total': l['total']} : {'cost': l['cost']}) : next);
    } else {
      _replaceLine('${l['key']}', {...l, 'productId': newMedicine, 'name': '$picked', 'auto': true});
    }
    setState(() => _round++);
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    if (d == null) return const Center(child: CircularProgressIndicator());
    if (_form == null) {
      Future.microtask(() => _init(d));
      return const Center(child: CircularProgressIndicator());
    }
    final f = _form!;
    final s = d.settings;
    final th = Theme.of(context);
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final cols = columnOrder(((jsonDecode(ref.watch(deviceValueProvider('stock-cols')).value ?? '[]') as List).cast<String>()));
    final dateFmt = ref.watch(deviceValueProvider('dateFormat')).value ?? 'dmy';
    final banks = ref.watch(tableProvider('banks')).value ?? const [];
    final purchases = ref.watch(tableProvider('purchases')).value ?? const [];
    final session = ref.watch(sessionControllerProvider).value;
    final myDrafts = d.drafts.where((x) => x.kind == 'delivery' && x.userId == session?.userId && x.id != f['draftId']).toList();
    final prices = supplierPrices(purchases);
    final total = formTotal(f);
    final ql = _q.trim().toLowerCase();
    final matches = ql.isEmpty ? <Product>[] : searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).take(8).toList();
    final exactName = ql.isNotEmpty && d.products.any((p) => p.name.trim().toLowerCase() == ql);
    final paidNow = '${f['paid'] ?? ''}'.trim().isEmpty ? total : (double.tryParse('${f['paid']}') ?? 0).clamp(0, double.infinity).toDouble();
    final supplier = d.suppliers.where((x) => x.id == f['supplierId']).firstOrNull;
    final scanned = _scanned;

    Future<void> moveCol(String c, int to) async {
      final next = [...cols]..remove(c);
      next.insert(to.clamp(0, next.length), c);
      await ref.read(deviceValueProvider('stock-cols').notifier).set(jsonEncode(next));
    }

    Widget box(String key, String label, Object? value, ValueChanged<String>? on, {double w = 110, bool number = true, String? hint}) => SizedBox(
          width: w,
          child: TextFormField(
            key: Key('$key-$_round'),
            initialValue: '${value ?? ''}',
            readOnly: on == null, // shown, not typed (the unit cost)
            decoration: InputDecoration(labelText: label, hintText: hint, isDense: true, filled: on == null),
            keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
            onChanged: on,
          ),
        );

    Widget cell(String c, Line l, int index) {
      final key = '${l['key']}';
      final p = d.byId['${l['productId']}'];
      final cost = baseCost(l), price = double.tryParse('${l['price'] ?? ''}') ?? 0, suggested = markupFor(l, f['markup'], s);
      final packs = p == null ? const <Pack>[] : packsOf(p);
      return switch (c) {
        'medicine' => SizedBox(
            width: 260,
            child: l['productId'] == newMedicine
                ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                      const Chip(label: Text('New'), visualDensity: VisualDensity.compact),
                      TextButton(onPressed: () => _replaceLine(key, {...l, 'productId': ''}), child: const Text('choose existing')),
                    ]),
                    box('name-$key', 'New medicine name', l['name'], (v) => _replaceLine(key, {...l, 'name': v}), w: 250, number: false, hint: 'e.g. Action Tabs 4s'),
                    DropdownButton<String>(
                      value: medicineForms.contains(l['form']) ? '${l['form']}' : 'Others',
                      isDense: true,
                      items: [for (final x in medicineForms) DropdownMenuItem(value: x, child: Text(x))],
                      onChanged: (v) => _replaceLine(key, {...l, 'form': v}),
                    ),
                  ])
                : Row(children: [
                    Expanded(
                      child: OutlinedButton(
                        key: Key('pick-$index'),
                        style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
                        onPressed: () => _choose(l, d),
                        child: Text(p?.name ?? ((l['read'] as Map?)?['name'] != null ? 'Search: ${(l['read'] as Map)['name']}' : 'Search medicine…'), overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    if (p != null && can.contains('medicines.manage')) IconButton(tooltip: 'Rename medicine', icon: const Icon(Icons.edit_outlined, size: 18), onPressed: () => _rename(p, d)),
                  ]),
          ),
        'qty' => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            box('qty-$key', 'Qty', l['qty'], (v) => _setLine(key, {'qty': v}), w: 80),
            // received by the box (or any pack), sold by the unit; a pack size the medicine doesn't have is added to it
            if ('${l['productId'] ?? ''}'.isNotEmpty) ...() {
              final unit = p != null && p.unit.isNotEmpty ? p.unit : unitForForm('${l['form'] ?? ''}');
              final size = double.tryParse('${l['recvSize'] ?? 1}') ?? 1;
              final known = packs.any((k) => k.name == l['recvPack'] && k.size == size);
              final choice = l['newPack'] == true || (size > 1 && !known) ? newPackChoice : size > 1 ? '${l['recvPack']}' : '';
              return [
                SizedBox(
                  width: 120,
                  child: DropdownButton<String>(
                    key: Key('received-as-$key'),
                    value: choice,
                    isDense: true,
                    isExpanded: true,
                    items: [
                      DropdownMenuItem(value: '', child: Text('${unit}s', overflow: TextOverflow.ellipsis)),
                      for (final k in packs) DropdownMenuItem(value: k.name, child: Text('${k.name}s of ${formatQty(k.size)}', overflow: TextOverflow.ellipsis)),
                      DropdownMenuItem(value: newPackChoice, child: Text(packs.isEmpty ? 'Boxes / packs of…' : 'Other pack size…', overflow: TextOverflow.ellipsis)),
                    ],
                    onChanged: (v) {
                      if (v == newPackChoice) {
                        _replaceLine(key, {...l, 'newPack': true, 'recvPack': '${l['recvPack'] ?? ''}'.isEmpty ? 'Box' : l['recvPack'], 'recvSize': size > 1 ? l['recvSize'] : ''});
                      } else {
                        final k = packs.where((x) => x.name == v).firstOrNull;
                        final sz = k?.size ?? 1;
                        _setLine(key, {'newPack': false, 'recvPack': k?.name ?? '', 'recvSize': sz, if (baseCost(l) > 0) 'cost': numOrBlank(baseCost(l) * sz)});
                      }
                      setState(() => _round++);
                    },
                  ),
                ),
                if (choice == newPackChoice)
                  Wrap(spacing: 4, runSpacing: 4, children: [
                    box('pack-name-$key', 'Pack', l['recvPack'], (v) => _replaceLine(key, {...l, 'recvPack': v}), w: 58, number: false, hint: 'Box'),
                    box('pack-size-$key', '${unit}s', l['recvSize'] == '' ? '' : l['recvSize'], (v) => _setLine(key, {'recvSize': v}), w: 58, hint: '100'),
                  ]),
              ];
            }(),
            if ((double.tryParse('${l['recvSize'] ?? 1}') ?? 1) > 1)
              Text('= ${formatQty((double.tryParse('${l['qty']}') ?? 0) * (double.tryParse('${l['recvSize']}') ?? 1))} ${(p?.unit.isEmpty ?? true ? unitForForm('${l['form'] ?? ''}') : p!.unit).toLowerCase()}s', style: th.textTheme.bodySmall),
          ]),
        'cost' => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            // not typed: line total ÷ quantity (the owner's choice, 2026-11-13)
            box('cost-$key-${numOrBlank(l['cost'])}', 'Unit cost', numOrBlank(l['cost']), null, w: 110),
            Text((double.tryParse('${l['recvSize'] ?? 1}') ?? 1) > 1 ? 'per ${'${l['recvPack'] ?? 'pack'}'.toLowerCase()} · total ÷ qty' : 'total ÷ qty', style: th.textTheme.bodySmall),
            if (() {
              final best = (prices['${l['productId']}'] ?? const <SupplierPrice>[]).where((o) => o.supplierId != f['supplierId']).firstOrNull;
              return best != null && cost > 0 && best.cost < cost ? best : null;
            }() case final SupplierPrice best)
              Text('${best.supplierName}: ${s.money(best.cost)}', style: TextStyle(color: Colors.orange.shade800, fontSize: 12)),
          ]),
        'total' => box('total-$key-${_totalRev[key] ?? 0}', 'Line total', l['total'], (v) => _setLine(key, {'total': v}), w: 120),
        'price' => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            // typed only: never set from the cost, the total, the quantity, the pack or the markup (the owner's choice, 2026-11-13)
            // the hint: an emptied box keeps today's price; a medicine with no price shows cost + markup
            box('price-$key', 'New retail price', l['price'], (v) => _setLine(key, {'price': v}), w: 120,
                hint: p != null && p.price > 0 ? '${formatQty(p.price)} (kept)' : suggested > 0 ? formatQty(suggested) : null),
            Wrap(spacing: 4, children: [
              if (l['auto'] != true && p != null && p.price > 0)
                InkWell(onTap: () {
                  _setLine(key, {'price': ''});
                  setState(() => _round++);
                }, child: Text('↺ undo', style: TextStyle(color: th.colorScheme.primary, fontSize: 12))),
              // cost + markup is offered, applied only when tapped
              if (suggested > 0 && suggested != price)
                InkWell(
                  key: Key('use-price-$key'),
                  onTap: () {
                    _setLine(key, {'price': formatQty(suggested)});
                    setState(() => _round++);
                  },
                  child: Text('Use ${s.money(suggested)} (+${f['markup']}%)', style: TextStyle(color: th.colorScheme.primary, fontSize: 12)),
                ),
              if (cost > 0 && price > 0)
                Text(price < cost ? 'below cost' : 'margin ${((price - cost) / cost * 100).round()}%', style: TextStyle(fontSize: 12, color: price < cost ? th.colorScheme.error : null)),
              if (p != null && price != p.price && p.price > 0) Text('was ${s.money(p.price)}', style: th.textTheme.bodySmall),
            ]),
          ]),
        'batch' => box('batch-$key', 'Batch', l['batch'], (v) => _replaceLine(key, {...l, 'batch': v}), w: 110, number: false),
        'expiry' => _DateCell(
            key: Key('expiry-$key-$_round'),
            label: 'Expiry',
            value: '${l['expiry'] ?? ''}',
            format: dateFmt,
            monthYear: true,
            onChanged: (v) => _replaceLine(key, {...l, 'expiry': v}),
          ),
        _ => const SizedBox(),
      };
    }

    return ListView(padding: const EdgeInsets.all(16), children: [
      // the title, then the two scan buttons beside it (or under it on a phone)
      Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text('Add Stock', style: th.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        Wrap(spacing: 8, runSpacing: 8, children: [
        OutlinedButton.icon(onPressed: () async {
          final r = await scanInvoices(context, ref);
          if (r == null || !mounted) return;
          if (r.drafts) {
            if (context.mounted) context.go('/purchases?tab=drafts');
            return;
          }
          final applied = applyScan(r.result!, _form!, d);
          setState(() {
            _form = applied.form;
            _scanned = {...applied.summary, 'pagePaths': r.pagePaths, 'pageImages': r.pageImages};
            _checked = false;
            _round++;
          });
        }, icon: const Icon(Icons.document_scanner_outlined), label: const Text('Scan invoice')),
        // Scan Invoice with AI (screens/ai_vision_scanner_screen.dart): the checked lines go on the form like a scanned
        // invoice, in single units (boxes × units per box, the cost per unit), to be confirmed before receiving
        FilledButton.icon(key: const Key('ai-scan-invoice'), onPressed: () async {
          final r = await openVisionScanner(context, 'invoice');
          if (r is! List<VisionInvoiceLine> || r.isEmpty || !mounted) return;
          final items = [
            for (final l in r)
              {
                'name': d.byId[l.productId]?.name ?? l.name, 'batch': l.batch, 'expiry': l.expiry, 'qty': l.units, 'unitCost': l.unitCost,
                'lineTotal': l.units * l.unitCost, 'unclear': l.productId == null,
              },
          ];
          final applied = applyScan({'supplier': '', 'invoiceNo': '', 'date': '', 'total': 0, 'linesTotal': items.fold<double>(0, (a, x) => a + (x['lineTotal'] as num)), 'totalMatches': true, 'readings': 1, 'items': items}, _form!, d);
          setState(() {
            _form = applied.form;
            _scanned = {...applied.summary, 'pagePaths': const <String>[], 'pageImages': const <String>[]};
            _checked = false;
            _round++;
          });
        }, icon: const Icon(Icons.auto_awesome), label: const Text('Scan Invoice with AI')),
        ]),
      ]),
      const PageTip(
        id: 'add-stock',
        title: 'Receiving a delivery',
        text: 'Search or scan each medicine (not in the list? type its name and add it as a new medicine). Type the line total from the invoice: the unit cost is worked out (total ÷ qty). Type the new retail price: a medicine already in the list keeps its price until you do, and cost + markup is offered. Scan invoice reads a photo for you.',
      ),
      if (f['draftId'] != null && '${f['draftId']}'.isNotEmpty)
        const _Notice('Continuing a saved draft. Receiving it removes it from Drafts; "Save as draft" keeps your changes in it.'),
      if (myDrafts.isNotEmpty)
        _Notice('You have ${myDrafts.length} saved deliver${myDrafts.length == 1 ? 'y' : 'ies'}.', action: ('Open drafts', () => context.go('/purchases?tab=drafts'))),
      if (_restored && scanned == null)
        _Notice('Your unfinished delivery was kept on this device. Carry on, or start again.', action: ('Start again', () => _discard(d)), action2: ('Carry on', () => setState(() => _restored = false))),
      if (scanned != null) ScanNotice(scanned: scanned, form: f, total: total, settings: s, onDiscard: () => _discard(d), onAddSupplier: () async {
        final user = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
        final r = await addSupplier(ref.read(recordStoreProvider), d.suppliers, name: '${scanned['supplier']}', user: user, branchId: d.branch);
        _set({..._form!, 'supplierId': r.id});
        setState(() => _scanned = {...scanned, 'supplierMatched': true});
      }),
      if (_saved != null)
        _Notice('Received ${(_saved!['items'] as List).length} item(s) worth ${s.money((_saved!['total'] as num?) ?? 0)} from ${_saved!['supplierName']}'
            '${(_saved!['items'] as List).cast<Map>().any((i) => i['added'] == true) ? ' (${(_saved!['items'] as List).cast<Map>().where((i) => i['added'] == true).length} new medicine(s) added to the list)' : ''}.'
            '${((_saved!['paid'] as num?) ?? 0) < ((_saved!['total'] as num?) ?? 0) ? ' ${s.money(((_saved!['total'] as num?) ?? 0) - ((_saved!['paid'] as num?) ?? 0))} added to creditors.' : ''}'),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 24, runSpacing: 12, alignment: WrapAlignment.spaceBetween, children: [
              SizedBox(
                width: 320,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  DropdownButtonFormField<String>(
                    key: Key('supplier-$_round-${f['supplierId']}'),
                    initialValue: d.suppliers.any((x) => x.id == f['supplierId']) ? '${f['supplierId']}' : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Supplier'),
                    items: [
                      for (final x in [...d.suppliers]..sort((a, b) => a.name.compareTo(b.name))) DropdownMenuItem(value: x.id, child: Text(x.name)),
                      if (can.contains('suppliers') || can.contains('stock.receive')) const DropdownMenuItem(value: '__new_supplier__', child: Text('➕ New supplier…')),
                    ],
                    onChanged: (v) => v == '__new_supplier__' ? _newSupplier(d) : _set({...f, 'supplierId': v ?? ''}),
                  ),
                  if (supplier != null)
                    Text([supplier.contact, supplier.phone, supplier.email, supplier.address].where((x) => x.isNotEmpty).join(' · '), style: th.textTheme.bodySmall),
                  const SizedBox(height: 8),
                  Text('Delivered to', style: th.textTheme.labelSmall),
                  Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text([s.address, s.phone].where((x) => x.isNotEmpty).join(' · '), style: th.textTheme.bodySmall),
                ]),
              ),
              SizedBox(
                width: 330,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Purchase invoice', style: th.textTheme.titleLarge),
                  Text('Goods received', style: th.textTheme.bodySmall),
                  box('invoice', 'Invoice no.', f['invoice'], (v) => _set({...f, 'invoice': v}), w: 320, number: false, hint: 'as on the invoice'),
                  Row(children: [
                    Expanded(child: _DateCell(key: Key('date-$_round-$dateFmt'), label: 'Date', value: '${f['date'] ?? ''}', format: dateFmt, onChanged: (v) => _set({...f, 'date': v.isEmpty ? today() : v}))),
                    DropdownButton<String>(
                      value: dateFmt,
                      items: [for (final (k, l) in dateFormats) DropdownMenuItem(value: k, child: Text(l))],
                      onChanged: (v) {
                        ref.read(deviceValueProvider('dateFormat').notifier).set(v);
                        setState(() => _round++);
                      },
                    ),
                  ]),
                  // only the offered cost + markup price follows it; no retail price changes on its own
                  box('markup', 'Retail markup %', f['markup'], (v) => _set({...f, 'markup': v}), w: 320),
                ]),
              ),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              if (onAndroid)
                IconButton.filledTonal(tooltip: 'Scan medicines into the delivery', icon: const Icon(Icons.qr_code_scanner), onPressed: () => scanContinuous(context, title: 'Scan medicines into the delivery', onCode: (code) async {
                  final g = parseGs1(code);
                  if (g != null) return _receivePack(g, d);
                  final p = d.byBarcode[code];
                  if (p != null) {
                    _pick(p, d);
                    return '${p.name} added';
                  }
                  _addNew('', barcode: code);
                  return 'New barcode: type the medicine name';
                })),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  key: const Key('stock-search'),
                  controller: _search,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search or scan a medicine to add… (Enter adds the first match)'),
                  onChanged: (v) => setState(() => _q = v),
                  onSubmitted: (_) {
                    if (ql.isEmpty) return;
                    final g = parseGs1(_q);
                    if (g != null) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_receivePack(g, d))));
                      setState(() => _round++);
                      return;
                    }
                    final code = d.byBarcode.entries.where((e) => e.key.toLowerCase() == ql).firstOrNull?.value;
                    if (code != null || matches.isNotEmpty) {
                      _pick(code ?? matches.first, d);
                    } else if (ql.length > 1) {
                      _addNew(_q);
                    }
                    setState(() => _round++);
                  },
                ),
              ),
            ]),
            if (ql.isNotEmpty)
              Card(
                child: Column(children: [
                  for (final p in matches)
                    ListTile(dense: true, title: Text(p.name), subtitle: Text('${formatQty(d.stockOf(p.id))} in stock · cost ${s.money(p.cost)} · retail ${s.money(p.price)}'), onTap: () {
                      _pick(p, d);
                      setState(() => _round++);
                    }),
                  if (!exactName && ql.length > 1)
                    ListTile(dense: true, leading: const Icon(Icons.add), title: Text('Add “${_q.trim()}” as a new medicine'), onTap: () {
                      _addNew(_q);
                      setState(() => _round++);
                    }),
                ]),
              ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const SizedBox(width: 32, child: Text('#')),
                  for (final (i, c) in cols.indexed)
                    SizedBox(
                      width: switch (c) { 'medicine' => 260, 'qty' => 120, 'cost' => 140, 'total' => 130, 'price' => 170, 'batch' => 120, _ => 170 } + 8,
                      child: Row(children: [
                        Flexible(child: Text(stockColumns[c]!, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
                        InkWell(onTap: i == 0 ? null : () => moveCol(c, i - 1), child: Tooltip(message: 'Move ${stockColumns[c]} left', child: Icon(Icons.chevron_left, size: 18, color: i == 0 ? Theme.of(context).disabledColor : null))),
                        InkWell(onTap: i == cols.length - 1 ? null : () => moveCol(c, i + 1), child: Tooltip(message: 'Move ${stockColumns[c]} right', child: Icon(Icons.chevron_right, size: 18, color: i == cols.length - 1 ? Theme.of(context).disabledColor : null))),
                      ]),
                    ),
                ]),
                const Divider(),
                for (final (i, l) in lines(f).indexed)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(width: 32, child: Padding(padding: const EdgeInsets.only(top: 12), child: Text('${i + 1}'))),
                      for (final c in cols)
                        SizedBox(
                          width: switch (c) { 'medicine' => 260, 'qty' => 120, 'cost' => 140, 'total' => 130, 'price' => 170, 'batch' => 120, _ => 170 } + 8,
                          child: Align(alignment: Alignment.topLeft, child: cell(c, l, i)),
                        ),
                      IconButton(tooltip: 'Remove line', icon: const Icon(Icons.close), onPressed: () {
                        final ls = lines(f);
                        _set({...f, 'lines': ls.length > 1 ? ls.where((x) => x['key'] != l['key']).toList() : [blankLine()]});
                        setState(() => _round++);
                      }),
                    ]),
                  ),
                for (final l in lines(f).where((l) => l['read'] != null))
                  Text('Line ${lines(f).indexOf(l) + 1} on the invoice: ${(l['read'] as Map)['name']}${checkTextOf(l['read'] as Map).isEmpty ? '' : ' · check ${checkTextOf(l['read'] as Map)}'}',
                      style: TextStyle(fontSize: 12, color: '${l['productId'] ?? ''}'.isEmpty || (l['read'] as Map)['unclear'] == true ? Colors.orange.shade800 : null)),
              ]),
            ),
            Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              TextButton(onPressed: () => _set({...f, 'lines': [...lines(f), blankLine()]}), child: const Text('+ Add line')),
              TextButton.icon(onPressed: () => _addNew(''), icon: const Icon(Icons.auto_awesome, size: 16), label: const Text('New medicine')),
              if (cols.join() != stockColumns.keys.join()) TextButton(onPressed: () => ref.read(deviceValueProvider('stock-cols').notifier).set(null), child: const Text('reset column order')),
              Text('Type the line total from the invoice; the unit cost is worked out (total ÷ qty). Retail prices change only when you type one (or tap Use for cost + markup); a new medicine needs one.', style: th.textTheme.bodySmall),
            ]),
            const Divider(),
            Wrap(spacing: 24, runSpacing: 12, alignment: WrapAlignment.spaceBetween, children: [
              SizedBox(
                width: 420,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  TextFormField(key: Key('notes-$_round'), initialValue: '${f['notes'] ?? ''}', maxLines: 3,
                      decoration: const InputDecoration(labelText: 'Remarks', hintText: 'e.g. 2 cartons short, supplier to deliver Friday'), onChanged: (v) => _set({...f, 'notes': v})),
                  Row(children: [
                    box('paid', 'Amount paid now (blank = paid in full)', f['paid'], (v) => _set({...f, 'paid': v}), w: 230),
                    const SizedBox(width: 12),
                    Expanded(child: DropdownButtonFormField<String>(
                      initialValue: banks.any((b) => b['id'] == f['bankId']) ? '${f['bankId']}' : null,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Paid from'),
                      items: [for (final b in banks) DropdownMenuItem(value: '${b['id']}', child: Text('${b['name']}'))],
                      onChanged: (v) => _set({...f, 'bankId': v ?? 'cash-drawer'}),
                    )),
                  ]),
                ]),
              ),
              SizedBox(
                width: 280,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _TotalRow('Lines', '${lines(f).where((l) => '${l['productId'] ?? ''}'.isNotEmpty).length}'),
                  _TotalRow('Sub-total', s.money(total)),
                  _TotalRow('Total', s.money(total), bold: true),
                  _TotalRow('Amount paid', s.money(paidNow < total ? paidNow : total)),
                  _TotalRow('Balance (on credit)', s.money(total - paidNow > 0 ? total - paidNow : 0), warn: paidNow < total),
                ]),
              ),
            ]),
            if (scanned != null)
              CheckboxListTile(value: _checked, onChanged: (v) => setState(() => _checked = v ?? false),
                  title: const Text('I have checked every line against the invoice (medicine, quantity, cost, batch and expiry)')),
            const SizedBox(height: 8),
            () {
              final note = Text(lines(f).any((l) => '${l['productId'] ?? ''}'.isNotEmpty) ? "Check the lines against the supplier's invoice, then receive." : 'Add the medicines on the invoice.',
                  style: th.textTheme.bodySmall);
              final keep = OutlinedButton(onPressed: () => _saveDraft(d), child: const Text('Save as draft'));
              final receive = FilledButton(onPressed: _busy || (scanned != null && !_checked) ? null : () => _receive(d), child: const Text('Receive stock'));
              // a phone: the note above, the two buttons sharing the width under it
              if (MediaQuery.sizeOf(context).width < 600) {
                return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  note,
                  const SizedBox(height: 8),
                  Row(children: [Expanded(child: keep), const SizedBox(width: 8), Expanded(child: receive)]),
                ]);
              }
              return Row(children: [Expanded(child: note), keep, const SizedBox(width: 8), receive]);
            }(),
          ]),
        ),
      ),
    ]);
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow(this.label, this.value, {this.bold = false, this.warn = false});
  final String label, value;
  final bool bold, warn;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(fontWeight: bold ? FontWeight.w800 : null))),
          Text(value, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: warn ? Colors.orange.shade800 : null)),
        ]),
      );
}

class _Notice extends StatelessWidget {
  const _Notice(this.text, {this.action, this.action2});
  final String text;
  final (String, VoidCallback)? action, action2;
  @override
  Widget build(BuildContext context) => Card(
        color: Theme.of(context).colorScheme.secondaryContainer,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(children: [
            const Icon(Icons.info_outline, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(text)),
            if (action2 != null) TextButton(onPressed: action2!.$2, child: Text(action2!.$1)),
            if (action != null) TextButton(onPressed: action!.$2, child: Text(action!.$1)),
          ]),
        ),
      );
}

/// A date typed in this device's format (dd/mm/yyyy …), or picked; month/year is enough for an expiry.
class _DateCell extends StatefulWidget {
  const _DateCell({super.key, required this.label, required this.value, required this.format, required this.onChanged, this.monthYear = false});
  final String label, value, format;
  final bool monthYear;
  final ValueChanged<String> onChanged;
  @override
  State<_DateCell> createState() => _DateCellState();
}

class _DateCellState extends State<_DateCell> {
  late final _c = TextEditingController(text: widget.value.isEmpty ? '' : showDate(widget.value, widget.format));
  bool _bad = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// An expiry (monthYear) is read whatever its format: 06/2028, JUN 2028, 30/06/2028, 062028… (parseExpiry)
  String _read(String t) => widget.monthYear ? (parseExpiry(t, widget.format) ?? '') : parseTypedDate(t, widget.format);

  @override
  Widget build(BuildContext context) {
    final iso = _read(_c.text);
    final past = widget.monthYear && iso.isNotEmpty && daysUntil(iso) < 0;
    // how a typed expiry was read, when it was typed another way (JUN 2028 → 30/06/2028)
    final readAs = widget.monthYear && iso.isNotEmpty && _c.text.trim() != showDate(iso, widget.format) ? 'Read as ${showDate(iso, widget.format)}' : null;
    return SizedBox(
      width: 170,
      child: TextField(
        controller: _c,
        decoration: InputDecoration(
          labelText: widget.label,
          isDense: true,
          hintText: dateFormats.firstWhere((x) => x.$1 == widget.format).$2,
          errorText: _bad ? (widget.monthYear ? 'Try 06/2028 or JUN 2028' : 'Not a date') : past ? 'Already passed' : null,
          helperText: readAs,
          suffixIcon: IconButton(
            tooltip: 'Pick a date',
            icon: const Icon(Icons.calendar_today, size: 16),
            onPressed: () async {
              final now = DateTime.now();
              final dd = await showDatePicker(context: context, firstDate: DateTime(2015), lastDate: DateTime(now.year + 15), initialDate: DateTime.tryParse(iso) ?? now);
              if (dd == null) return;
              final v = localDate(dd);
              _c.text = showDate(v, widget.format);
              setState(() => _bad = false);
              widget.onChanged(v);
            },
          ),
        ),
        onChanged: (v) {
          final p = _read(v);
          setState(() => _bad = v.trim().isNotEmpty && p.isEmpty);
          if (p.isNotEmpty || v.trim().isEmpty) widget.onChanged(p);
        },
      ),
    );
  }
}

/// Choose a medicine by typing (in-stock first), or add a new one by name.
class _MedicinePicker extends StatefulWidget {
  const _MedicinePicker({required this.data, this.hint});
  final PharmacyData data;
  final String? hint;
  @override
  State<_MedicinePicker> createState() => _MedicinePickerState();
}

class _MedicinePickerState extends State<_MedicinePicker> {
  late String _q = widget.hint ?? '';
  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final found = searchProducts(d.products, _q, stockOf: (p) => d.stockOf(p.id)).take(50).toList();
    return AlertDialog(
      title: TextFormField(key: const Key('picker-search'), initialValue: _q, autofocus: true, decoration: const InputDecoration(hintText: 'Search medicine…', prefixIcon: Icon(Icons.search)),
          onChanged: (v) => setState(() => _q = v)),
      content: SizedBox(
        width: 480,
        height: 420,
        child: ListView(children: [
          for (final p in found)
            ListTile(title: Text(p.name), subtitle: Text(p.generic), trailing: Text(d.stockOf(p.id) > 0 ? '${formatQty(d.stockOf(p.id))} in stock' : 'none in stock'),
                onTap: () => Navigator.pop(context, p)),
          ListTile(leading: const Icon(Icons.add), title: Text('New medicine (not in the list)${_q.trim().isEmpty ? '' : ': ${_q.trim()}'}'), onTap: () => Navigator.pop(context, _q.trim())),
        ]),
      ),
    );
  }
}

