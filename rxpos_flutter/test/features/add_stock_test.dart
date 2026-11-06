// Add Stock parity: the line rules (qty / unit cost / line total in step, price following the markup), typed dates,
// invoice scanning (dates, matching, lines), receiving a purchase order / a draft, and correcting a past delivery.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/pharmacy_providers.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/batch.dart';
import 'package:rxpos/core/entities/movement.dart';
import 'package:rxpos/core/entities/party.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/core/rules/stock.dart';
import 'package:rxpos/features/stock/domain/delivery.dart';
import 'package:rxpos/features/stock/domain/purchase_edit.dart';
import 'package:rxpos/features/stock/domain/stock_form.dart';
import 'package:rxpos/features/stock/presentation/invoice_scan.dart';

void main() {
  const s = PharmacySettings(retailMarkup: 50, priceRound: 50, receiveUnit: 'pack');
  final para = Product.fromRecord({'id': 'p1', 'name': 'Paramol 500mg Tabs', 'unit': 'Tablet', 'price': 60, 'cost': 30, 'packs': [{'name': 'Box', 'size': 100}]});
  final zinc = Product.fromRecord({'id': 'p2', 'name': 'Zinco Syrup 100ml', 'unit': 'Bottle', 'price': 6000, 'cost': 4000});
  final pf = priceAt(50, s);

  group('a line', () {
    test('received in the largest pack; the cost per pack; price kept', () {
      final l = lineFor(para, s);
      expect((l['recvPack'], l['recvSize'], l['cost'], l['total'], l['price']), ('Box', 100.0, '3000', '3000', '60'));
    });
    test('the line total works out the unit cost (unrounded) and the price follows the markup; never lower than today\'s', () {
      var l = lineFor(zinc, s);
      l = editLine(l, {'qty': '3'}, pf);
      expect(l['total'], '12000');
      l = editLine(l, {'total': '13000'}, pf);
      expect((l['by'], l['cost'], unitCost(l)), ('total', '4333.33', 13000 / 3));
      expect((l['price'], l['kept']), ('6500', false), reason: '4333.33 × 1.5 = 6500 rounded up to 50');
      l = editLine(l, {'cost': '3000'}, pf);
      expect((l['total'], l['price'], l['kept']), ('9000', '6000', true), reason: '4500 < 6000 today: kept');
      l = editLine(l, {'price': '7000'}, pf);
      expect(l['auto'], false);
      l = editLine(l, {'cost': '5000'}, pf);
      expect(l['price'], '7000', reason: 'a typed price stays');
      l = editLine(l, {'price': ''}, pf);
      expect(l['price'], '7500', reason: 'cleared: back to the markup');
    });
    test('a purchase order\'s lines; new medicine lines become delivery lines', () {
      final ls = linesFromPo({'items': [{'productId': 'p2', 'qty': 4, 'cost': 3800}, {'productId': 'gone', 'qty': 1}]}, {'p2': zinc}, s);
      expect((ls.single['qty'], ls.single['cost'], ls.single['total']), ('4', '3800', '15200'));
      final form = {...blankForm(s), 'lines': [ls.single, {...blankLine(), 'productId': newMedicine, 'name': ' New  Drops ', 'qty': '2', 'cost': '100', 'price': '200', 'barcode': '7012'}]};
      final dl = deliveryLines(form);
      expect((dl.first.productId, dl.last.isNew, dl.last.newName, dl.last.barcode), ('p2', true, ' New  Drops ', '7012'));
      expect(formTotal(form), 15200 + 200);
    });
    test('checks: lines read from the invoice without a medicine; the scanned invoice ticked as checked; below cost', () {
      final f = {...blankForm(s), 'lines': [{...blankLine(), 'read': {'name': 'X'}, 'qty': '1'}]};
      expect(checkForm(f), contains('Choose the medicine for 1 line'));
      expect(checkForm({...blankForm(s)}, scanned: true), contains('Tick'));
      expect(belowCost({...blankForm(s), 'lines': [{...lineFor(zinc, s), 'price': '100'}]}, {'p2': zinc}), ['Zinco Syrup 100ml']);
    });
  });

  test('dates typed in the device format; month/year is the end of the month', () {
    expect([parseTypedDate('31/12/2027', 'dmy'), parseTypedDate('12/31/2027', 'mdy'), parseTypedDate('2027-12-31', 'dmy'), parseTypedDate('02/28', 'dmy', monthYear: true),
      parseTypedDate('31/02/2027', 'dmy'), parseTypedDate('x', 'dmy')], ['2027-12-31', '2027-12-31', '2027-12-31', '2028-02-29', '', '']);
    expect(showDate('2027-12-31', 'dmy'), '31/12/2027');
  });

  group('invoice scanning', () {
    test('dates as written on invoices', () {
      expect([normDate('2028-06'), normDate('06/28'), normDate('Jun 2028'), normDate('30 Jun 2028'), normDate('15/07/2027'), normDate('2028-6-3'), normDate('')],
          ['2028-06-30', '2028-06-30', '2028-06-30', '2028-06-30', '2027-07-15', '2028-06-03', '']);
    });
    test('names matched to the pharmacy\'s medicines and suppliers', () {
      expect(matchProduct('PARAMOL 500MG TABLETS x100', [para, zinc], (_) => 1)?.id, 'p1');
      expect(matchProduct('Paramol 250mg', [para], (_) => 1), isNull, reason: 'another strength');
      expect(matchProduct('Something else', [para, zinc], (_) => 1), isNull);
      const sup = Supplier(id: 's1', name: 'Sample Wholesalers Ltd');
      expect(matchSupplier('SAMPLE WHOLESALERS (U) LIMITED', [sup])?.id, 's1');
    });
    test('what was read becomes lines: the box chosen by the nearest cost, the price worked out, what to check', () {
      final d = PharmacyData(settings: s, products: [para, zinc], stock: StockView(products: [para, zinc], batches: const [], index: StockIndex.of(const [])),
          customers: const [], suppliers: const [Supplier(id: 's1', name: 'Sample Wholesalers')], drafts: const [], features: const {});
      final r = {'supplier': 'Sample Wholesalers', 'invoiceNo': 'INV-9', 'date': '05/11/2026', 'total': 9300, 'linesTotal': 9300, 'totalMatches': true, 'readings': 2, 'items': [
        {'name': 'Paramol 500mg tabs', 'qty': 2, 'unitCost': 3100, 'batch': 'B1', 'expiry': '12/27'},
        {'name': 'Unknown Cream', 'qty': 1, 'lineTotal': 3100, 'check': ['qty'], 'alt': {'qty': 2}},
      ]};
      final x = applyScan(r, blankForm(s), d, user: 'Tia');
      final ls = lines(x.form);
      expect((x.form['supplierId'], x.form['invoice'], x.form['date']), ('s1', 'INV-9', '2026-11-05'));
      expect((ls[0]['productId'], ls[0]['recvPack'], ls[0]['cost'], ls[0]['expiry'], ls[0]['price']), ('p1', 'Box', '3100', '2027-12-31', '60'));
      expect((ls[1]['productId'], ls[1]['total'], checkTextOf(ls[1]['read'] as Map)), ('', '3100', 'quantity (other reading: 2)'));
      expect((x.summary['unmatched'], x.summary['unclear'], x.summary['supplierMatched']), (1, 1, true));
    });
  });

  group('receiving and correcting', () {
    late AppDatabase db;
    late RecordStore store;
    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      store = RecordStore(db);
    });
    tearDown(() => db.close());

    test('a purchase order is marked received; the draft it came from goes', () async {
      await store.update((d) {
        d.put('purchaseOrders', {'id': 'po1', 'number': 'PO1', 'status': 'Sent', 'items': []});
        d.put('drafts', {'id': 'dr1', 'kind': 'delivery'});
      });
      final rec = await receiveDelivery(store, lines: const [DeliveryLine(productId: 'p2', qty: 2, unitCost: 4000, batch: 'Z', expiry: '2030-01-31')], products: {'p2': zinc},
          settings: s, receivedBy: 'Tia', poId: 'po1', draftId: 'dr1', scanned: true);
      expect((await store.get('purchaseOrders', 'po1'))!['status'], 'Received');
      expect(await store.get('drafts', 'dr1'), isNull);
      expect(rec['scanned'], true);
      expect((await store.rows('audit')).last['details'], contains('scanned invoice, checked by Tia'));
    });

    test('a delivery draft keeps the form in the React shape and comes back', () async {
      final d = PharmacyData(settings: s, products: [zinc], stock: StockView(products: [zinc], batches: const [], index: StockIndex.of(const [])),
          customers: const [], suppliers: const [Supplier(id: 's1', name: 'Alpha')], drafts: const [], features: const {});
      final form = {...blankForm(s), 'supplierId': 's1', 'invoice': 'I-1', 'lines': [lineFor(zinc, s), blankLine()]};
      final rec = await saveDeliveryDraft(store, form, data: d, userId: 'u1', userName: 'Tia');
      expect((rec['title'], rec['count'], rec['total'], rec['kind']), ('Alpha', 1, 4000.0, 'delivery'));
      final back = formFromDraft(rec, s);
      expect((back['draftId'], back['invoice'], lines(back).single['productId']), (rec['id'], 'I-1', 'p2'));
    });

    test('correcting a delivery: less of a line back out of its batch, a line removed, one added; sold stock can\'t be taken back', () async {
      await store.update((d) {
        d.put('batches', {'id': 'b1', 'productId': 'p2', 'batch': 'Z1', 'expiry': '2030-01-31'});
        d.put('batches', {'id': 'b2', 'productId': 'p1', 'batch': 'P1', 'expiry': '2030-01-31'});
        d.move(productId: 'p2', qty: 10, type: 'Purchase', batchId: 'b1');
        d.move(productId: 'p1', qty: 5, type: 'Purchase', batchId: 'b2');
      });
      final purchase = {'id': 'g1', 'number': 'GRN1', 'branchId': 'main', 'total': 41500, 'paid': 41500, 'date': '2026-11-01', 'items': [
        {'productId': 'p2', 'name': 'Zinco', 'qty': 10, 'cost': 4000, 'batch': 'Z1', 'expiry': '2030-01-31', 'batchId': 'b1'},
        {'productId': 'p1', 'name': 'Paramol', 'qty': 5, 'cost': 300, 'batch': 'P1', 'expiry': '2030-01-31', 'batchId': 'b2'},
      ]};
      Future<List<BatchStock> Function(String, String)> view() async {
        final idx = StockIndex.of((await store.rows('movements')).map(Movement.fromRecord));
        final bs = (await store.rows('batches')).map(Batch.fromRecord).toList();
        return (id, br) => StockView(products: [para, zinc], batches: bs, index: idx, branch: br).batchesOf(id);
      }

      var ls = editLinesOf(purchase);
      expect(() async => editPurchase(store, purchase, ls, supplierId: '', supplierName: '', invoice: '', notes: '', date: '2026-11-01', paid: 0, reason: '', user: 'T',
          batchesOf: await view(), settings: s), throwsA(isA<DeliveryProblem>()));
      ls = [ls[0].copyWith(qty: 8), ls[1].copyWith(removed: true), const PurchaseEditLine(productId: 'p1', name: 'Paramol', qty: 3, cost: 300, batch: 'P9', expiry: '2031-01-31')];
      final rec = await editPurchase(store, purchase, ls, supplierId: '', supplierName: '', invoice: 'I', notes: '', date: '2026-11-01', paid: 100000, reason: 'invoice said 8',
          user: 'T', batchesOf: await view(), settings: s);
      final moves = (await store.rows('movements')).where((m) => m['type'] == 'Purchase edit').map((m) => (m['productId'], m['qty'], m['note'])).toList();
      expect(moves, [('p2', -2, ''), ('p1', -5, 'line removed'), ('p1', 3, 'line added')]);
      expect((rec['total'], rec['paid'], (rec['items'] as List).length), (32900.0, 32900.0, 2));
      expect((await store.rows('audit')).single['details'], contains('1 line removed, 1 added (invoice said 8)'));
      // sell 7 of the 8 left: it can no longer be removed
      await store.update((d) => d.move(productId: 'p2', qty: -7, type: 'Sale', batchId: 'b1'));
      await expectLater(editPurchase(store, rec, [editLinesOf(rec)[0].copyWith(removed: true), editLinesOf(rec)[1]], supplierId: '', supplierName: '', invoice: '', notes: '',
          date: '2026-11-01', paid: 0, reason: 'x', user: 'T', batchesOf: await view(), settings: s), throwsA(predicate((e) => '$e'.contains('only 1 of batch Z1 left'))));
    });

    test('deleting a delivery takes its stock back out and removes it; refused once some of it was sold', () async {
      await store.update((d) {
        d.put('batches', {'id': 'b1', 'productId': 'p2', 'batch': 'Z1', 'expiry': '2030-01-31'});
        d.put('batches', {'id': 'b2', 'productId': 'p1', 'batch': 'P1', 'expiry': '2030-01-31'});
        d.move(productId: 'p2', qty: 10, type: 'Purchase', batchId: 'b1');
        d.move(productId: 'p1', qty: 5, type: 'Purchase', batchId: 'b2');
      });
      Map<String, Object?> grn(String id) => {'id': id, 'number': 'GRN-$id', 'branchId': 'main', 'supplierName': 'Alpha', 'invoice': 'I-9', 'total': 41500, 'paid': 41500,
        'date': '2026-11-01', 'items': [
          {'productId': 'p2', 'name': 'Zinco', 'qty': 10, 'cost': 4000, 'batch': 'Z1', 'expiry': '2030-01-31', 'batchId': 'b1'},
          {'productId': 'p1', 'name': 'Paramol', 'qty': 5, 'cost': 300, 'batch': 'P1', 'expiry': '2030-01-31', 'batchId': 'b2'},
        ]};
      await store.update((d) => d.put('purchases', grn('g2')));
      Future<List<BatchStock> Function(String, String)> view() async {
        final idx = StockIndex.of((await store.rows('movements')).map(Movement.fromRecord));
        final bs = (await store.rows('batches')).map(Batch.fromRecord).toList();
        return (id, br) => StockView(products: [para, zinc], batches: bs, index: idx, branch: br).batchesOf(id);
      }

      await expectLater(deletePurchase(store, grn('g2'), reason: ' ', user: 'T', batchesOf: await view(), settings: s), throwsA(isA<DeliveryProblem>()));
      // one sold: it can't be deleted, and nothing changed
      await store.update((d) => d.move(productId: 'p2', qty: -1, type: 'Sale', batchId: 'b1'));
      await expectLater(deletePurchase(store, grn('g2'), reason: 'wrong supplier', user: 'T', batchesOf: await view(), settings: s),
          throwsA(predicate((e) => '$e'.contains('only 9 of batch Z1 left'))));
      expect(await store.get('purchases', 'g2'), isNotNull);
      // the sale returned: now it can
      await store.update((d) => d.move(productId: 'p2', qty: 1, type: 'Return', batchId: 'b1'));
      await deletePurchase(store, grn('g2'), reason: 'entered twice', user: 'T', batchesOf: await view(), settings: s);
      expect(await store.get('purchases', 'g2'), isNull);
      final moves = (await store.rows('movements')).where((m) => m['note'] == 'delivery deleted').map((m) => (m['productId'], m['qty'], m['type'], m['batchId'])).toList();
      expect(moves, [('p2', -10, 'Purchase edit', 'b1'), ('p1', -5, 'Purchase edit', 'b2')]);
      final v = await view();
      expect((v('p2', 'main').single.qty, v('p1', 'main').single.qty), (0, 0));
      expect((await store.rows('audit')).last['details'], allOf(contains('GRN-g2 from Alpha'), contains('entered twice')));
    });
  });
}
