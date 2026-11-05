import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/draft.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/packs.dart';
import '../../../core/rules/search.dart';
import '../../auth/application/session_controller.dart';
import '../application/sale_controller.dart';
import '../domain/cart.dart';
import 'camera_scan.dart';
import 'checkout_dialogs.dart';
import 'pos_dialogs.dart';
import 'receipt.dart';

/// The till. Type or scan to add (Enter adds the exact barcode, or the first match); F8 back to the search, F9
/// charge, Alt+H hold the sale. On a phone the sale opens from the bar at the bottom.
class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key, this.wholesale = false});

  final bool wholesale;

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  String _q = '';

  /// '' all, 'instock', 'recent', 'fav', or 'cat:' + a category (like the React till's filters)
  String _view = '';

  SaleController get _sale => ref.read(saleControllerProvider(widget.wholesale).notifier);

  void _say(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? Theme.of(context).colorScheme.error : null));
  }

  Future<void> _try(Future<void> Function() f) async {
    try {
      await f();
    } on CartProblem catch (e) {
      _say(e.message, error: true);
    }
  }

  /// Add a medicine; when only expired stock is left, the pharmacist may sell it with a reason.
  Future<void> _add(Product p) => _try(() async {
    try {
      await _sale.add(p);
    } on OnlyExpiredLeft {
      if (!mounted) return;
      final why = await askExpiredReason(context, p.name);
      if (why != null) await _sale.add(p, expiredReason: why);
    }
  });

  /// Alt+→ / Alt+←: carry on with the next / previous held sale (the current one is held).
  Future<void> _switchHeld(int by) async {
    final d = await ref.read(pharmacyProvider.future);
    final held = heldSales(d, widget.wholesale);
    if (held.isEmpty) return;
    await _sale.resume(by > 0 ? held.first : held.last);
  }

  Future<void> _submitSearch(PharmacyData d, List<Product> results) async {
    final code = _search.text.trim();
    if (code.isEmpty) return;
    final byCode = d.byBarcode[code];
    if (byCode != null) {
      await _add(byCode);
      _clearSearch();
      return;
    }
    if (results.isNotEmpty) {
      await _add(results.first);
      _clearSearch();
    } else {
      _say('No medicine matches "$code"');
    }
  }

  void _clearSearch() {
    _search.clear();
    setState(() => _q = '');
    _searchFocus.requestFocus();
  }

  Future<void> _charge() async {
    final d = await ref.read(pharmacyProvider.future);
    final s = ref.read(saleControllerProvider(widget.wholesale));
    if (s.lines.isEmpty || !mounted) return;
    final method = s.method ?? d.methods.first;
    ControlledEntry? cd;
    MomoPaid? momo;
    var rx = false;
    if (s.lines.any((l) => l.controlled)) {
      cd = await askControlled(context, patient: s.customerId == walkIn ? '' : s.customerName);
      if (cd == null) return;
    } else if (s.lines.any((l) => l.rx)) {
      rx = await confirm(
        context,
        'Prescription-only medicine',
        'Confirm that a valid prescription has been checked for the Rx items in this sale.',
        'Prescription verified',
      );
      if (!rx) return;
    }
    if (method.type == 'momo' && mounted) {
      final total = totalsOf(s.lines, discount: s.discount, settings: d.settings).total;
      final phone = d.customers.where((x) => x.id == s.customerId && x.id != walkIn).firstOrNull?.phone ?? '';
      momo = await askMomo(
        context,
        total: total,
        amount: formatMoney(total, currency: d.settings.currency),
        phone: phone,
      );
      if (momo == null) return;
    }
    final client = d.customers.where((x) => x.id == s.customerId && x.id != walkIn).firstOrNull;
    try {
      final sale = await _sale.complete(controlled: cd, momo: momo?.momo, rxChecked: rx);
      if (!mounted) return;
      await showReceipt(context, sale, d.settings, phone: client?.phone ?? '', autoPrint: d.settings.autoPrint);
      _searchFocus.requestFocus();
    } on CartProblem catch (e) {
      _say(e.message, error: true);
    } catch (e) {
      _say('The sale was NOT recorded. $e', error: true); // the sale stays on the screen to charge again
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _searchFocus.requestFocus());
  }

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(pharmacyProvider);
    return data.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Could not open the pharmacy on this device: $e')),
      data: (d) {
        final favs = _favs(ref.watch(deviceValueProvider('pos-favs')).value);
        final recent = recentIds(ref.watch(tableProvider('sales')).value ?? const [], d.branch);
        final pool = filterProducts(d, _view, favs: favs, recent: recent);
        final results = _q.trim().isEmpty
            ? (_view == 'recent' ? pool : ([...pool]..sort((a, b) => (d.stockOf(b.id) > 0 ? 1 : 0) - (d.stockOf(a.id) > 0 ? 1 : 0)))).take(120).toList()
            : searchProducts(pool, _q, stockOf: (p) => d.stockOf(p.id)).take(120).toList();
        final wide = MediaQuery.sizeOf(context).width >= 900;
        final products = _ProductPanel(
          wholesale: widget.wholesale,
          data: d,
          results: results,
          controller: _search,
          focus: _searchFocus,
          onChanged: (v) => setState(() => _q = v),
          onSubmit: () => _submitSearch(d, results),
          onPick: _add,
          view: _view,
          favs: favs,
          categories: categoriesOf(d.products),
          onView: (v) => setState(() => _view = v),
          onStar: (p) => _toggleFav(favs, p.id),
          onCamera: Platform.isAndroid
              ? () async {
                  final code = await scanBarcode(context);
                  if (code == null) return;
                  final p = d.byBarcode[code.trim()];
                  p == null ? _say('No medicine has the barcode $code') : await _add(p);
                }
              : null,
        );
        final sale = _SalePanel(wholesale: widget.wholesale, data: d, onCharge: _charge, onError: (m) => _say(m, error: true));
        return Focus(
          // "?" opens the shortcuts, except while typing
          onKeyEvent: (_, e) {
            if (e is KeyDownEvent && e.character == '?' && FocusManager.instance.primaryFocus?.context?.widget is! EditableText) {
              showKeyboardHelp(context);
              return KeyEventResult.handled;
            }
            return KeyEventResult.ignored;
          },
          child: CallbackShortcuts(
            bindings: {
              const SingleActivator(LogicalKeyboardKey.f2): _searchFocus.requestFocus,
              const SingleActivator(LogicalKeyboardKey.f1): () => showKeyboardHelp(context),
              const SingleActivator(LogicalKeyboardKey.arrowRight, alt: true): () => _switchHeld(1),
              const SingleActivator(LogicalKeyboardKey.arrowLeft, alt: true): () => _switchHeld(-1),
              const SingleActivator(LogicalKeyboardKey.f8): _searchFocus.requestFocus,
              const SingleActivator(LogicalKeyboardKey.f9): _charge,
              const SingleActivator(LogicalKeyboardKey.enter, control: true): _charge,
              const SingleActivator(LogicalKeyboardKey.keyH, alt: true): () => _sale.hold(),
            },
            child: wide
                ? Row(
                    children: [
                      Expanded(child: products),
                      SizedBox(width: 460, child: sale),
                    ],
                  )
                : Column(
                    children: [
                      Expanded(child: products),
                      _SaleBar(wholesale: widget.wholesale, data: d, open: () => _openSale(sale)),
                    ],
                  ),
          ),
        );
      },
    );
  }

  static Set<String> _favs(String? raw) {
    try {
      return raw == null ? <String>{} : {for (final x in jsonDecode(raw) as List) '$x'};
    } catch (_) {
      return <String>{};
    }
  }

  Future<void> _toggleFav(Set<String> favs, String id) async {
    final next = favs.contains(id) ? ({...favs}..remove(id)) : {...favs, id};
    await ref.read(deviceValueProvider('pos-favs').notifier).set(jsonEncode([...next]));
  }

  void _openSale(Widget sale) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => SizedBox(height: MediaQuery.sizeOf(context).height * 0.9, child: sale),
  );
}

/// Held sales at this branch for this till, oldest first.
List<Draft> heldSales(PharmacyData d, bool wholesale) =>
    d.drafts.where((x) => x.kind == 'sale' && (x.mode.isEmpty || x.mode == (wholesale ? 'wholesale' : 'retail'))).toList()
      ..sort((a, b) => a.order.compareTo(b.order));

/// The medicines sold most recently at [branch]: the first 40 distinct, newest first (React: Recent filter).
List<String> recentIds(List<Map<String, Object?>> sales, String branch) {
  final list = sales.map(Sale.fromRecord).where((s) => s.branchId == branch && s.status != 'Refunded').toList()..sort((a, b) => b.date.compareTo(a.date));
  final out = <String>[];
  for (final s in list) {
    for (final i in s.items) {
      if (!out.contains(i.id)) out.add(i.id);
      if (out.length >= 40) return out;
    }
  }
  return out;
}

/// Up to 14 categories, as the till's filter chips.
List<String> categoriesOf(List<Product> products) {
  final out = <String>[];
  for (final p in products) {
    final c = p.category.trim();
    if (c.isNotEmpty && !out.contains(c)) out.add(c);
    if (out.length >= 14) break;
  }
  return out;
}

List<Product> filterProducts(PharmacyData d, String view, {required Set<String> favs, required List<String> recent}) {
  if (view == 'instock') return d.products.where((p) => d.stockOf(p.id) > 0).toList();
  if (view == 'fav') return d.products.where((p) => favs.contains(p.id)).toList();
  if (view == 'recent') return [for (final id in recent) ?d.byId[id]];
  if (view.startsWith('cat:')) return d.products.where((p) => p.category.trim() == view.substring(4)).toList();
  return d.products;
}

class _ProductPanel extends StatelessWidget {
  const _ProductPanel({
    required this.wholesale,
    required this.data,
    required this.results,
    required this.controller,
    required this.focus,
    required this.onChanged,
    required this.onSubmit,
    required this.onPick,
    this.onCamera,
    this.view = '',
    this.favs = const {},
    this.categories = const [],
    this.onView,
    this.onStar,
  });
  final String view;
  final Set<String> favs;
  final List<String> categories;
  final ValueChanged<String>? onView;
  final ValueChanged<Product>? onStar;

  final bool wholesale;
  final PharmacyData data;
  final List<Product> results;
  final TextEditingController controller;
  final FocusNode focus;
  final ValueChanged<String> onChanged;
  final VoidCallback onSubmit;
  final ValueChanged<Product> onPick;
  final VoidCallback? onCamera;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final s = data.settings;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  wholesale ? 'Wholesale' : 'Point of sale',
                  overflow: TextOverflow.ellipsis,
                  style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Text('${data.products.length} medicines', style: t.textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  focusNode: focus,
                  onChanged: onChanged,
                  onSubmitted: (_) => onSubmit(),
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Search medicine or scan barcode…  (F8)',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              if (onCamera != null) ...[
                const SizedBox(width: 8),
                IconButton.filledTonal(onPressed: onCamera, icon: const Icon(Icons.qr_code_scanner), tooltip: 'Scan with the camera'),
              ],
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ListView(
              key: const Key('pos-filters'),
              scrollDirection: Axis.horizontal,
              children: [
                for (final (v, label) in [
                  ('', 'All'),
                  ('instock', 'In stock'),
                  ('recent', 'Recent'),
                  ('fav', '★ Favourites'),
                  for (final c in categories) ('cat:$c', c),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(label: Text(label), selected: view == v, onSelected: (_) => onView?.call(v)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: results.isEmpty
                ? Center(
                    child: Text(
                      view == 'fav'
                          ? 'No favourites yet — tap ☆ on a medicine to keep it here'
                          : view == 'recent'
                          ? 'Nothing sold here yet'
                          : 'No medicines here',
                    ),
                  )
                : GridView.builder(
                    // taller cards when the phone's text size is larger (accessibility), so nothing is cut off
                    gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 230,
                      mainAxisExtent: MediaQuery.textScalerOf(context).scale(122),
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                    ),
                    itemCount: results.length,
                    itemBuilder: (_, i) {
                      final p = results[i];
                      final stock = data.stockOf(p.id);
                      final out = stock <= 0;
                      final low = !out && p.reorder > 0 && stock <= p.reorder;
                      return Card(
                        margin: EdgeInsets.zero,
                        child: InkWell(
                          onTap: out ? null : () => onPick(p),
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Text(
                                        p.name,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                    InkWell(
                                      key: Key('star-${p.id}'),
                                      onTap: onStar == null ? null : () => onStar!(p),
                                      child: Icon(
                                        favs.contains(p.id) ? Icons.star : Icons.star_border,
                                        size: 18,
                                        color: favs.contains(p.id) ? Colors.amber.shade700 : t.hintColor,
                                      ),
                                    ),
                                  ],
                                ),
                                Text(
                                  [p.generic, p.form].where((x) => x.isNotEmpty).join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: t.textTheme.bodySmall,
                                ),
                                const Spacer(),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        formatMoney(
                                          priceOf(p, wholesale: wholesale),
                                          currency: s.currency,
                                          decimals: s.decimalPlaces,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(color: t.colorScheme.primary, fontWeight: FontWeight.w800),
                                      ),
                                    ),
                                    if (p.rx) const _Tag('Rx'),
                                    if (p.controlled) const _Tag('CD'),
                                    Text(
                                      out ? 'Out of stock' : '${formatQty(stock)} left',
                                      maxLines: 1,
                                      style: t.textTheme.bodySmall?.copyWith(
                                        color: out
                                            ? t.colorScheme.error
                                            : low
                                            ? Colors.orange.shade800
                                            : null,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(right: 6),
    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(5),
      border: Border.all(color: Theme.of(context).dividerColor),
    ),
    child: Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
  );
}

/// Phones: the sale's count and total, tap to open it.
class _SaleBar extends ConsumerWidget {
  const _SaleBar({required this.wholesale, required this.data, required this.open});
  final bool wholesale;
  final PharmacyData data;
  final VoidCallback open;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(saleControllerProvider(wholesale));
    final t = totalsOf(s.lines, discount: s.discount, settings: data.settings);
    return Material(
      color: Theme.of(context).colorScheme.primaryContainer,
      child: InkWell(
        onTap: open,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.shopping_cart_outlined),
              const SizedBox(width: 10),
              Expanded(child: Text(s.lines.isEmpty ? 'No items yet' : '${s.lines.length} item${s.lines.length == 1 ? '' : 's'}')),
              Text(
                formatMoney(t.total, currency: data.settings.currency, decimals: data.settings.decimalPlaces),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SalePanel extends ConsumerWidget {
  const _SalePanel({required this.wholesale, required this.data, required this.onCharge, required this.onError});
  final bool wholesale;
  final PharmacyData data;
  final VoidCallback onCharge;
  final ValueChanged<String> onError;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final th = Theme.of(context);
    final s = ref.watch(saleControllerProvider(wholesale));
    final c = ref.read(saleControllerProvider(wholesale).notifier);
    final can = ref.watch(permissionsProvider).value ?? const <String>{};
    final st = data.settings;
    String fmt(num n) => formatMoney(n, currency: st.currency, decimals: st.decimalPlaces);
    final t = totalsOf(s.lines, discount: s.discount, settings: st);
    final method = s.method ?? data.methods.first;
    final held = heldSales(data, wholesale);
    final customer = data.customers.where((x) => x.id == s.customerId).firstOrNull;
    void guard(void Function() f) {
      try {
        f();
      } on CartProblem catch (e) {
        onError(e.message);
      }
    }

    return Material(
      color: th.colorScheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (s.proforma != null) Text('Selling proforma ${s.proforma!['number']}', style: TextStyle(color: th.colorScheme.primary)),
            Row(
              children: [
                Text('Current sale', style: th.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const Spacer(),
                if (s.lines.isNotEmpty) TextButton.icon(onPressed: c.clear, icon: const Icon(Icons.delete_outline, size: 18), label: const Text('Clear all')),
              ],
            ),
            if (s.lines.isNotEmpty)
              Row(
                children: [
                  Checkbox(
                    key: const Key('tick-all'),
                    value: s.ticked.length == s.lines.length
                        ? true
                        : s.ticked.isEmpty
                        ? false
                        : null,
                    tristate: true,
                    onChanged: (_) => c.tickAll(s.ticked.length != s.lines.length),
                  ),
                  const Expanded(child: Text('Tick every line', overflow: TextOverflow.ellipsis)),
                  if (s.ticked.isNotEmpty)
                    TextButton.icon(
                      onPressed: c.removeTicked,
                      icon: const Icon(Icons.playlist_remove, size: 18),
                      label: Text('Remove ticked (${s.ticked.length})'),
                    ),
                ],
              ),
            if (held.isNotEmpty)
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final h in held)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: InputChip(
                          key: Key('held-${h.id}'),
                          avatar: const Icon(Icons.pause_circle_outline, size: 16),
                          label: Text('${h.title} · ${fmt(h.total)}'),
                          onPressed: () => c.resume(h),
                          deleteButtonTooltipMessage: 'Discard this held sale',
                          onDeleted: () async {
                            if (await confirm(context, 'Discard held sale?', '${h.title} · ${fmt(h.total)} will be thrown away.', 'Discard')) {
                              await c.discard(h);
                            }
                          },
                        ),
                      ),
                  ],
                ),
              ),
            if (st.clientCapture != 'off')
              Row(
                children: [
                  Expanded(
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: data.customers.any((x) => x.id == s.customerId) ? s.customerId : null,
                      hint: Text(st.clientCapture == 'required' ? '— choose a client —' : 'Walk-in (no client details)'),
                      items: [
                        for (final x in data.customers)
                          DropdownMenuItem(
                            value: x.id,
                            child: Text(x.id == walkIn ? 'Walk-in (no client details)' : '${x.name}${x.phone.isEmpty ? '' : ' · ${x.phone}'}'),
                          ),
                      ],
                      onChanged: (id) => c.customer(id!, data.customers.firstWhere((x) => x.id == id).name),
                    ),
                  ),
                  if (can.contains('customers'))
                    IconButton(
                      tooltip: 'Add a new client',
                      icon: const Icon(Icons.person_add_alt),
                      onPressed: () async {
                        final rec = await askNewClient(context);
                        if (rec == null) return;
                        final saved = await ref.read(recordStoreProvider).update((d) => d.put('customers', rec));
                        c.customer(saved['id'] as String, saved['name'] as String);
                      },
                    ),
                ],
              ),
            if (customer != null && customer.allergies.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(8),
                color: th.colorScheme.errorContainer,
                child: Text('Allergies: ${customer.allergies}', style: TextStyle(color: th.colorScheme.onErrorContainer)),
              ),
            const Divider(),
            Expanded(
              child: s.lines.isEmpty
                  ? const Center(child: Text('Tap a medicine or scan a barcode to start a sale'))
                  : ListView.separated(
                      itemCount: s.lines.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final l = s.lines[i];
                        final p = data.byId[l.id];
                        final packs = p == null ? const <Pack>[] : packsOf(p);
                        return Dismissible(
                          key: ValueKey('line-${l.id}'),
                          direction: DismissDirection.endToStart,
                          background: Container(
                            alignment: Alignment.centerRight,
                            color: th.colorScheme.errorContainer,
                            padding: const EdgeInsets.only(right: 16),
                            child: const Icon(Icons.delete_outline),
                          ),
                          onDismissed: (_) => c.remove(l.id),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                Checkbox(
                                  key: Key('tick-${l.id}'),
                                  value: s.ticked.contains(l.id),
                                  onChanged: (_) => c.tick(l.id),
                                  visualDensity: VisualDensity.compact,
                                ),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(l.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                      if (l.allowExpired)
                                        Text('Expired stock · ${l.expiredReason}', style: TextStyle(color: th.colorScheme.error, fontSize: 12)),
                                      if (l.directions != null)
                                        Text(
                                          ['dose', 'freq'].map((k) => '${l.directions![k] ?? ''}').where((x) => x.isNotEmpty).join(' ').ifBlank('Label ready'),
                                          style: th.textTheme.bodySmall,
                                        ),
                                      Wrap(
                                        crossAxisAlignment: WrapCrossAlignment.center,
                                        children: [
                                          if (packs.isNotEmpty)
                                            DropdownButton<String>(
                                              value: l.pack?.name ?? '',
                                              isDense: true,
                                              items: [
                                                DropdownMenuItem(value: '', child: Text(p!.unit.isEmpty ? 'Unit' : p.unit)),
                                                for (final k in packs) DropdownMenuItem(value: k.name, child: Text('${k.name} (${formatQty(k.size)})')),
                                              ],
                                              onChanged: (v) =>
                                                  c.pack(l.id, packs.where((k) => k.name == v).firstOrNull).catchError((Object e) => onError('$e')),
                                            ),
                                          const SizedBox(width: 6),
                                          InkWell(
                                            onTap: can.contains('pos.price_edit')
                                                ? () async {
                                                    final v = await askNumber(
                                                      context,
                                                      'Price per ${l.pack?.name.toLowerCase() ?? 'unit'}',
                                                      l.pack?.price ?? l.price,
                                                    );
                                                    if (v != null) c.price(l.id, v);
                                                  }
                                                : null,
                                            child: Text('@ ${fmt(l.pack?.price ?? l.price)}', style: th.textTheme.bodySmall),
                                          ),
                                          if (l.price < l.cost) Text('  below cost', style: TextStyle(color: th.colorScheme.error, fontSize: 12)),
                                          TextButton(
                                            key: Key('directions-${l.id}'),
                                            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                                            onPressed: () async {
                                              final dir = await askDirections(context, l, st, patient: s.customerId == walkIn ? '' : s.customerName);
                                              if (dir != null) c.directions(l.id, dir.isEmpty ? null : dir);
                                            },
                                            child: Text(l.directions == null ? 'Directions' : 'Label ✓'),
                                          ),
                                          if (p != null && data.features['drugInfo'] != false)
                                            TextButton(
                                              style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                                              onPressed: () => showDrugInfo(context, p, data),
                                              child: const Text('Drug info'),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(onPressed: () => guard(() => c.step(l.id, -1)), icon: const Icon(Icons.remove), tooltip: 'Less'),
                                SizedBox(
                                  width: 34,
                                  child: Text(
                                    formatQty(l.count),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                ),
                                IconButton(onPressed: () => guard(() => c.step(l.id, 1)), icon: const Icon(Icons.add), tooltip: 'More'),
                                SizedBox(
                                  width: 92,
                                  child: Text(
                                    fmt(l.total),
                                    textAlign: TextAlign.right,
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                ),
                                IconButton(onPressed: () => c.remove(l.id), icon: const Icon(Icons.close, size: 18), tooltip: 'Remove ${l.name}'),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            const Divider(),
            Row(
              children: [
                Expanded(child: Text('Subtotal ${fmt(t.subtotal)}')),
                if (can.contains('pos.discount'))
                  TextButton(
                    onPressed: () async {
                      final v = await askNumber(context, 'Discount (amount)', s.discount);
                      if (v != null) c.discount(v);
                    },
                    child: Text(t.discount > 0 ? 'Discount − ${fmt(t.discount)}' : 'Discount'),
                  ),
              ],
            ),
            if (t.tax > 0) Text('Tax (${formatQty(st.taxRate)}%) ${fmt(t.tax)}'),
            Row(
              children: [
                Text('Total', style: th.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const Spacer(),
                Text(
                  fmt(t.total),
                  style: th.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, color: th.colorScheme.primary),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final m in data.methods) ChoiceChip(label: Text(m.name), selected: m.id == method.id, onSelected: (_) => c.method(m))],
            ),
            if (method.type == 'cash' || method.type == 'credit') ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: ValueKey('tendered-${method.id}-${s.lines.isEmpty}'),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(labelText: method.type == 'credit' ? 'Paid now (rest on credit)' : 'Amount tendered', isDense: true),
                      onChanged: (v) => c.tendered(double.tryParse(v.replaceAll(',', ''))),
                    ),
                  ),
                  const SizedBox(width: 12),
                  if (method.type == 'cash')
                    Text(
                      'Change ${fmt((s.tendered ?? t.total) - t.total < 0 ? 0 : (s.tendered ?? t.total) - t.total)}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    )
                  else
                    Text(
                      'On credit ${fmt((t.total - (s.tendered ?? 0)).clamp(0, double.infinity))}',
                      style: TextStyle(color: Colors.orange.shade800, fontWeight: FontWeight.w700),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: s.lines.isEmpty ? null : () => c.hold(),
                  icon: const Icon(Icons.pause_circle_outline),
                  label: const Text('Hold'),
                ),
                if (can.contains('proformas') && data.features['proformas'] != false) ...[
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: s.lines.isEmpty
                        ? null
                        : () async {
                            final pf = await c.proformaNow();
                            if (context.mounted) say(context, 'Proforma ${pf['number']} saved (see Proformas)');
                          },
                    icon: const Icon(Icons.description_outlined),
                    label: const Text('Proforma'),
                  ),
                ],
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: s.lines.isEmpty ? null : onCharge,
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 18)),
                    child: Text('Charge ${fmt(t.total)}   [F9]', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

extension on String {
  String ifBlank(String other) => trim().isEmpty ? other : this;
}
