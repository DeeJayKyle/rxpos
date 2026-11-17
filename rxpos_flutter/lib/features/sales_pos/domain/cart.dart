// The sale being rung up, and turning it into a sale record with its stock movements: ported from src/pages/POS.jsx
// (add, choosePack, setCount, totals, checkout / finalize). Pure, so the rules are tested without the screen.
import '../../../core/data/json_fields.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/fefo.dart';
import '../../../core/rules/insurance.dart';
import '../../../core/rules/kits.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/packs.dart';
import '../../../core/rules/stock.dart';

const cashDrawer = 'cash-drawer';
const walkIn = 'walk-in';

/// A line sold by the pack: [size] units per pack at [price] per pack.
class LinePack {
  const LinePack({required this.name, required this.size, required this.price});
  final String name;
  final double size, price;
  Map<String, Object?> toJson() => {'name': name, 'size': numOut(size), 'price': numOut(price)};
  factory LinePack.fromJson(Map<String, Object?> j) =>
      LinePack(name: '${j['name']}', size: (j['size'] as num).toDouble(), price: (j['price'] as num).toDouble());
}

/// 1.10 a kit on the sale (src/pages/POS.jsx kitLine): what it holds per kit, after this sale's swaps. Stored with a
/// held sale exactly as the React app stores it, so a held kit sale carries on in either app.
class KitLine {
  const KitLine({required this.icon, required this.color, this.warning = '', this.ack = false, this.services = const [], required this.components, this.swaps = const {}});
  final String icon, color, warning;
  final bool ack;
  /// [{name, price, cost}]
  final List<Map<String, Object?>> services;
  /// per kit: [{productId, name, qty, cost, swappedFrom?, swappedFromName?}]
  final List<Map<String, Object?>> components;
  /// this sale's substitutions: {productId: substituteId}
  final Map<String, String> swaps;
  Map<String, Object?> toJson() => {'icon': icon, 'color': color, 'warning': warning, 'ack': ack, 'services': services, 'components': components};
  factory KitLine.fromJson(Map<String, Object?> j, Object? swaps) => KitLine(
    icon: '${j['icon'] ?? 'package'}', color: '${j['color'] ?? '#be185d'}', warning: '${j['warning'] ?? ''}', ack: j['ack'] == true,
    services: [for (final x in (j['services'] is List ? j['services'] as List : const [])) if (x is Map) x.cast<String, Object?>()],
    components: [for (final x in (j['components'] is List ? j['components'] as List : const [])) if (x is Map) x.cast<String, Object?>()],
    swaps: swaps is Map ? {for (final e in swaps.entries) '${e.key}': '${e.value}'} : const {},
  );
}

/// One line of the sale. [qty] is always in single units; [price] is per unit.
class CartLine {
  const CartLine({
    required this.id,
    required this.name,
    required this.price,
    required this.cost,
    required this.qty,
    required this.max,
    this.pack,
    this.rx = false,
    this.controlled = false,
    this.directions,
    this.allowExpired = false,
    this.expiredReason = '',
    this.preferBatch,
    this.kit,
    this.acked = false,
  });

  /// 1.10 a kit line (one per kit: [qty] counts kits), and whether its warning was ticked as given
  final KitLine? kit;
  final bool acked;

  final String id, name;
  /// step 21: the batch of a scanned pack, sold from first (core/rules/gs1.dart)
  final String? preferBatch;
  final double price, cost, qty, max;
  final LinePack? pack;
  final bool rx, controlled;

  /// dosage directions for the label: dose, freq, days, notes (list), patient (as the React app stores them)
  final Map<String, Object?>? directions;

  /// expired stock may be sold on this line (only with a reason, recorded in the audit log)
  final bool allowExpired;
  final String expiredReason;

  /// One step of the − / + buttons: a whole pack, or one unit.
  double get step => pack?.size ?? 1;
  double get count => qty / step;
  double get total => lineTotal(price: price, qty: qty);

  CartLine copyWith({
    double? price,
    double? qty,
    LinePack? pack,
    bool clearPack = false,
    Map<String, Object?>? directions,
    bool clearDirections = false,
    bool? allowExpired,
    String? expiredReason,
    double? max,
    String? preferBatch,
    KitLine? kit,
    bool? acked,
  }) => CartLine(
    id: id,
    name: name,
    price: price ?? this.price,
    cost: cost,
    qty: qty ?? this.qty,
    max: max ?? this.max,
    pack: clearPack ? null : (pack ?? this.pack),
    rx: rx,
    controlled: controlled,
    directions: clearDirections ? null : (directions ?? this.directions),
    allowExpired: allowExpired ?? this.allowExpired,
    expiredReason: expiredReason ?? this.expiredReason,
    preferBatch: preferBatch ?? this.preferBatch,
    kit: kit ?? this.kit,
    acked: acked ?? this.acked,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'price': price,
    'cost': cost,
    'qty': qty,
    'max': max,
    if (pack != null) 'pack': pack!.toJson(),
    'rx': rx,
    'controlled': controlled,
    if (directions != null) 'directions': directions,
    if (allowExpired) 'allowExpired': true,
    if (expiredReason.isNotEmpty) 'expiredReason': expiredReason,
    if (kit != null) ...{'kit': kit!.toJson(), 'swaps': kit!.swaps, 'acked': acked},
  };
  factory CartLine.fromJson(Map<String, Object?> j) => CartLine(
    id: '${j['id']}',
    name: '${j['name']}',
    price: (j['price'] as num).toDouble(),
    cost: ((j['cost'] as num?) ?? 0).toDouble(),
    qty: (j['qty'] as num).toDouble(),
    max: ((j['max'] as num?) ?? 0).toDouble(),
    pack: j['pack'] is Map ? LinePack.fromJson((j['pack'] as Map).cast<String, Object?>()) : null,
    rx: j['rx'] == true,
    controlled: j['controlled'] == true,
    directions: (j['directions'] as Map?)?.cast<String, Object?>(),
    allowExpired: j['allowExpired'] == true,
    expiredReason: '${j['expiredReason'] ?? ''}',
    kit: j['kit'] is Map ? KitLine.fromJson((j['kit'] as Map).cast<String, Object?>(), j['swaps']) : null,
    acked: j['acked'] == true,
  );
}

/// Units of each medicine the sale needs: plain lines by their quantity, kit lines by their components × kits
Map<String, double> basketDemand(Iterable<CartLine> lines) {
  final m = <String, double>{};
  for (final l in lines) {
    if (l.kit != null) {
      for (final c in l.kit!.components) {
        final id = '${c['productId']}';
        m[id] = (m[id] ?? 0) + ((c['qty'] as num?)?.toDouble() ?? 0) * l.qty;
      }
    } else {
      m[l.id] = (m[l.id] ?? 0) + l.qty;
    }
  }
  return m;
}

/// The kit's line for this sale, from what it is now ([v], with its swaps)
CartLine kitCartLine(KitView v, {required bool wholesale, required double most, Map<String, String> swaps = const {}, Map<String, String> names = const {}}) => CartLine(
  id: v.id, name: v.name, price: wholesale ? v.wholesale : v.price, cost: v.cost, qty: 1, max: most, rx: v.rx, controlled: v.controlled,
  kit: KitLine(
    icon: v.icon, color: v.color, warning: v.warning, ack: v.ack, swaps: swaps,
    services: [for (final x in v.services) {'name': x.name, 'price': numOut(x.price), 'cost': numOut(x.cost)}],
    components: [
      for (final c in v.components)
        {'productId': c.productId, 'name': c.name, 'qty': numOut(c.qty), 'cost': numOut(c.cost),
          if (c.swappedFrom.isNotEmpty) ...{'swappedFrom': c.swappedFrom, 'swappedFromName': names[c.swappedFrom] ?? ''}},
    ],
  ),
);

/// How many of kit [v] this sale can hold, after what its other lines already take
double kitMost(KitView v, List<CartLine> cart) {
  if (v.canMake == null) return double.infinity;
  final others = basketDemand(cart.where((l) => l.id != v.id));
  var most = v.canMake!.toDouble();
  for (final c in v.components) {
    final n = ((c.have - (others[c.productId] ?? 0) + 1e-9) / c.qty).floorToDouble();
    if (n < most) most = n;
  }
  return most < 0 ? 0 : most;
}

/// A kit that can't be made for this sale: [component] is the part that is short (offer a swap for it), null when
/// nothing can be swapped (a medicine in the kit was deleted)
class KitShort implements Exception {
  KitShort(this.message, this.component);
  final String message;
  final KitComponent? component;
  @override
  String toString() => message;
}

/// One more of kit [v] (a new line, or one more on its line). Throws [KitShort] when the stock can't make it.
List<CartLine> addKitToCart(List<CartLine> cart, KitView v, {required bool wholesale, Map<String, String> names = const {}}) {
  final i = cart.indexWhere((l) => l.id == v.id);
  final most = kitMost(v, cart);
  final want = (i >= 0 ? cart[i].qty : 0) + 1;
  if (most < want) {
    final c = v.short.firstOrNull;
    final what = kitShortText(v);
    if (c != null && !c.missing) throw KitShort('${v.name}: ${what.isEmpty ? 'not enough stock' : what}. Swap it for another medicine for this sale, or sell fewer kits.', c);
    throw KitShort('${v.name}: ${most <= 0 ? 'none can be made' : 'only ${formatQty(most)} can be made'} (${what.isEmpty ? 'not enough stock' : what})', null);
  }
  if (i >= 0) return [...cart]..[i] = cart[i].copyWith(qty: want.toDouble(), max: most);
  return [...cart, kitCartLine(v, wholesale: wholesale, most: most, names: names)];
}

/// Swap one of a kit's medicines ([from], the kit's own) for [to] on this sale only (recommendation 3; [to] == [from]
/// puts it back). [rec]: the kit record; [now] works out the kit with swaps. Throws [CartProblem] when still short.
List<CartLine> swapKitPartIn(List<CartLine> cart, Map<String, Object?> rec, String from, String to,
    {required KitView Function(Map<String, String> swaps) now, required bool wholesale, Map<String, String> names = const {}}) {
  final id = '${rec['id']}';
  final i = cart.indexWhere((l) => l.id == id);
  final line = i >= 0 ? cart[i] : null;
  final swaps = {...?line?.kit?.swaps};
  if (to == from) {
    swaps.remove(from);
  } else {
    swaps[from] = to;
  }
  final v = now(swaps);
  final most = kitMost(v, cart);
  if (most < (line?.qty ?? 1)) throw CartProblem('Still not enough: ${kitShortText(v).isEmpty ? 'not enough stock' : kitShortText(v)}');
  final next = kitCartLine(v, wholesale: wholesale, most: most, swaps: swaps, names: names)
      .copyWith(qty: line?.qty ?? 1, price: line?.price, acked: line?.acked ?? false);
  return line == null ? [...cart, next] : ([...cart]..[i] = next);
}

/// All remaining stock of a medicine has expired: it can be sold only with a recorded reason.
class OnlyExpiredLeft implements Exception {
  OnlyExpiredLeft(this.name);
  final String name;
  @override
  String toString() => 'All remaining $name stock has expired.';
}

/// Why something cannot be done (shown to the cashier as it is).
class CartProblem implements Exception {
  CartProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

double priceOf(Product p, {required bool wholesale}) => wholesale && p.wholesale > 0 ? p.wholesale : p.price;

/// Add one of [p] (one more unit or pack if it is already in the sale). Retail starts in units and wholesale in
/// whole packs, as the pharmacy chose (Settings → Receipts & stock), when a whole pack is in stock.
/// [sellable] is the stock that has not expired; past it, [expiredReason] must be given (the pharmacist's reason).
List<CartLine> addToCart(
  List<CartLine> cart,
  Product p, {
  required double stock,
  required bool wholesale,
  required PharmacySettings settings,
  double? sellable,
  String? expiredReason,
}) {
  final i = cart.indexWhere((l) => l.id == p.id);
  final inCart = i >= 0 ? cart[i] : null;
  final allowed = (inCart?.allowExpired ?? false) || (expiredReason ?? '').trim().isNotEmpty;
  if (!allowed && sellable != null && (inCart?.qty ?? 0) >= sellable && stock > (inCart?.qty ?? 0)) throw OnlyExpiredLeft(p.name);
  CartLine mark(CartLine l) => allowed && !l.allowExpired ? l.copyWith(allowExpired: true, expiredReason: expiredReason!.trim()) : l;
  if (i >= 0) {
    final l = cart[i];
    if (l.qty + l.step > stock) throw CartProblem('Only ${formatQty(stock)} ${p.unit.isEmpty ? 'units' : '${p.unit.toLowerCase()}s'} of ${p.name} in stock');
    return [...cart]..[i] = mark(l.copyWith(qty: l.qty + l.step));
  }
  if (stock <= 0) throw CartProblem('${p.name} is out of stock');
  final unit = priceOf(p, wholesale: wholesale);
  final k = sellInPacks(settings, wholesale: wholesale) ? mainPack(p) : null;
  final first = CartLine(id: p.id, name: p.name, price: unit, cost: p.cost, qty: 1, max: stock, rx: p.rx, controlled: p.controlled);
  if (k != null && k.size <= stock) {
    final pp = packPrice(k, unit, wholesale: wholesale);
    return [
      ...cart,
      mark(
        first.copyWith(
          pack: LinePack(name: k.name, size: k.size, price: pp),
          price: pp / k.size,
          qty: k.size,
        ),
      ),
    ];
  }
  return [...cart, mark(first)];
}

/// Set a line to [count] units or packs (kept between 1 and what is in stock).
CartLine setCount(CartLine l, double count) {
  final most = (l.max / l.step).floorToDouble();
  if (count > most) {
    throw CartProblem('Only ${formatQty(most)} ${l.pack != null ? '${l.pack!.name.toLowerCase()}${most == 1 ? '' : 's'}' : 'in stock'} in stock');
  }
  return l.copyWith(qty: (count < 1 ? 1 : count.roundToDouble()) * l.step);
}

/// Sell a line by [pack] (a pack of the medicine) or by single units (null).
CartLine choosePack(CartLine l, Product p, Pack? pack, {required bool wholesale}) {
  final unit = priceOf(p, wholesale: wholesale);
  if (pack == null) return l.copyWith(clearPack: true, price: unit, qty: l.qty < l.max ? l.qty : l.max);
  if (pack.size > l.max) throw CartProblem('Not a whole ${pack.name.toLowerCase()} in stock (${formatQty(l.max)} left)');
  final pp = packPrice(pack, unit, wholesale: wholesale);
  return l.copyWith(
    pack: LinePack(name: pack.name, size: pack.size, price: pp),
    price: pp / pack.size,
    qty: pack.size,
  );
}

/// The sale's figures, each rounded once (src/pages/POS.jsx).
class Totals {
  const Totals({required this.subtotal, required this.discount, required this.tax, required this.total});
  final double subtotal, discount, tax, total;
}

Totals totalsOf(List<CartLine> cart, {required double discount, required PharmacySettings settings}) {
  final d = settings.decimalPlaces;
  final subtotal = cartSubtotal([for (final l in cart) (price: l.price, qty: l.qty, discount: 0)], d);
  final disc = [round(discount, d), subtotal].reduce((a, b) => a < b ? a : b);
  final tax = taxOf(subtotal - disc, settings.taxRate, decimals: d);
  return Totals(subtotal: subtotal, discount: disc, tax: tax, total: round(subtotal - disc + tax, d));
}

/// The controlled-drugs register entry for a sale (patient, prescriber and prescription).
class ControlledEntry {
  const ControlledEntry({required this.patient, this.idNo = '', required this.prescriber, this.prescriberReg = '', this.rxNo = ''});
  final String patient, idNo, prescriber, prescriberReg, rxNo;
  Map<String, Object?> toJson() => {'patient': patient, 'idNo': idNo, 'prescriber': prescriber, 'prescriberReg': prescriberReg, 'rxNo': rxNo};
}

/// Step 8: a credit sale that takes a client over their credit limit (src/credit.js overLimit). Null when it does not,
/// or when the client has no limit. [owed]: what they owe before this sale; [adds]: what this sale puts on credit.
({double limit, double owed, double adds})? overLimit({required double limit, required double owed, required double total, double? tendered}) {
  if (!(limit > 0)) return null;
  final paidNow = (tendered ?? 0) < total ? (tendered ?? 0) : total;
  final adds = total - (paidNow > 0 ? paidNow : 0);
  if (!(adds > 0.5)) return null; // paid in full now: this sale adds nothing to what they owe
  return owed + adds > limit + 0.5 ? (limit: limit, owed: owed, adds: adds) : null;
}

/// Everything about how the sale is paid and who it is for.
/// Step 22: the insurer and scheme billed for a sale, and the patient's member number (core/rules/insurance.dart).
class Insured {
  const Insured({required this.insurer, required this.scheme, this.memberNo = ''});
  final Map<String, Object?> insurer, scheme;
  final String memberNo;
  String get key => '${insurer['id']}|${scheme['id']}';
  String get insurerName => '${insurer['name'] ?? ''}';
  String get schemeName => '${scheme['name'] ?? ''}';
  Insured withMember(String m) => Insured(insurer: insurer, scheme: scheme, memberNo: m);
}

/// What the patient pays at the till: the co-pay on an insured sale, else the total.
double dueOf(Insured? ins, double total, PharmacySettings s) => ins == null ? total : copayOf(ins.scheme, total, decimals: s.decimalPlaces).copay;

class Checkout {
  const Checkout({
    required this.method,
    this.tendered,
    this.customerId = walkIn,
    this.customerName = 'Walk-in Customer',
    this.discount = 0,
    this.controlled,
    this.momoRef,
    this.momo,
    this.rxChecked = false,
    this.creditOver,
    this.insured,
  });
  /// Step 22: billed to an insurer (the patient pays the co-pay).
  final Insured? insured;
  /// Step 8: over the client's credit limit: {limit, owed, adds, reason?, finance?} (saved on the sale, audited).
  final Map<String, Object?>? creditOver;
  final PaymentMethod method;
  final double? tendered;
  final String customerId, customerName;
  final double discount;
  final ControlledEntry? controlled;

  /// typed by staff from the customer's message (recorded as "manual")
  final String? momoRef;

  /// confirmed by the network after a payment request to the customer's phone: provider, phone, ref, txid
  final Map<String, Object?>? momo;
  final bool rxChecked;
}

/// Check the sale can be completed; throws [CartProblem] with what to fix (src/pages/POS.jsx checkout()).
void checkCheckout(List<CartLine> cart, Checkout c, Totals t, {required PharmacySettings settings}) {
  if (cart.isEmpty) throw CartProblem('The sale is empty');
  // recommendation 5: a kit whose warning must be given: the cashier ticks it on the line before charging
  final unticked = cart.where((l) => l.kit != null && l.kit!.ack && !l.acked).firstOrNull;
  if (unticked != null) throw CartProblem('${unticked.name}: tick that the client was told (${unticked.kit!.warning}) before charging');
  final type = c.method.type;
  if (type == 'credit' && c.customerId == walkIn) throw CartProblem('Select a registered customer for a credit sale');
  if (settings.clientCapture == 'required' && c.customerId == walkIn) throw CartProblem('Choose or add the client for this sale');
  final ins = c.insured;
  if (ins != null && c.customerId == walkIn) throw CartProblem('Choose the insured client for this sale');
  if (ins != null && ins.memberNo.trim().isEmpty) throw CartProblem('Enter the client\'s ${ins.insurerName} member number');
  final due = dueOf(ins, t.total, settings);
  if (type == 'cash' && c.tendered != null && c.tendered! < due - 1e-9) throw CartProblem('Amount tendered is less than ${ins != null ? 'the client pays' : 'the total'}');
  if (cart.any((l) => l.controlled) && c.controlled == null) throw CartProblem('Fill in the controlled-drugs register for this sale');
  if (cart.any((l) => l.rx) && !cart.any((l) => l.controlled) && !c.rxChecked) throw CartProblem('Confirm that a valid prescription was checked');
  if (type == 'momo' && c.momo == null && (c.momoRef ?? '').trim().isEmpty) {
    throw CartProblem('Type the Mobile Money transaction ID from the customer\'s message');
  }
}

/// Save the sale: the sale record, a stock movement per batch taken (first expiry first out) and an audit line for a
/// discount, in ONE transaction (records written exactly as the React app writes them).
Future<Map<String, Object?>> completeSale(
  RecordStore store, {
  required List<CartLine> cart,
  required Checkout c,
  required PharmacySettings settings,
  required StockView stock,
  required bool wholesale,
  required String cashier,
  String branchId = mainBranch,
  DateTime? now,
  void Function(Edit d, Map<String, Object?> sale)? also,
  String? proformaId,
}) async {
  final t = totalsOf(cart, discount: c.discount, settings: settings);
  checkCheckout(cart, c, t, settings: settings);
  // The stock may have changed since a line was added (another device's sale arrived by sync, a held sale resumed
  // later): a sale can't go beyond the stock this device knows of. Checked per medicine, before anything is saved.
  // (a kit's medicines count too: a kit and a plain line, or two kits, may share a medicine)
  final want = basketDemand(cart);
  final kitIds = {for (final l in cart) if (l.kit != null) for (final c in l.kit!.components) '${c['productId']}'};
  for (final e in want.entries) {
    final l = cart.where((x) => x.id == e.key).firstOrNull;
    final name = l?.name ?? cart.expand((x) => x.kit?.components ?? const <Map<String, Object?>>[]).firstWhere((c) => '${c['productId']}' == e.key)['name'];
    final have = sellable(stock.batchesOf(e.key, atBranch: branchId), allowExpired: cart.any((x) => x.id == e.key && x.allowExpired), now: now);
    if (e.value > have + stockTolerance) {
      throw CartProblem(kitIds.contains(e.key)
          ? '$name: this sale needs ${formatQty(e.value)} (kits included) but only ${formatQty(have)} can be sold'
          : 'Only ${formatQty(have)} $name in stock here: lower the quantity or remove it.');
    }
  }
  final type = c.method.type;
  final credit = type == 'credit';
  final ins = c.insured;
  final due = dueOf(ins, t.total, settings);
  final paid = credit ? [c.tendered ?? 0, due].reduce((a, b) => a < b ? a : b) : due;
  return store.update((d) async {
    final number = await d.number('R', branchId: branchId);
    // what one line takes from a batch is not offered to the next (a kit and a plain line may share a medicine)
    final used = <String, double>{};
    List<Map<String, Object?>> take(String pid, double qty, {bool allowExpired = false, String? prefer}) {
      final left = [
        for (final b in preferFirst(stock.batchesOf(pid, atBranch: branchId), prefer))
          BatchStock(id: b.id, qty: b.qty - (used[b.id] ?? 0), productId: b.productId, batch: b.batch, expiry: b.expiry, cost: b.cost, legacy: b.legacy),
      ];
      final out = allocate(left, qty, allowExpired: allowExpired, now: now);
      for (final a in out) {
        if (a.batchId != null) used[a.batchId!] = (used[a.batchId!] ?? 0) + a.qty;
      }
      return [for (final a in out) {'batchId': a.batchId, 'qty': numOut(a.qty), 'batch': a.batch, 'expiry': a.expiry}];
    }
    final items = [
      for (final l in cart)
        if (l.kit != null)
          // a kit: one line on the receipt; its medicines leave stock from their own batches (src/pages/POS.jsx)
          {
            'id': l.id,
            'name': l.name,
            'price': numOut(l.price),
            'cost': numOut(l.cost),
            'qty': numOut(l.qty),
            if (l.controlled) 'controlled': true,
            'alloc': const <Object?>[],
            'kit': {
              'icon': l.kit!.icon,
              'color': l.kit!.color,
              if (l.kit!.ack) ...{'warning': l.kit!.warning, 'acked': l.acked},
              'services': l.kit!.services,
              'components': [
                for (final c in l.kit!.components)
                  {
                    'id': c['productId'],
                    'name': c['name'],
                    'per': c['qty'],
                    'qty': numOut(((c['qty'] as num?)?.toDouble() ?? 0) * l.qty),
                    'cost': c['cost'],
                    if ('${c['swappedFrom'] ?? ''}'.isNotEmpty) ...{'swappedFrom': c['swappedFrom'], 'swappedFromName': c['swappedFromName'] ?? ''},
                    'alloc': take('${c['productId']}', ((c['qty'] as num?)?.toDouble() ?? 0) * l.qty),
                  },
              ],
            },
          }
        else
        {
          'id': l.id,
          'name': l.name,
          'price': numOut(l.price),
          'cost': numOut(l.cost),
          'qty': numOut(l.qty),
          if (l.controlled) 'controlled': true,
          if (l.directions != null) 'directions': l.directions,
          if (l.pack != null)
            'pack': {'name': l.pack!.name, 'size': numOut(l.pack!.size), 'count': numOut(l.qty / l.pack!.size), 'price': numOut(l.price * l.pack!.size)},
          'alloc': take(l.id, l.qty, allowExpired: l.allowExpired, prefer: l.preferBatch),
        },
    ];
    final sale = d.put('sales', {
      'id': uid(),
      'number': number,
      'date': d.now,
      'type': wholesale ? 'wholesale' : 'retail',
      'branchId': branchId,
      'items': items,
      'subtotal': numOut(t.subtotal),
      'discount': numOut(t.discount),
      'tax': numOut(t.tax),
      'total': numOut(t.total),
      'payment': c.method.name,
      'paid': numOut(paid),
      'tendered': numOut(type == 'cash' ? (c.tendered ?? due) : paid),
      'bankId': type == 'cash' || credit ? cashDrawer : ((settings.raw['nonCashBankId'] as String?) ?? cashDrawer),
      'customerId': c.customerId,
      'customerName': c.customerName,
      'cashier': cashier,
      'status': 'completed',
      if (c.controlled != null) 'controlled': c.controlled!.toJson(),
      if (type == 'momo')
        'momo': c.momo != null ? (c.momo!['manual'] == true ? c.momo! : {...c.momo!, 'confirmed': true}) : {'txid': c.momoRef!.trim(), 'manual': true},
      if (cart.any((l) => l.allowExpired)) 'expiredOverride': true,
      // the cloud does not flag a proforma's discount and prices: they were set by whoever made the quotation
      'proformaId': ?proformaId,
      'creditOver': ?c.creditOver,
      if (ins != null)
        'insurance': {
          'insurerId': ins.insurer['id'],
          'insurer': ins.insurerName,
          'schemeId': ins.scheme['id'],
          'scheme': ins.schemeName,
          'memberNo': ins.memberNo.trim(),
          'share': numOut(copayOf(ins.scheme, t.total, decimals: settings.decimalPlaces).insurer),
        },
    });
    for (final i in items) {
      // a kit line's stock: each of its medicines, from the batches they came from
      final kit = i['kit'];
      if (kit is Map) {
        for (final c in (kit['components'] as List).cast<Map<String, Object?>>()) {
          for (final a in (c['alloc'] as List).cast<Map<String, Object?>>()) {
            d.move(productId: '${c['id']}', qty: -(a['qty'] as num).toDouble(), type: 'Sale', ref: number, user: cashier, batchId: a['batchId'] as String?, branchId: branchId);
          }
        }
        // the warning given (recommendation 5) and any medicine swapped for this sale (recommendation 3)
        if (kit['acked'] == true) d.audit(cashier, 'Kit warning given', '$number: ${i['name']}: ${kit['warning']}', branchId);
        final sw = (kit['components'] as List).cast<Map<String, Object?>>().where((c) => '${c['swappedFrom'] ?? ''}'.isNotEmpty).toList();
        if (sw.isNotEmpty) d.audit(cashier, 'Kit item swapped', '$number: ${i['name']}: ${sw.map((c) => '${c['name']} instead of ${c['swappedFromName']}').join(', ')}', branchId);
        continue;
      }
      for (final a in (i['alloc'] as List).cast<Map<String, Object?>>()) {
        d.move(
          productId: i['id'] as String,
          qty: -(a['qty'] as num).toDouble(),
          type: 'Sale',
          ref: number,
          user: cashier,
          batchId: a['batchId'] as String?,
          branchId: branchId,
        );
      }
    }
    also?.call(d, sale);
    final expired = cart.where((l) => l.allowExpired).toList();
    if (expired.isNotEmpty) {
      d.audit(
        cashier,
        'Expired stock sold',
        '$number: ${expired.map((l) => '${l.name} (${l.expiredReason.isEmpty ? 'no reason given' : l.expiredReason})').join('; ')}',
        branchId,
      );
    }
    if (t.discount > 0) {
      d.audit(cashier, 'Discount given', '$number: ${formatMoney(t.discount, currency: settings.currency, decimals: settings.decimalPlaces)}', branchId);
    }
    final over = c.creditOver;
    if (over != null) {
      String m(Object? v) => formatMoney((v as num?) ?? 0, currency: settings.currency, decimals: settings.decimalPlaces);
      d.audit(cashier, 'Credit limit exceeded', '$number: ${c.customerName} owed ${m(over['owed'])}, + ${m(over['adds'])} on credit, limit ${m(over['limit'])}${over['reason'] != null ? ' · ${over['reason']}' : ''}', branchId);
    }
    return sale;
  });
}

/// Pack helpers used by the screen.
List<Pack> sellablePacks(Product p) => packsOf(p);
