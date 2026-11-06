// The Add Stock form, ported from src/pages/Purchases.jsx. The form and its lines are kept as plain maps with the React
// app's field names, so a delivery draft saved on one app can be carried on in the other:
//   form  { supplierId, invoice, date, paid, bankId, notes, markup, lines, draftId?, draftStartedAt?, poId? }
//   line  { key, productId ('' | '__new__' | id), name, form, qty, cost, total, price, auto, by ('unit' | 'total'),
//           batch, expiry, recvPack?, recvSize?, basePrice?, derived?, kept?, read?, barcode? }
// Numbers typed in the boxes are kept as text (as typed), like the React inputs.
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/party.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/packs.dart';
import '../../../core/rules/pricing.dart';
import '../../../core/rules/stock.dart';
import 'delivery.dart';

const newMedicine = '__new__';
const medicineForms = ['Tablets', 'Capsules', 'Syrups', 'Suspensions', 'Injectables', 'Creams', 'Ointments', 'Drops', 'Sachets', 'Devices', 'Surgicals', 'Others'];
const stockColumns = {'medicine': 'Medicine', 'qty': 'Qty', 'cost': 'Unit cost', 'total': 'Line total', 'price': 'New retail price', 'batch': 'Batch', 'expiry': 'Expiry'};

/// The saved column order (unknown names dropped, missing ones added at the end).
List<String> columnOrder(List<String>? saved) {
  final ok = [for (final c in saved ?? const <String>[]) if (stockColumns.containsKey(c)) c];
  return [...ok, ...stockColumns.keys.where((c) => !ok.contains(c))];
}

typedef Line = Map<String, Object?>;

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}'.trim()) ?? 0;
bool _blank(Object? v) => v == null || '$v'.trim().isEmpty;
String _r2(double n) => _txt((n * 100).roundToDouble() / 100);
String _txt(double n) => n == n.roundToDouble() ? '${n.toInt()}' : '$n';
String numOrBlank(Object? v) => _blank(v) || double.tryParse('$v') == null ? '' : _r2(_n(v));

/// Unit cost exactly as entered: a line typed as a total keeps total ÷ qty unrounded, so qty × cost = the total.
double unitCost(Line l) => l['by'] == 'total' && !_blank(l['total']) && _n(l['qty']) > 0 ? _n(l['total']) / _n(l['qty']) : _n(l['cost']);

/// Cost of one selling unit (a box's cost divided by the units in it).
double baseCost(Line l) => unitCost(l) / (_n(l['recvSize']) > 0 ? _n(l['recvSize']) : 1);

double lineTotal(Line l) => l['by'] == 'total' && !_blank(l['total']) ? _n(l['total']) : _n(l['qty']) * _n(l['cost']);

double formTotal(Map<String, Object?> form) => lines(form).fold<double>(0, (a, l) => a + (_blank(l['productId']) ? 0 : lineTotal(l)));

List<Line> lines(Map<String, Object?> form) => [for (final l in (form['lines'] as List?) ?? const []) (l as Map).cast<String, Object?>()];

Line blankLine() => {'key': uid(), 'productId': '', 'name': '', 'form': 'Tablets', 'qty': '1', 'cost': '', 'total': '', 'price': '', 'auto': true, 'by': 'unit', 'batch': '', 'expiry': ''};

Map<String, Object?> blankForm(PharmacySettings s) => {
      'supplierId': '', 'invoice': '', 'date': today(), 'paid': '', 'bankId': 'cash-drawer', 'notes': '', 'markup': _txt(s.retailMarkup), 'lines': [blankLine()],
    };

/// The price worked out from a cost at a markup (rounded to the pharmacy's price step).
double Function(double) priceAt(Object? markup, PharmacySettings s) => (cost) => markupPrice(cost, _n(markup), s.priceRound);

/// Apply an edit to a line. Quantity, unit cost and line total stay in step (type whichever the invoice shows), and the
/// retail price follows the cost at the markup until the person types a price of their own; a medicine already in
/// the list never gets a lower price on its own (the higher of today's price and cost + markup).
Line editLine(Line l, Map<String, Object?> patch, double Function(double) priceFor) {
  final n = {...l, ...patch};
  final qty = _n(n['qty']);
  if (patch.containsKey('total')) {
    n['by'] = 'total';
    n['cost'] = !_blank(patch['total']) && qty > 0 ? numOrBlank(_n(patch['total']) / qty) : '';
  } else if (patch.containsKey('cost')) {
    n['by'] = 'unit';
    n['total'] = !_blank(patch['cost']) ? numOrBlank(_n(patch['cost']) * qty) : '';
  } else if (patch.containsKey('qty')) {
    if (n['by'] == 'total' && !_blank(n['total'])) {
      n['cost'] = qty > 0 ? numOrBlank(_n(n['total']) / qty) : '';
    } else if (!_blank(n['cost'])) {
      n['total'] = numOrBlank(_n(n['cost']) * qty);
    }
  }
  if (patch.containsKey('price')) n['auto'] = _blank(patch['price']);
  final costChanged = patch.containsKey('cost') || patch.containsKey('total') || (patch.containsKey('qty') && n['by'] == 'total');
  if (n['auto'] == true && (costChanged || (patch.containsKey('price') && _blank(patch['price'])) || patch['reprice'] == true || patch.containsKey('recvSize')) && baseCost(n) > 0) {
    final worked = priceFor(baseCost(n));
    final kept = _n(n['basePrice']) > worked;
    n['kept'] = kept;
    n['price'] = _txt(kept ? _n(n['basePrice']) : worked);
    n['derived'] = true;
  }
  n.remove('reprice');
  return n;
}

/// A line for a medicine already in the list: its current cost and price, received in its largest pack when the
/// pharmacy receives in packs (the cost is then per pack).
Line lineFor(Product p, PharmacySettings s, {Map<String, Object?> extra = const {}, Object? markup}) {
  final k = receiveInPacks(s) && !extra.containsKey('recvPack') ? mainPack(p) : null;
  final l = <String, Object?>{
    ...blankLine(), 'productId': p.id, 'cost': p.cost > 0 ? numOrBlank(p.cost * (k?.size ?? 1)) : '', 'price': p.price > 0 ? _txt(p.price) : '', 'basePrice': p.price, 'derived': false,
    if (k != null) 'recvPack': k.name, if (k != null) 'recvSize': k.size,
    ...extra,
  };
  if (_blank(l['price']) && unitCost(l) > 0) {
    l['price'] = _txt(priceAt(markup ?? s.retailMarkup, s)(unitCost(l)));
    l['derived'] = true;
  }
  return {...l, 'total': !_blank(l['cost']) ? numOrBlank(_n(l['cost']) * _n(l['qty'])) : ''};
}

/// Lines of a purchase order (Reorder → Receive): its quantities and costs, in single units.
List<Line> linesFromPo(Map<String, Object?> po, Map<String, Product> byId, PharmacySettings s) => [
      for (final i in ((po['items'] as List?) ?? const []).cast<Map>())
        if (byId['${i['productId']}'] case final p?)
          lineFor(p, s, extra: {
            'qty': _txt(_n(i['qty'])), 'recvPack': '', 'recvSize': 1,
            if (_n(i['cost']) > 0) 'cost': numOrBlank(i['cost']), if (_n(i['cost']) > 0) 'total': numOrBlank(_n(i['cost']) * _n(i['qty'])),
          }),
    ];

/// What a line is called (a new medicine's typed name, else the medicine's).
String lineName(Line l, Map<String, Product> byId) =>
    l['productId'] == newMedicine ? '${l['name'] ?? ''}'.trim().replaceAll(RegExp(r'\s+'), ' ') : byId['${l['productId']}']?.name ?? '${l['name'] ?? ''}';

/// The checks before receiving that need the person (the rest are in [receiveDelivery]): lines read off an invoice
/// still without a medicine; "checked" not ticked on a scanned invoice. Returns what to fix, or null.
String? checkForm(Map<String, Object?> form, {bool scanned = false, bool checked = false}) {
  final unpicked = lines(form).where((l) => l['read'] != null && _blank(l['productId']) && _n(l['qty']) > 0).length;
  if (unpicked > 0) {
    return 'Choose the medicine for $unpicked line${unpicked > 1 ? 's' : ''} read from the invoice, add ${unpicked > 1 ? 'them' : 'it'} as new, or remove ${unpicked > 1 ? 'them' : 'it'}';
  }
  if (scanned && !checked) return 'Tick "I have checked every line against the invoice" before saving';
  return null;
}

/// Lines whose retail price is below their cost (asked before receiving).
List<String> belowCost(Map<String, Object?> form, Map<String, Product> byId) =>
    [for (final l in lines(form)) if (!_blank(l['productId']) && _n(l['price']) > 0 && _n(l['price']) < baseCost(l)) lineName(l, byId)];

/// The form's lines as delivery lines.
List<DeliveryLine> deliveryLines(Map<String, Object?> form) => [
      for (final l in lines(form))
        if (!_blank(l['productId']))
          DeliveryLine(
            productId: l['productId'] == newMedicine ? null : '${l['productId']}',
            newName: l['productId'] == newMedicine ? '${l['name'] ?? ''}' : '',
            qty: _n(l['qty']), recvPack: '${l['recvPack'] ?? ''}', recvSize: _n(l['recvSize']) > 0 ? _n(l['recvSize']) : 1, unitCost: unitCost(l),
            price: _n(l['price']), batch: '${l['batch'] ?? ''}', expiry: '${l['expiry'] ?? ''}', form: '${l['form'] ?? 'Others'}', barcode: '${l['barcode'] ?? ''}',
          ),
    ];

/// Receive the form: the delivery, a purchase order marked received, a draft removed.
Future<Map<String, Object?>> receiveForm(RecordStore store, Map<String, Object?> form, {required PharmacyData data, required String user, bool scanned = false, DateTime? now}) {
  final sup = data.suppliers.where((x) => x.id == form['supplierId']).firstOrNull;
  return receiveDelivery(store, lines: deliveryLines(form), products: data.byId, settings: data.settings, receivedBy: user, supplierId: sup?.id ?? '',
      supplierName: sup?.name ?? '', invoice: '${form['invoice'] ?? ''}', notes: '${form['notes'] ?? ''}', date: _blank(form['date']) ? null : '${form['date']}',
      paid: _blank(form['paid']) ? null : _n(form['paid']), bankId: '${form['bankId'] ?? 'cash-drawer'}', branchId: data.branch, now: now,
      poId: _blank(form['poId']) ? null : '${form['poId']}', draftId: _blank(form['draftId']) ? null : '${form['draftId']}', scanned: scanned);
}

/// An unfinished delivery as a draft record (the React app's deliveryDraft).
Map<String, Object?> deliveryDraft(Map<String, Object?> form, {required String id, required String userId, required String userName, required String branchId,
    String? supplierName, required double total, String? startedAt, Map<String, Object?>? scan}) {
  final keep = [for (final l in lines(form)) if (!_blank(l['productId']) || !_blank(l['name']) || l['read'] != null) l];
  final data = {...form, 'lines': keep}..remove('draftId')..remove('draftStartedAt');
  return {
    'id': id, 'kind': 'delivery', 'branchId': branchId, 'userId': userId, 'userName': userName, 'order': DateTime.now().millisecondsSinceEpoch,
    'startedAt': startedAt ?? DateTime.now().toUtc().toIso8601String(),
    'title': scan != null ? 'Scanned: ${supplierName ?? scan['supplier'] ?? 'invoice'}' : (supplierName == null || supplierName.isEmpty ? 'Delivery' : supplierName),
    'invoice': '${form['invoice'] ?? ''}', 'count': keep.length, 'total': total, 'data': data, 'scan': ?scan,
  };
}

/// Save the form as a draft (synced: finish it later or on another device).
Future<Map<String, Object?>> saveDeliveryDraft(RecordStore store, Map<String, Object?> form, {required PharmacyData data, required String userId, required String userName,
    Map<String, Object?>? scan}) async {
  if (!lines(form).any((l) => !_blank(l['productId']))) throw DeliveryProblem('Add at least one medicine before saving a draft');
  final sup = data.suppliers.where((x) => x.id == form['supplierId']).firstOrNull;
  final rec = deliveryDraft(form, id: _blank(form['draftId']) ? uid() : '${form['draftId']}', userId: userId, userName: userName, branchId: data.branch,
      supplierName: sup?.name, total: formTotal(form), startedAt: _blank(form['draftStartedAt']) ? null : '${form['draftStartedAt']}', scan: scan);
  await store.update((d) => d.put('drafts', rec));
  return rec;
}

/// A draft carried on (Purchase History → Drafts → Continue): its form, with the draft's id to replace it.
Map<String, Object?> formFromDraft(Map<String, Object?> draft, PharmacySettings s) {
  final data = (draft['data'] as Map?)?.cast<String, Object?>() ?? const {};
  final ls = lines(data);
  return {
    ...blankForm(s), ...data, 'draftId': draft['id'], 'draftStartedAt': draft['startedAt'],
    'lines': ls.isEmpty ? [blankLine()] : [for (final l in ls) {...l, 'key': l['key'] ?? uid()}],
  };
}

/// Add a supplier from Add Stock (chosen at once); an existing one with the same name is chosen instead.
Future<({String id, bool existed})> addSupplier(RecordStore store, List<Supplier> suppliers, {required String name, String phone = '', String contact = '', String email = '',
    required String user, String branchId = mainBranch}) async {
  final clean = name.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (clean.length < 2) throw DeliveryProblem("Type the supplier's name");
  final dup = suppliers.where((x) => x.name.trim().toLowerCase() == clean.toLowerCase()).firstOrNull;
  if (dup != null) return (id: dup.id, existed: true);
  final id = uid();
  await store.update((d) {
    d.put('suppliers', {'id': id, 'name': clean, 'contact': contact.trim(), 'phone': phone.trim(), 'email': email.trim(), 'address': ''});
    d.audit(user, 'Supplier added', '$clean (from Add Stock)', branchId);
  });
  return (id: id, existed: false);
}

/// Rename a medicine everywhere (the medicine list, the till, reports, every device).
Future<void> renameMedicine(RecordStore store, Product p, String typed, List<Product> all, {required String user, String branchId = mainBranch}) async {
  final name = typed.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (name.length < 2) throw DeliveryProblem("Type the medicine's name");
  if (name == p.name) return;
  final dup = all.where((x) => x.id != p.id && x.name.trim().toLowerCase() == name.toLowerCase()).firstOrNull;
  if (dup != null) throw DeliveryProblem('"${dup.name}" is already in your medicine list');
  await store.update((d) {
    d.put('products', {...p.toRecord(), 'name': name});
    d.audit(user, 'Medicine renamed', '${p.name} → $name', branchId);
  });
}

/// Typing dates: how this device writes them (This device → Dates), like the React DateInput.
const dateFormats = [('dmy', 'DD/MM/YYYY'), ('mdy', 'MM/DD/YYYY'), ('ymd', 'YYYY-MM-DD')];

/// A typed date in the device's format (or month/year for an expiry: the end of that month) → YYYY-MM-DD; '' when
/// it cannot be read.
String parseTypedDate(String text, String format, {bool monthYear = false}) {
  final t = text.trim();
  if (t.isEmpty) return '';
  final iso = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})$').firstMatch(t);
  int? y, m, d;
  if (iso != null) {
    y = int.parse(iso[1]!);
    m = int.parse(iso[2]!);
    d = int.parse(iso[3]!);
  } else {
    final parts = t.split(RegExp(r'[^0-9]+')).where((x) => x.isNotEmpty).toList();
    if (monthYear && parts.length == 2) {
      // year first (2028/06) in the YYYY-MM-DD format, otherwise month first (06/2028, 6/28)
      final yearFirst = format == 'ymd' && parts[0].length == 4;
      m = int.tryParse(yearFirst ? parts[1] : parts[0]);
      y = int.tryParse(yearFirst ? parts[0] : parts[1]);
      if (y != null && y < 100) y += 2000;
      if (m == null || y == null || m < 1 || m > 12) return '';
      d = DateTime(y, m + 1, 0).day;
    } else if (parts.length == 3) {
      final a = int.tryParse(parts[0]), b = int.tryParse(parts[1]), c = int.tryParse(parts[2]);
      if (a == null || b == null || c == null) return '';
      (y, m, d) = switch (format) { 'mdy' => (c, a, b), 'ymd' => (a, b, c), _ => (c, b, a) };
      if (y < 100) y += 2000;
    } else if (RegExp(r'^\d{6}$|^\d{8}$').hasMatch(t)) {
      // typed without separators: 06112026 / 061126 (YYYYMMDD in the YYYY-MM-DD format), as in React
      if (format == 'ymd') return t.length == 8 ? parseTypedDate('${t.substring(0, 4)}-${t.substring(4, 6)}-${t.substring(6)}', format) : '';
      final a = int.parse(t.substring(0, 2)), b = int.parse(t.substring(2, 4));
      y = int.parse(t.substring(4));
      (m, d) = format == 'mdy' ? (a, b) : (b, a);
      if (y < 100) y += 2000;
    } else {
      return '';
    }
  }
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > DateTime(y, m + 1, 0).day) return '';
  return '$y-${m.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
}

/// YYYY-MM-DD shown in the device's format.
String showDate(String iso, String format) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso);
  if (m == null) return ''; // not a date: shown empty, as in React (src/dateformat.js formatDate)
  return switch (format) { 'mdy' => '${m[2]}/${m[3]}/${m[1]}', 'ymd' => '${m[1]}-${m[2]}-${m[3]}', _ => '${m[3]}/${m[2]}/${m[1]}' };
}
