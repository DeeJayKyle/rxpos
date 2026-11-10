import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rxpos/core/platform.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/people.dart';
import '../../../core/rules/permissions.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/draft.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/presentation/backdrop.dart';
import '../../../core/presentation/hardware_hud.dart';
import '../../../core/presentation/resizable.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/drug_class.dart';
import '../../../core/theme/design_tokens.dart';
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
import '../../../core/presentation/page_tip.dart';
import '../../../core/rules/stock.dart' show mainBranch;

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
      ref.read(lastScanProvider.notifier).now(); // for the hardware status bar
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

  /// The sale line the keyboard works on: the chosen one (Alt+↑/↓), else the last (src/pages/POS.jsx lineAt).
  CartLine? _lineAt() {
    final s = ref.read(saleControllerProvider(widget.wholesale));
    if (s.lines.isEmpty) return null;
    return s.cursor >= 0 && s.cursor < s.lines.length ? s.lines[s.cursor] : s.lines.last;
  }

  bool get _typingElsewhere {
    final f = FocusManager.instance.primaryFocus;
    return f != null && f != _searchFocus && f.context?.widget is EditableText;
  }

  bool get _searchEmpty => _search.text.trim().isEmpty;

  /// Alt+↑ / Alt+↓: choose a line of the sale.
  void _moveCursor(int by) {
    final s = ref.read(saleControllerProvider(widget.wholesale));
    if (s.lines.isEmpty) return;
    final cur = s.cursor >= 0 && s.cursor < s.lines.length ? s.cursor : s.lines.length - 1;
    _sale.cursor((cur + by).clamp(0, s.lines.length - 1));
  }

  /// + / −: one more or one less of the chosen line (from the empty search box); Delete removes it.
  KeyEventResult _lineKey(KeyEvent e) {
    if (e is! KeyDownEvent || _typingElsewhere) return KeyEventResult.ignored;
    final l = _lineAt();
    if (l == null) return KeyEventResult.ignored;
    final k = e.logicalKey, ch = e.character;
    final plus = ch == '+' || k == LogicalKeyboardKey.numpadAdd || k == LogicalKeyboardKey.add;
    final minus = ch == '-' || k == LogicalKeyboardKey.numpadSubtract || k == LogicalKeyboardKey.minus;
    if ((plus || minus) && _searchEmpty) {
      _sale.step(l.id, plus ? 1 : -1);
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.delete && _searchEmpty) {
      _sale.remove(l.id);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  /// Alt+1…9: the payment method in that place.
  Future<void> _methodKey(int n) async {
    final d = await ref.read(pharmacyProvider.future);
    if (n <= d.methods.length) _sale.method(d.methods[n - 1]);
  }

  /// F10: save the sale as a proforma (staff who may).
  Future<void> _proformaKey() async {
    final d = await ref.read(pharmacyProvider.future);
    final can = ref.read(permissionsProvider).value ?? const <String>{};
    if (!can.contains('proformas') || d.features['proformas'] == false || ref.read(saleControllerProvider(widget.wholesale)).lines.isEmpty) return;
    final pf = await _sale.proformaNow();
    if (mounted) _say('Proforma ${pf['number']} saved (see Proformas)');
  }

  /// Alt+D: the discount (staff who may).
  Future<void> _discountKey() async {
    final can = ref.read(permissionsProvider).value ?? const <String>{};
    if (!can.contains('pos.discount')) return;
    final v = await askNumber(context, 'Discount (amount)', ref.read(saleControllerProvider(widget.wholesale)).discount);
    if (v != null) _sale.discount(v);
  }

  /// Alt+R: the last receipt at this branch again.
  Future<void> _lastReceipt() async {
    final d = await ref.read(pharmacyProvider.future);
    final sales = (await ref.read(recordStoreProvider).rows('sales')).where((x) => '${x['branchId'] ?? mainBranch}' == d.branch).toList()
      ..sort((a, b) => '${b['date']}'.compareTo('${a['date']}'));
    if (!mounted) return;
    if (sales.isEmpty) return _say('No sale at this branch yet', error: true);
    final phone = d.customers.where((x) => x.id == sales.first['customerId'] && x.id != walkIn).firstOrNull?.phone ?? '';
    await showReceipt(context, sales.first, d.settings, phone: phone);
  }

  Future<void> _charge() async {
    final d = await ref.read(pharmacyProvider.future);
    final s = ref.read(saleControllerProvider(widget.wholesale));
    if (s.lines.isEmpty || !mounted) return;
    final method = s.method ?? d.methods.first;
    // step 20: the role's discount ceiling (a proforma's discount was set by whoever made the quotation)
    final session0 = ref.read(sessionControllerProvider).value;
    final roles = (await ref.read(tableProvider('roles').future)).map(Role.fromRecord);
    if (!mounted) return;
    final maxDisc = maxDiscountOf(roles, session0?.role ?? '');
    final sub = totalsOf(s.lines, discount: s.discount, settings: d.settings).subtotal;
    if (maxDisc != null && s.discount > 0 && sub > 0 && s.proforma == null && s.discount / sub * 100 > maxDisc + 1e-9) {
      _say('Your role may give at most ${maxDisc % 1 == 0 ? maxDisc.toInt() : maxDisc}% discount (${d.settings.money((sub * maxDisc / 100).floorToDouble())} on this sale)', error: true);
      return;
    }
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
    // step 8: a credit sale over the client's limit: Finance roles go on; others give a reason (audited, flagged)
    Map<String, Object?>? creditOver;
    if (method.type == 'credit') {
      final over = await _sale.creditCheck();
      if (over != null) {
        final can = ref.read(permissionsProvider).value ?? const <String>{};
        final base = <String, Object?>{'limit': over.limit, 'owed': over.owed, 'adds': over.adds};
        if (can.contains('finance')) {
          creditOver = {...base, 'finance': true};
        } else {
          if (!mounted) return;
          String m(double v) => formatMoney(v, currency: d.settings.currency, decimals: d.settings.decimalPlaces);
          final why = await askCreditReason(context, client: s.customerName, owed: m(over.owed), adds: m(over.adds), limit: m(over.limit));
          if (why == null) return;
          creditOver = {...base, 'reason': why};
        }
      }
    }
    try {
      final sale = await _sale.complete(controlled: cd, momo: momo?.momo, rxChecked: rx, creditOver: creditOver);
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
        final stored = ref.watch(deviceValueProvider('pos-layout')).value;
        final layout = posLayouts.any((x) => x.$1 == stored) ? stored! : 'standard';
        final advanced = wide && layout == 'advanced';
        final productPanel = _ProductPanel(
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
          layout: wide ? layout : null,
          onLayout: (v) => ref.read(deviceValueProvider('pos-layout').notifier).set(v),
          onCommand: advanced ? () => _openCommandBar(d) : null,
          onCamera: onAndroid
              ? () async {
                  await scanContinuous(context, title: 'Scan items into the sale', onCode: (code) async {
                    final p = d.byBarcode[code.trim()];
                    if (p == null) return null;
                    ref.read(lastScanProvider.notifier).now();
                    await _add(p);
                    return '${p.name} added';
                  });
                  _searchFocus.requestFocus();
                }
              : null,
        );
        final touch = Theme.of(context).platform == TargetPlatform.android;
        final products = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
            child: PageTip(
              id: 'pos',
              title: 'Selling quickly',
              text: touch
                  ? 'Tap a medicine to add it. The sale waits at the bottom with the total and Charge; tap it to see the lines. The camera button scans barcodes.'
                  : 'Type or scan to add, ↑↓ and Enter to pick. Alt+H holds a sale while you serve the next customer, F9 charges. Press ? for every shortcut.',
            ),
          ),
          Expanded(child: productPanel),
        ]);
        final sale = _SalePanel(wholesale: widget.wholesale, data: d, onCharge: _charge, onError: (m) => _say(m, error: true), advanced: advanced);
        final client = wide && layout != 'classic' && d.settings.clientCapture != 'off'
            ? _ClientStrip(wholesale: widget.wholesale, data: d, focus: _clientFocus, onDone: _searchFocus.requestFocus)
            : null;
        return Focus(
          // "?" opens the shortcuts, except while typing
          onKeyEvent: (_, e) {
            if (e is KeyDownEvent && e.character == '?' && FocusManager.instance.primaryFocus?.context?.widget is! EditableText) {
              showKeyboardHelp(context);
              return KeyEventResult.handled;
            }
            return _lineKey(e);
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
              const SingleActivator(LogicalKeyboardKey.keyC, alt: true): _clientFocus.requestFocus,
              const SingleActivator(LogicalKeyboardKey.keyD, alt: true): _discountKey,
              const SingleActivator(LogicalKeyboardKey.keyR, alt: true): _lastReceipt,
              const SingleActivator(LogicalKeyboardKey.f10): _proformaKey,
              const SingleActivator(LogicalKeyboardKey.arrowUp, alt: true): () => _moveCursor(-1),
              const SingleActivator(LogicalKeyboardKey.arrowDown, alt: true): () => _moveCursor(1),
              for (final (i, k) in const [
                LogicalKeyboardKey.digit1, LogicalKeyboardKey.digit2, LogicalKeyboardKey.digit3, LogicalKeyboardKey.digit4, LogicalKeyboardKey.digit5,
                LogicalKeyboardKey.digit6, LogicalKeyboardKey.digit7, LogicalKeyboardKey.digit8, LogicalKeyboardKey.digit9,
              ].indexed)
                SingleActivator(k, alt: true): () => _methodKey(i + 1),
              if (advanced) const SingleActivator(LogicalKeyboardKey.keyK, control: true): () => _openCommandBar(d),
            },
            child: wide
                // the sale panel's width is dragged on the handle beside it (kept on this device)
                ? ResizableSplit(
                    storeKey: 'pos-sale-w',
                    initial: tokensOf(context).splitPane ? 520 : 460,
                    leftMin: client != null && advanced ? 630 : 360,
                    left: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Advanced UI: three columns (client · medicines · sale); Standard: the client strip over the medicines
                        if (client != null && advanced) SizedBox(width: 270, child: client),
                        Expanded(child: client != null && !advanced ? Column(children: [client, Expanded(child: products)]) : products),
                      ],
                    ),
                    right: sale,
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

  final _clientFocus = FocusNode();

  Future<void> _openCommandBar(PharmacyData d) async {
    final pay = await showDialog<bool>(
      context: context,
      builder: (_) => _CommandBar(wholesale: widget.wholesale, data: d, onAdd: _add),
    );
    if (pay == true) await _charge();
    if (mounted) _searchFocus.requestFocus();
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

/// The till's layouts, chosen per device (like the React till).
const posLayouts = [('classic', 'Classic'), ('standard', 'Standard'), ('advanced', 'Advanced UI')];

/// Standard and Advanced layouts: find the client by name or phone (Alt+C), with their loyalty and balance.
class _ClientStrip extends ConsumerStatefulWidget {
  const _ClientStrip({required this.wholesale, required this.data, required this.focus, required this.onDone});
  final bool wholesale;
  final PharmacyData data;
  final FocusNode focus;
  final VoidCallback onDone;
  @override
  ConsumerState<_ClientStrip> createState() => _ClientStripState();
}

class _ClientStripState extends ConsumerState<_ClientStrip> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  void _pick(String id, String name) {
    ref.read(saleControllerProvider(widget.wholesale).notifier).customer(id, name);
    _q.clear();
    setState(() {});
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    final s = ref.watch(saleControllerProvider(widget.wholesale));
    final d = widget.data;
    final q = _q.text.trim().toLowerCase();
    final digits = q.replaceAll(RegExp(r'\D'), '');
    final found = q.isEmpty
        ? d.customers.take(0).toList()
        : d.customers
            .where((c) => c.id != walkIn && (c.name.toLowerCase().contains(q) || (digits.length >= 3 && c.phone.replaceAll(RegExp(r'\D'), '').contains(digits))))
            .take(6)
            .toList();
    final c = d.customers.where((x) => x.id == s.customerId && x.id != walkIn).firstOrNull;
    final sales = (ref.watch(tableProvider('sales')).value ?? const []).where((x) => c != null && x['customerId'] == c.id).length;
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 12, 0, 0),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.people_outline, size: 18),
            const SizedBox(width: 6),
            Text('Client', style: th.textTheme.titleSmall),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                key: const Key('find-client'),
                controller: _q,
                focusNode: widget.focus,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => found.isEmpty ? null : _pick(found.first.id, found.first.name),
                decoration: const InputDecoration(isDense: true, prefixIcon: Icon(Icons.search, size: 18), hintText: 'Find client: name or phone  (Alt+C)'),
              ),
            ),
          ]),
          for (final x in found)
            ListTile(dense: true, title: Text(x.name), subtitle: x.phone.isEmpty ? null : Text(x.phone), onTap: () => _pick(x.id, x.name)),
          if (q.isNotEmpty && found.isEmpty) Text('No client matches “${_q.text.trim()}”', style: th.textTheme.bodySmall),
          const SizedBox(height: 6),
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
            Text(c?.name ?? 'Walk-in customer', style: const TextStyle(fontWeight: FontWeight.w700)),
            if (c != null && c.phone.isNotEmpty) Text(c.phone, style: th.textTheme.bodySmall),
            if (c != null && sales >= 3) const Chip(label: Text('Loyal client'), visualDensity: VisualDensity.compact),
            if (c != null && c.allergies.isNotEmpty) Chip(label: Text('Allergies: ${c.allergies}'), backgroundColor: th.colorScheme.errorContainer, visualDensity: VisualDensity.compact),
            if (c != null) TextButton(onPressed: () => _pick(walkIn, 'Walk-in Customer'), child: const Text('Back to walk-in')),
          ]),
        ]),
      ),
    );
  }
}

/// Advanced UI command bar (Ctrl+K): a command for a numbered line, or a medicine's name to add it. Pops true to charge.
class _CommandBar extends ConsumerStatefulWidget {
  const _CommandBar({required this.wholesale, required this.data, required this.onAdd});
  final bool wholesale;
  final PharmacyData data;
  final Future<void> Function(Product) onAdd;
  @override
  ConsumerState<_CommandBar> createState() => _CommandBarState();
}

class _CommandBarState extends ConsumerState<_CommandBar> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  String _msg = '';
  int _hi = 0;

  bool get _isCmd => RegExp(r'^([+-]\s?qty|qty|void|disc|hold|pay|checkout|charge)\b', caseSensitive: false).hasMatch(_text.text.trim());

  List<Product> get _found => !_isCmd && _text.text.trim().length >= 2
      ? searchProducts(widget.data.products, _text.text, stockOf: (p) => widget.data.stockOf(p.id)).where((p) => widget.data.stockOf(p.id) > 0).take(6).toList()
      : const [];

  Future<void> _go() async {
    final found = _found;
    if (!_isCmd && found.isNotEmpty) {
      final p = found[_hi.clamp(0, found.length - 1)];
      await widget.onAdd(p);
      setState(() {
        _text.clear();
        _msg = 'Added ${p.name}';
      });
    } else {
      final can = ref.read(permissionsProvider).value ?? const <String>{};
      final r = await ref.read(saleControllerProvider(widget.wholesale).notifier).command(_text.text, canEditPrice: can.contains('pos.price_edit'));
      if (!mounted) return;
      if (r.pay) return Navigator.pop(context, true);
      setState(() {
        _msg = r.error ?? 'Done';
        if (r.error == null) _text.clear();
      });
    }
    _focus.requestFocus();
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    final s = ref.watch(saleControllerProvider(widget.wholesale));
    final found = _found;
    final good = _msg.startsWith('Done') || _msg.startsWith('Added');
    return Dialog(
      alignment: Alignment.topCenter,
      insetPadding: const EdgeInsets.only(top: 80, left: 24, right: 24),
      child: SizedBox(
        width: 600,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: CallbackShortcuts(
            bindings: {
              const SingleActivator(LogicalKeyboardKey.arrowDown): () => setState(() => _hi = (_hi + 1).clamp(0, found.isEmpty ? 0 : found.length - 1)),
              const SingleActivator(LogicalKeyboardKey.arrowUp): () => setState(() => _hi = (_hi - 1).clamp(0, found.isEmpty ? 0 : found.length - 1)),
            },
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TextField(
                key: const Key('command-bar'),
                controller: _text,
                focusNode: _focus,
                autofocus: true,
                onChanged: (_) => setState(() {
                  _msg = '';
                  _hi = 0;
                }),
                onSubmitted: (_) => _go(),
                decoration: const InputDecoration(prefixIcon: Icon(Icons.keyboard_command_key), hintText: '+qty 2 · void 2 · disc 2 10 · disc 10 · hold · pay · or a medicine', suffixText: 'Esc'),
              ),
              for (var i = 0; i < found.length; i++)
                ListTile(
                  dense: true,
                  selected: i == _hi,
                  title: Text(found[i].name),
                  trailing: Text('${widget.data.settings.money(priceOf(found[i], wholesale: widget.wholesale))} · ${formatQty(widget.data.stockOf(found[i].id))} in stock'),
                  onTap: () {
                    _hi = i;
                    _go();
                  },
                ),
              if (_msg.isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text(_msg, style: TextStyle(color: good ? Colors.green.shade700 : th.colorScheme.error))),
              const SizedBox(height: 8),
              Wrap(spacing: 12, runSpacing: 4, children: [
                if (s.lines.isEmpty) Text("No lines yet: type a medicine's name to add one.", style: th.textTheme.bodySmall),
                for (var i = 0; i < s.lines.length; i++)
                  Text('${i + 1}  ${s.lines[i].name} × ${s.lines[i].pack != null ? '${formatQty(s.lines[i].count)} ${s.lines[i].pack!.name.toLowerCase()}' : formatQty(s.lines[i].qty)}'),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
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
    this.layout,
    this.onLayout,
    this.onCommand,
  });
  /// the till's layout on wide screens (null on a phone: no choice)
  final String? layout;
  final ValueChanged<String>? onLayout;
  final VoidCallback? onCommand;
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
              if (onCommand != null) IconButton(tooltip: 'Command bar (Ctrl+K)', icon: const Icon(Icons.keyboard_command_key), onPressed: onCommand),
              if (layout != null) ...[
                const SizedBox(width: 8),
                DropdownButton<String>(
                  key: const Key('pos-layout'),
                  value: layout,
                  isDense: true,
                  underline: const SizedBox(),
                  items: [for (final (k, label) in posLayouts) DropdownMenuItem(value: k, child: Text(label))],
                  onChanged: (v) => onLayout?.call(v!),
                ),
              ],
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
                  ('fav', 'Favourites'),
                  for (final c in categories) ('cat:$c', c),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      avatar: v == 'fav' && view != v ? const Icon(Icons.star_rounded, size: 18, color: Colors.amber) : null,
                      label: Text(label),
                      selected: view == v,
                      onSelected: (_) => onView?.call(v),
                    ),
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
                          ? 'No favourites yet. Tap the star on a medicine to keep it here.'
                          : view == 'recent'
                          ? 'Nothing sold here yet'
                          : 'No medicines here',
                    ),
                  )
                : GridView.builder(
                    // taller cards when the phone's text size is larger (accessibility), so nothing is cut off
                    // card size and spacing come from the design tokens (Target Tap: big cards, Split-Pane: dense)
                    gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: tokensOf(context).tileWidth,
                      mainAxisExtent: MediaQuery.textScalerOf(context).scale(tokensOf(context).tileHeight),
                      crossAxisSpacing: tokensOf(context).gap,
                      mainAxisSpacing: tokensOf(context).gap,
                    ),
                    itemCount: results.length,
                    itemBuilder: (_, i) {
                      final p = results[i];
                      final stock = data.stockOf(p.id);
                      final out = stock <= 0;
                      final low = !out && p.reorder > 0 && stock <= p.reorder;
                      final tk = tokensOf(context);
                      // Target Tap: a stripe in the colour of the medicine's therapeutic area (the name keeps full contrast)
                      final area = tk.colorCoded ? areaColors[drugClassOf(p).area] : null;
                      return Card(
                        margin: tk.hardShadow > 0 ? EdgeInsets.only(right: tk.hardShadow, bottom: tk.hardShadow) : EdgeInsets.zero,
                        clipBehavior: area != null ? Clip.antiAlias : Clip.none,
                        child: InkWell(
                          onTap: out ? null : () => onPick(p),
                          borderRadius: BorderRadius.circular(tk.radius),
                          child: Container(
                            decoration: area == null ? null : BoxDecoration(border: Border(left: BorderSide(color: area, width: 8))),
                            padding: EdgeInsets.all(tk.cardPadding),
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
                                Text.rich(
                                  TextSpan(children: [
                                    if (shelfLabel(p).isNotEmpty) ...[
                                      WidgetSpan(alignment: PlaceholderAlignment.middle, child: Icon(Icons.shelves, size: 12, color: t.colorScheme.tertiary)),
                                      TextSpan(text: ' ${shelfLabel(p)}  ', style: TextStyle(color: t.colorScheme.tertiary, fontWeight: FontWeight.w700)),
                                    ],
                                    TextSpan(text: [p.generic, p.form].where((x) => x.isNotEmpty).join(' · ')),
                                  ]),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: t.textTheme.bodySmall,
                                ),
                                const Spacer(),
                                // the price is never cut: when the stock note doesn't fit beside it, it goes under it
                                SizedBox(
                                  width: double.infinity,
                                  child: Wrap(
                                  alignment: WrapAlignment.spaceBetween,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  spacing: 4,
                                  children: [
                                    Text(
                                        formatMoney(
                                          priceOf(p, wholesale: wholesale),
                                          currency: s.currency,
                                          decimals: s.decimalPlaces,
                                        ),
                                        maxLines: 1,
                                        // the brand colour made readable on this card (tertiary), on every look
                                        style: TextStyle(color: t.colorScheme.tertiary, fontWeight: FontWeight.w800),
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
          padding: EdgeInsets.symmetric(horizontal: 14, vertical: ((tokensOf(context).tapTarget - 26) / 2).clamp(14, 24)), // at least the tap target high
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
  const _SalePanel({required this.wholesale, required this.data, required this.onCharge, required this.onError, this.advanced = false});
  /// Advanced UI: numbered lines (for the command bar) and "Process checkout"
  final bool advanced;
  final bool wholesale;
  final PharmacyData data;
  final VoidCallback onCharge;
  final ValueChanged<String> onError;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final th = Theme.of(context);
    final narrow = MediaQuery.sizeOf(context).width < 600; // the sale opens as a sheet on a phone
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
      color: th.colorScheme.surfaceContainerLow.withValues(alpha: auroraOn(context) ? .6 : 1),
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
                      hint: Text(st.clientCapture == 'required' ? '— choose a client —' : 'Walk-in (no client details)', maxLines: 1, overflow: TextOverflow.ellipsis),
                      items: [
                        for (final x in data.customers)
                          DropdownMenuItem(
                            value: x.id,
                            child: Text(x.id == walkIn ? 'Walk-in (no client details)' : '${x.name}${x.phone.isEmpty ? '' : ' · ${x.phone}'}', maxLines: 1, overflow: TextOverflow.ellipsis),
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
                        final chosen = s.cursor == i;
                        List<Widget> qtyAndTotal() => [
                                Container(
                                  decoration: BoxDecoration(border: Border.all(color: th.colorScheme.outline), borderRadius: BorderRadius.circular(10)),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    IconButton(onPressed: () => guard(() => c.step(l.id, -1)), icon: const Icon(Icons.remove, size: 18), tooltip: 'Less', style: _stepperFor(context)),
                                    SizedBox(
                                      width: 30,
                                      child: Text(formatQty(l.count), textAlign: TextAlign.center, style: th.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                                    ),
                                    IconButton(onPressed: () => guard(() => c.step(l.id, 1)), icon: const Icon(Icons.add, size: 18), tooltip: 'More', style: _stepperFor(context)),
                                  ]),
                                ),
                                SizedBox(
                                  width: 88,
                                  child: Text(
                                    fmt(l.total),
                                    textAlign: TextAlign.right,
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                ),
                        ];
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
                          child: Container(
                            key: chosen ? const Key('line-chosen') : null,
                            color: chosen ? th.colorScheme.primaryContainer.withValues(alpha: 0.5) : null,
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
                                      Text(advanced ? '${i + 1}  ${l.name}' : l.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
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
                                          if (p != null && shelfLabel(p).isNotEmpty) Padding(padding: const EdgeInsets.only(left: 6), child: _ShelfTag(shelfLabel(p))),
                                          TextButton.icon(
                                            key: Key('directions-${l.id}'),
                                            style: _lineActionFor(context),
                                            onPressed: () async {
                                              final dir = await askDirections(context, l, st, patient: s.customerId == walkIn ? '' : s.customerName);
                                              if (dir != null) c.directions(l.id, dir.isEmpty ? null : dir);
                                            },
                                            icon: Icon(l.directions == null ? Icons.edit_note : Icons.check_circle, size: 16),
                                            label: Text(l.directions == null ? 'Directions' : 'Edit label'),
                                          ),
                                          if (p != null && data.features['drugInfo'] != false)
                                            TextButton.icon(
                                              style: _lineActionFor(context),
                                              onPressed: () => showDrugInfo(context, p, data),
                                              icon: const Icon(Icons.info_outline, size: 16),
                                              label: const Text('Drug info'),
                                            ),
                                        ],
                                      ),
                                      // on a phone the quantity and the line total go under the name, so the name keeps the width
                                      if (narrow) Row(children: [qtyAndTotal().first, const Spacer(), Text(fmt(l.total), style: const TextStyle(fontWeight: FontWeight.w700))]),
                                    ],
                                  ),
                                ),
                                if (!narrow) ...qtyAndTotal(),
                                IconButton(onPressed: () => c.remove(l.id), icon: const Icon(Icons.close, size: 18), tooltip: 'Remove ${l.name}', color: th.colorScheme.onSurfaceVariant),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            () {
              final buttons = () {
              final hold = OutlinedButton.icon(
                onPressed: s.lines.isEmpty ? null : () => c.hold(),
                icon: const Icon(Icons.pause_circle_outline),
                label: const Text('Hold'),
              );
              final proforma = can.contains('proformas') && data.features['proformas'] != false
                  ? OutlinedButton.icon(
                      onPressed: s.lines.isEmpty
                          ? null
                          : () async {
                              final pf = await c.proformaNow();
                              if (context.mounted) say(context, 'Proforma ${pf['number']} saved (see Proformas)');
                            },
                      icon: const Icon(Icons.description_outlined),
                      label: const Text('Proforma'),
                    )
                  : null;
              final charge = FilledButton(
                onPressed: s.lines.isEmpty ? null : onCharge,
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16)),
                child: Text('${advanced ? 'Process checkout' : 'Charge'} ${fmt(t.total)}   [F9]', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              );
              // on a phone: Hold and Proforma side by side, then Charge across the whole width
              if (narrow) {
                return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [Expanded(child: hold), if (proforma != null) ...[const SizedBox(width: 8), Expanded(child: proforma)]]),
                  const SizedBox(height: 8),
                  charge,
                ]);
              }
              return Row(children: [
                hold,
                if (proforma != null) ...[const SizedBox(width: 8), proforma],
                const SizedBox(width: 8),
                Expanded(child: charge),
              ]);
            }();
              final pay = <Widget>[
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
              // on a phone the payment methods scroll sideways in one row, so the sale lines keep their room
              if (narrow)
                SingleChildScrollView(
                  key: const Key('pay-methods'),
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final m in data.methods)
                      Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(m.name), selected: m.id == method.id, onSelected: (_) => c.method(m))),
                  ]),
                )
              else
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
                buttons,
              ];
              // on a phone, and with Split-Pane (the sale and payment always in full view), the payment area is not resized
              if (narrow || tokensOf(context).splitPane) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: pay);
              // the payment area's height is dragged on its handle, or it folds down to the total and Charge
              return ResizableSection(
                storeKey: 'pos-pay-h',
                label: 'payment area',
                compact: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                  Row(children: [
                    Text('Total', style: th.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const Spacer(),
                    Text('${method.name} · ', style: th.textTheme.bodySmall),
                    Text(fmt(t.total), style: th.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900, color: th.colorScheme.primary)),
                  ]),
                  const SizedBox(height: 6),
                  buttons,
                ]),
                children: pay,
              );
            }(),
          ],
        ),
      ),
    );
  }
}

extension on String {
  String ifBlank(String other) => trim().isEmpty ? other : this;
}

/// The small actions under a sale line (Directions, Drug info): compact, still easy to hit.
ButtonStyle _lineActionFor(BuildContext context) {
  final h = tokensOf(context).tapTarget > 48 ? tokensOf(context).tapTarget - 8 : 36.0;
  return TextButton.styleFrom(minimumSize: Size(0, h), padding: const EdgeInsets.symmetric(horizontal: 8), visualDensity: VisualDensity.compact);
}

/// The − / + of a sale line's quantity.
/// (compact at a desk; as big as the tap target on Target Tap)
ButtonStyle _stepperFor(BuildContext context) {
  final t = tokensOf(context);
  final size = t.tapTarget > 48 ? t.tapTarget : t.touch ? 40.0 : 36.0;
  return IconButton.styleFrom(minimumSize: Size(size, size), padding: EdgeInsets.zero, visualDensity: VisualDensity.compact);
}

/// Where a medicine is kept (its shelf), on the till's cards and sale lines, to find it fast when dispensing.
class _ShelfTag extends StatelessWidget {
  const _ShelfTag(this.shelf);
  final String shelf;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.shelves, size: 13, color: t.colorScheme.tertiary),
      const SizedBox(width: 3),
      Flexible(child: Text(shelf, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.tertiary, fontWeight: FontWeight.w700))),
    ]);
  }
}
