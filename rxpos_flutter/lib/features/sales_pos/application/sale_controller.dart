import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/draft.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../../proformas/domain/proformas.dart';
import '../domain/cart.dart';

part 'sale_controller.g.dart';

/// The sale being rung up on one till (retail or wholesale).
class SaleState {
  const SaleState({this.lines = const [], this.customerId = walkIn, this.customerName = 'Walk-in Customer', this.discount = 0,
      this.method, this.tendered, this.cursor = -1, this.proforma});
  final List<CartLine> lines;
  final String customerId, customerName;
  final double discount;
  final PaymentMethod? method;
  final double? tendered;
  /// the line the keyboard acts on (+ / − / Delete)
  final int cursor;
  /// the proforma being sold (marked converted when the sale completes)
  final Map<String, Object?>? proforma;

  SaleState copyWith({List<CartLine>? lines, String? customerId, String? customerName, double? discount, PaymentMethod? method,
          double? tendered, bool clearTendered = false, int? cursor}) =>
      SaleState(lines: lines ?? this.lines, customerId: customerId ?? this.customerId, customerName: customerName ?? this.customerName,
          discount: discount ?? this.discount, method: method ?? this.method, tendered: clearTendered ? null : (tendered ?? this.tendered),
          cursor: cursor ?? this.cursor);

  Map<String, Object?> toSnapshot() => {'id': uid(), 'at': DateTime.now().toUtc().toIso8601String(),
    'cart': [for (final l in lines) l.toJson()], 'customerId': customerId, 'discount': discount, 'payment': method?.name ?? ''};
}

@Riverpod(keepAlive: true)
class SaleController extends _$SaleController {
  @override
  SaleState build(bool wholesale) => const SaleState();

  Future<PharmacyData> get _data => ref.read(pharmacyProvider.future);

  Future<void> add(Product p) async {
    final d = await _data;
    final lines = addToCart(state.lines, p, stock: d.stockOf(p.id), wholesale: wholesale, settings: d.settings);
    state = state.copyWith(lines: lines, cursor: lines.indexWhere((l) => l.id == p.id));
  }

  /// A scanned or typed barcode: true when it matched a medicine.
  Future<bool> addBarcode(String code) async {
    final p = (await _data).byBarcode[code.trim()];
    if (p == null) return false;
    await add(p);
    return true;
  }

  void _replace(String id, CartLine Function(CartLine) f) =>
      state = state.copyWith(lines: [for (final l in state.lines) l.id == id ? f(l) : l]);

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
  void price(String id, double perUnitOrPack) =>
      _replace(id, (x) => x.pack == null ? x.copyWith(price: perUnitOrPack) : x.copyWith(price: perUnitOrPack / x.pack!.size, pack: LinePack(name: x.pack!.name, size: x.pack!.size, price: perUnitOrPack)));

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
    final t = totalsOf(state.lines, discount: state.discount, settings: (await _data).settings);
    await ref.read(recordStoreProvider).update((d) => d.put('drafts', {
          'id': uid(), 'kind': 'sale', 'branchId': 'main', 'mode': wholesale ? 'wholesale' : 'retail', 'userId': session?.userId ?? '',
          'userName': session?.userName ?? '', 'order': DateTime.now().millisecondsSinceEpoch, 'startedAt': d.now,
          'title': state.customerId == walkIn ? 'Walk-in · ${state.lines.length} item${state.lines.length == 1 ? '' : 's'}' : state.customerName,
          'count': state.lines.length, 'total': t.total, 'data': state.toSnapshot(),
        }));
    clear();
  }

  /// Carry on with a held sale (it leaves the held list; the current sale, if any, is held first).
  Future<void> resume(Draft h) async {
    if (state.lines.isNotEmpty) await hold();
    final data = h.data ?? const {};
    final d = await _data;
    final lines = [
      for (final j in ((data['cart'] as List?) ?? const []).cast<Map>())
        () {
          final l = CartLine.fromJson(j.cast<String, Object?>());
          return CartLine(id: l.id, name: l.name, price: l.price, cost: l.cost, qty: l.qty, max: d.stockOf(l.id), pack: l.pack, rx: l.rx, controlled: l.controlled);
        }(),
    ];
    await ref.read(recordStoreProvider).update((x) => x.del('drafts', h.id));
    final c = d.customers.where((x) => x.id == data['customerId']).firstOrNull;
    state = SaleState(lines: lines, customerId: c?.id ?? walkIn, customerName: c?.name ?? 'Walk-in Customer',
        discount: ((data['discount'] as num?) ?? 0).toDouble(), method: state.method);
  }

  /// Complete the sale. Returns the saved sale; on any problem nothing is saved and the sale stays as it is.
  Future<Map<String, Object?>> complete({ControlledEntry? controlled, String? momoRef, bool rxChecked = false}) async {
    final d = await _data;
    final session = await ref.read(sessionControllerProvider.future);
    final method = state.method ?? d.methods.first;
    final sale = await completeSale(ref.read(recordStoreProvider),
        cart: state.lines,
        c: Checkout(method: method, tendered: state.tendered, customerId: state.customerId, customerName: state.customerName,
            discount: state.discount, controlled: controlled, momoRef: momoRef, rxChecked: rxChecked),
        settings: d.settings, stock: d.stock, wholesale: wholesale, cashier: session?.userName ?? '',
        also: state.proforma == null ? null : (x, sale) => x.put('proformas', {...state.proforma!, 'status': 'Converted', 'saleNumber': sale['number']}));
    state = SaleState(method: state.method);
    return sale;
  }

  /// Save the sale as a proforma (quotation) and start a new one.
  Future<Map<String, Object?>> proformaNow() async {
    final d = await _data;
    final session = await ref.read(sessionControllerProvider.future);
    final pf = await saveProforma(ref.read(recordStoreProvider), cart: state.lines, discount: state.discount, settings: d.settings, wholesale: wholesale,
        customerId: state.customerId, customerName: state.customerName, by: session?.userName ?? '');
    clear();
    return pf;
  }

  /// Load a proforma into this till to sell it (prices as quoted, quantities up to what is in stock).
  Future<void> loadProforma(Map<String, Object?> pf) async {
    final d = await _data;
    final lines = <CartLine>[
      for (final i in ((pf['items'] as List?) ?? const []).cast<Map>())
        if (d.stockOf('${i['id']}') > 0)
          CartLine(id: '${i['id']}', name: '${i['name']}', price: ((i['price'] as num?) ?? 0).toDouble(), cost: ((i['cost'] as num?) ?? 0).toDouble(),
              qty: [((i['qty'] as num?) ?? 1).toDouble(), d.stockOf('${i['id']}')].reduce((a, b) => a < b ? a : b), max: d.stockOf('${i['id']}'),
              rx: d.byId['${i['id']}']?.rx ?? false, controlled: d.byId['${i['id']}']?.controlled ?? false),
    ];
    state = SaleState(lines: lines, customerId: '${pf['customerId'] ?? walkIn}', customerName: '${pf['customerName'] ?? 'Walk-in Customer'}',
        discount: ((pf['discount'] as num?) ?? 0).toDouble(), method: state.method, proforma: pf);
  }
}
