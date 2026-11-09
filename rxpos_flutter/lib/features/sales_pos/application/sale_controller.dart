import 'dart:async';
import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/data/device_settings.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/draft.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../../people/domain/balances.dart';
import '../../proformas/domain/proformas.dart';
import '../domain/cart.dart';

part 'sale_controller.g.dart';

/// The sale being rung up on one till (retail or wholesale).
class SaleState {
  const SaleState({
    this.lines = const [],
    this.customerId = walkIn,
    this.customerName = 'Walk-in Customer',
    this.discount = 0,
    this.method,
    this.tendered,
    this.cursor = -1,
    this.proforma,
    this.ticked = const {},
  });
  final List<CartLine> lines;
  final String customerId, customerName;
  final double discount;
  final PaymentMethod? method;
  final double? tendered;

  /// the line the keyboard acts on (+ / − / Delete)
  final int cursor;

  /// the proforma being sold (marked converted when the sale completes)
  final Map<String, Object?>? proforma;

  /// lines ticked for "Remove ticked"
  final Set<String> ticked;

  SaleState copyWith({
    List<CartLine>? lines,
    String? customerId,
    String? customerName,
    double? discount,
    PaymentMethod? method,
    double? tendered,
    bool clearTendered = false,
    int? cursor,
    Set<String>? ticked,
  }) {
    final l = lines ?? this.lines;
    return SaleState(
      lines: l,
      customerId: customerId ?? this.customerId,
      customerName: customerName ?? this.customerName,
      discount: discount ?? this.discount,
      method: method ?? this.method,
      tendered: clearTendered ? null : (tendered ?? this.tendered),
      cursor: cursor ?? this.cursor,
      proforma: proforma,
      ticked: {
        for (final id in ticked ?? this.ticked)
          if (l.any((x) => x.id == id)) id,
      },
    );
  }

  Map<String, Object?> toSnapshot() => {
    'id': uid(),
    'at': DateTime.now().toUtc().toIso8601String(),
    'cart': [for (final l in lines) l.toJson()],
    'customerId': customerId,
    'customerName': customerName,
    'discount': discount,
    'payment': method?.name ?? '',
    'methodId': method?.id ?? '',
    'tendered': tendered,
  };
}

/// Units of a medicine that may still be sold without the expired-stock override (stock less expired batches).
double sellableOf(PharmacyData d, String id, {DateTime? now}) {
  final expired = d.stock
      .batchesOf(id)
      .where((b) => b.qty > 0 && b.expiry.isNotEmpty && daysUntil(b.expiry, now: now) < 0)
      .fold<double>(0, (a, b) => a + b.qty);
  final left = d.stockOf(id) - expired;
  return left < 0 ? 0 : left;
}

@Riverpod(keepAlive: true)
class SaleController extends _$SaleController {
  @override
  SaleState build(bool wholesale) {
    // the sale in progress is kept on the device, so a restart or a crash loses nothing (like the React till)
    Timer? t;
    listenSelf((_, next) {
      if (!_restored) return;
      t?.cancel();
      t = Timer(const Duration(milliseconds: 250), () => _keep(next));
    });
    ref.onDispose(() => t?.cancel());
    Future.microtask(_restore);
    return const SaleState();
  }

  bool _restored = false;
  String get _key => 'pos-sale-${wholesale ? 'wholesale' : 'retail'}';

  Future<void> _keep(SaleState s) async {
    try {
      await ref.read(deviceValueProvider(_key).notifier).set(s.lines.isEmpty ? null : jsonEncode(s.toSnapshot()));
    } catch (_) {
      /* the provider was disposed (tests) */
    }
  }

  Future<void> _restore() async {
    try {
      final raw = await ref.read(deviceValueProvider(_key).future);
      if (raw != null && state.lines.isEmpty) {
        final snap = (jsonDecode(raw) as Map).cast<String, Object?>();
        final d = await _data;
        final lines = _linesOf(snap, d);
        if (lines.isNotEmpty) {
          final m = d.methods.where((x) => x.id == snap['methodId']).firstOrNull;
          state = SaleState(
            lines: lines,
            customerId: '${snap['customerId'] ?? walkIn}',
            customerName: '${snap['customerName'] ?? 'Walk-in Customer'}',
            discount: ((snap['discount'] as num?) ?? 0).toDouble(),
            method: m,
            tendered: (snap['tendered'] as num?)?.toDouble(),
          );
        }
      }
    } catch (_) {
      /* nothing kept, or it could not be read: start with an empty sale */
    }
    _restored = true;
  }

  static List<CartLine> _linesOf(Map<String, Object?> snap, PharmacyData d) => [
    for (final j in ((snap['cart'] as List?) ?? const []).cast<Map>())
      () {
        final l = CartLine.fromJson(j.cast<String, Object?>());
        return l.copyWith(max: d.stockOf(l.id));
      }(),
  ];

  Future<PharmacyData> get _data => ref.read(pharmacyProvider.future);

  /// Add a medicine. Throws [OnlyExpiredLeft] when only expired stock is left; call again with the pharmacist's
  /// [expiredReason] to sell it anyway (recorded in the audit log).
  Future<void> add(Product p, {String? expiredReason}) async {
    final d = await _data;
    final lines = addToCart(
      state.lines,
      p,
      stock: d.stockOf(p.id),
      wholesale: wholesale,
      settings: d.settings,
      sellable: sellableOf(d, p.id),
      expiredReason: expiredReason,
    );
    state = state.copyWith(lines: lines, cursor: lines.indexWhere((l) => l.id == p.id));
  }

  /// The Advanced UI command bar (Ctrl+K), like the React till: "+qty 2", "-qty 2 3", "qty 2 5", "void 2",
  /// "disc 2 10" (10% off line 2), "disc 10" (10% off the sale), "hold", "pay". Lines are numbered from 1.
  /// Returns what went wrong (null when done) and whether to charge now.
  Future<({String? error, bool pay})> command(String text, {required bool canEditPrice}) async {
    final t = text.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
    final lines = state.lines;
    CartLine? rowOf(String n) {
      final i = int.parse(n) - 1;
      return i >= 0 && i < lines.length ? lines[i] : null;
    }

    ({String? error, bool pay}) err(String e) => (error: e, pay: false);
    const ok = (error: null, pay: false);
    try {
      RegExpMatch? m;
      if ((m = RegExp(r'^([+-])\s?qty (\d+)(?: (\d+))?$').firstMatch(t)) != null) {
        final l = rowOf(m![2]!);
        if (l == null) return err('There is no line ${m[2]}');
        final by = int.parse(m[3] ?? '1') * (m[1] == '+' ? 1 : -1);
        if (l.count + by <= 0) {
          remove(l.id);
          return err('Line ${m[2]} removed');
        }
        count(l.id, l.count + by);
        cursor(lines.indexOf(l));
        return ok;
      }
      if ((m = RegExp(r'^qty (\d+) (\d+)$').firstMatch(t)) != null) {
        final l = rowOf(m![1]!);
        if (l == null) return err('There is no line ${m[1]}');
        count(l.id, double.parse(m[2]!));
        cursor(lines.indexOf(l));
        return ok;
      }
      if ((m = RegExp(r'^void (\d+)$').firstMatch(t)) != null) {
        final l = rowOf(m![1]!);
        if (l == null) return err('There is no line ${m[1]}');
        remove(l.id);
        return ok;
      }
      final st = (await _data).settings;
      double round(double v, int dp) => double.parse(v.toStringAsFixed(dp));
      if ((m = RegExp(r'^disc (\d+) (\d+(?:\.\d+)?)%?$').firstMatch(t)) != null) {
        final l = rowOf(m![1]!);
        final pct = double.parse(m[2]!);
        if (l == null) return err('There is no line ${m[1]}');
        if (!canEditPrice) return err('You are not allowed to change prices');
        if (!(pct > 0 && pct < 100)) return err('A discount is between 1 and 99%');
        final f = 1 - pct / 100;
        _replace(l.id, (x) => x.copyWith(price: round(x.price * f, 2),
            pack: x.pack == null ? null : LinePack(name: x.pack!.name, size: x.pack!.size, price: round(x.pack!.price * f, st.decimalPlaces))));
        cursor(lines.indexOf(l));
        return ok;
      }
      if ((m = RegExp(r'^disc (\d+(?:\.\d+)?)%?$').firstMatch(t)) != null) {
        final pct = double.parse(m![1]!);
        if (!(pct > 0 && pct < 100)) return err('A discount is between 1 and 99%');
        discount(round(totalsOf(lines, discount: 0, settings: st).subtotal * pct / 100, st.decimalPlaces));
        return ok;
      }
      if (t == 'hold') {
        await hold();
        return ok;
      }
      if (t == 'pay' || t == 'checkout' || t == 'charge') return (error: null, pay: true);
    } on CartProblem catch (e) {
      return err(e.message);
    }
    return err('Not a command. Try +qty 2, -qty 2, qty 2 5, void 2, disc 2 10, disc 10, hold or pay');
  }

  /// Tick or untick a line; tick every line; remove the ticked ones.
  void tick(String id) => state = state.copyWith(ticked: state.ticked.contains(id) ? ({...state.ticked}..remove(id)) : {...state.ticked, id});
  void tickAll(bool on) => state = state.copyWith(ticked: on ? {for (final l in state.lines) l.id} : {});
  void removeTicked() => state = state.copyWith(lines: state.lines.where((l) => !state.ticked.contains(l.id)).toList(), ticked: {}, cursor: -1);

  /// Dosage directions for a line's label (empty clears them).
  void directions(String id, Map<String, Object?>? dir) => _replace(id, (x) => dir == null ? x.copyWith(clearDirections: true) : x.copyWith(directions: dir));

  /// Throw a held sale away (recorded in the audit log).
  Future<void> discard(Draft h) async {
    final session = await ref.read(sessionControllerProvider.future);
    final d = await _data;
    await ref.read(recordStoreProvider).update((x) {
      x.del('drafts', h.id);
      x.audit(session?.userName ?? '', 'Draft discarded', '${h.title} · ${h.count.round()} item${h.count.round() == 1 ? '' : 's'}', d.branch);
    });
  }

  /// A scanned or typed barcode: true when it matched a medicine.
  Future<bool> addBarcode(String code) async {
    final p = (await _data).byBarcode[code.trim()];
    if (p == null) return false;
    await add(p);
    return true;
  }

  void _replace(String id, CartLine Function(CartLine) f) => state = state.copyWith(lines: [for (final l in state.lines) l.id == id ? f(l) : l]);

  void step(String id, int by) {
    final l = state.lines.firstWhere((x) => x.id == id);
    if (l.count + by < 1) return remove(id);
    _replace(id, (x) => setCount(x, x.count + by));
  }

  void count(String id, double n) => _replace(id, (x) => setCount(x, n));

  Future<void> pack(String id, Pack? k) async {
    final p = (await _data).byId[id];
    if (p != null) _replace(id, (x) => choosePack(x, p, k, wholesale: wholesale));
  }

  /// A new price for a line (only staff who may change prices: pos.price_edit).
  void price(String id, double perUnitOrPack) => _replace(
    id,
    (x) => x.pack == null
        ? x.copyWith(price: perUnitOrPack)
        : x.copyWith(
            price: perUnitOrPack / x.pack!.size,
            pack: LinePack(name: x.pack!.name, size: x.pack!.size, price: perUnitOrPack),
          ),
  );

  void remove(String id) => state = state.copyWith(lines: state.lines.where((l) => l.id != id).toList(), cursor: -1);
  void clear() => state = SaleState(method: state.method);
  void customer(String id, String name) => state = state.copyWith(customerId: id, customerName: name);
  void discount(double v) => state = state.copyWith(discount: v < 0 ? 0 : v);
  void method(PaymentMethod m) => state = state.copyWith(method: m, clearTendered: true);
  void tendered(double? v) => state = v == null ? state.copyWith(clearTendered: true) : state.copyWith(tendered: v);
  void cursor(int i) => state = state.copyWith(cursor: i);

  /// Put the sale on hold (a draft, on every device) and start a new one.
  Future<void> hold() async {
    if (state.lines.isEmpty) return;
    final session = await ref.read(sessionControllerProvider.future);
    final data = await _data;
    final t = totalsOf(state.lines, discount: state.discount, settings: data.settings);
    await ref
        .read(recordStoreProvider)
        .update(
          (d) => d.put('drafts', {
            'id': uid(),
            'kind': 'sale',
            'branchId': data.branch,
            'mode': wholesale ? 'wholesale' : 'retail',
            'userId': session?.userId ?? '',
            'userName': session?.userName ?? '',
            'order': DateTime.now().millisecondsSinceEpoch,
            'startedAt': d.now,
            'title': state.customerId == walkIn ? 'Walk-in · ${state.lines.length} item${state.lines.length == 1 ? '' : 's'}' : state.customerName,
            'count': state.lines.length,
            'total': t.total,
            'data': state.toSnapshot(),
          }),
        );
    clear();
  }

  /// Carry on with a held sale (it leaves the held list; the current sale, if any, is held first).
  Future<void> resume(Draft h) async {
    if (state.lines.isNotEmpty) await hold();
    final data = h.data ?? const {};
    final d = await _data;
    final lines = _linesOf(data, d);
    await ref.read(recordStoreProvider).update((x) => x.del('drafts', h.id));
    final c = d.customers.where((x) => x.id == data['customerId']).firstOrNull;
    state = SaleState(
      lines: lines,
      customerId: c?.id ?? walkIn,
      customerName: c?.name ?? 'Walk-in Customer',
      discount: ((data['discount'] as num?) ?? 0).toDouble(),
      method: state.method,
    );
  }

  /// Complete the sale. Returns the saved sale; on any problem nothing is saved and the sale stays as it is.
  /// Step 8: would this credit sale take the client over their credit limit? (what they owe as on the Debtors page)
  Future<({double limit, double owed, double adds})?> creditCheck() async {
    final d = await _data;
    final method = state.method ?? d.methods.first;
    if (method.type != 'credit' || state.customerId == walkIn) return null;
    final c = d.customers.where((x) => x.id == state.customerId).firstOrNull;
    final limit = (c?.raw['creditLimit'] as num?)?.toDouble() ?? 0;
    if (!(limit > 0)) return null;
    final store = ref.read(recordStoreProvider);
    final owed = customerBalance(state.customerId, (await store.rows('sales')).map(Sale.fromRecord), await store.rows('payments'));
    return overLimit(limit: limit, owed: owed, total: totalsOf(state.lines, discount: state.discount, settings: d.settings).total, tendered: state.tendered);
  }

  Future<Map<String, Object?>> complete({ControlledEntry? controlled, String? momoRef, Map<String, Object?>? momo, bool rxChecked = false, Map<String, Object?>? creditOver}) async {
    final d = await _data;
    final session = await ref.read(sessionControllerProvider.future);
    final method = state.method ?? d.methods.first;
    final sale = await completeSale(
      ref.read(recordStoreProvider),
      cart: state.lines,
      c: Checkout(
        method: method,
        tendered: state.tendered,
        customerId: state.customerId,
        customerName: state.customerName,
        discount: state.discount,
        controlled: controlled,
        momoRef: momoRef,
        momo: momo,
        rxChecked: rxChecked,
        creditOver: creditOver,
      ),
      settings: d.settings,
      stock: d.stock,
      wholesale: wholesale,
      cashier: session?.userName ?? '',
      branchId: d.branch,
      proformaId: state.proforma?['id']?.toString(),
      also: state.proforma == null ? null : (x, sale) => x.put('proformas', {...state.proforma!, 'status': 'Converted', 'saleNumber': sale['number']}),
    );
    state = SaleState(method: state.method);
    return sale;
  }

  /// Save the sale as a proforma (quotation) and start a new one.
  Future<Map<String, Object?>> proformaNow() async {
    final d = await _data;
    final session = await ref.read(sessionControllerProvider.future);
    final pf = await saveProforma(
      ref.read(recordStoreProvider),
      cart: state.lines,
      discount: state.discount,
      settings: d.settings,
      wholesale: wholesale,
      customerId: state.customerId,
      customerName: state.customerName,
      by: session?.userName ?? '',
      branchId: d.branch,
    );
    clear();
    return pf;
  }

  /// Load a proforma into this till to sell it (prices as quoted, quantities up to what is in stock).
  Future<void> loadProforma(Map<String, Object?> pf) async {
    final d = await _data;
    final lines = <CartLine>[
      for (final i in ((pf['items'] as List?) ?? const []).cast<Map>())
        if (d.stockOf('${i['id']}') > 0)
          CartLine(
            id: '${i['id']}',
            name: '${i['name']}',
            price: ((i['price'] as num?) ?? 0).toDouble(),
            cost: ((i['cost'] as num?) ?? 0).toDouble(),
            qty: [((i['qty'] as num?) ?? 1).toDouble(), d.stockOf('${i['id']}')].reduce((a, b) => a < b ? a : b),
            max: d.stockOf('${i['id']}'),
            rx: d.byId['${i['id']}']?.rx ?? false,
            controlled: d.byId['${i['id']}']?.controlled ?? false,
          ),
    ];
    state = SaleState(
      lines: lines,
      customerId: '${pf['customerId'] ?? walkIn}',
      customerName: '${pf['customerName'] ?? 'Walk-in Customer'}',
      discount: ((pf['discount'] as num?) ?? 0).toDouble(),
      method: state.method,
      proforma: pf['id'] == null ? null : pf, // medicines from a scanned prescription are not a proforma
    );
  }
}
