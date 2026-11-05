// Finance ledger and balances, reports, prescription refills, proformas.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/core/entities/sale.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/features/finance/domain/ledger.dart';
import 'package:rxpos/features/prescriptions/domain/prescriptions.dart';
import 'package:rxpos/features/proformas/domain/proformas.dart';
import 'package:rxpos/features/reports/domain/reports.dart';
import 'package:rxpos/features/sales_pos/domain/cart.dart';

void main() {
  test('account balances follow every kind of money movement', () {
    final b = accountBalances({
      'banks': [{'id': 'cash-drawer', 'opening': 10000}, {'id': 'stanbic', 'opening': 0}],
      'sales': [{'number': 'R1', 'date': '2026-11-01', 'total': 5000, 'paid': 5000, 'bankId': 'cash-drawer'},
        {'number': 'R2', 'date': '2026-11-01', 'total': 3000, 'paid': 3000, 'status': 'refunded'},
        {'number': 'R3', 'date': '2026-11-01', 'total': 9999, 'imported': true}],
      'purchases': [{'date': '2026-11-02', 'total': 4000, 'paid': 1000, 'bankId': 'stanbic'}],
      'expenses': [{'date': '2026-11-02', 'amount': 700}],
      'payments': [{'kind': 'customer', 'amount': 2000, 'date': '2026-11-03'}, {'kind': 'supplier', 'amount': 500, 'bankId': 'stanbic', 'date': '2026-11-03'}],
      'loans': [{'id': 'l1', 'lender': 'Bank', 'amount': 50000, 'bankId': 'stanbic', 'date': '2026-11-01'}],
      'bankTx': [{'type': 'Deposit', 'bankId': 'stanbic', 'amount': 6000, 'date': '2026-11-04'}],
      'supplierReturns': [{'settle': 'cash', 'total': 300, 'date': '2026-11-04'}],
    });
    // cash: 10000 + 5000 + 3000 − 3000 − 700 + 2000 − 6000 + 300 = 10600
    expect(b['cash-drawer'], 10600);
    // bank: −1000 − 500 + 50000 + 6000 = 54500
    expect(b['stanbic'], 54500);
    expect(loanBalance({'id': 'l1', 'amount': 50000, 'interestRate': 10}, [{'kind': 'loan', 'partyId': 'l1', 'amount': 20000}]).balance, 35000);
  });

  test('a report: sales, refunds, cost of goods, gross and net profit, by medicine and payment', () {
    Sale s(String id, String date, double total, {String status = 'completed', double tax = 0, String pay = 'Cash'}) => Sale.fromRecord({'id': id, 'date': date, 'total': total,
      'paid': total, 'tax': tax, 'status': status, 'payment': pay, 'cashier': 'Tia', 'items': [{'id': 'p', 'name': 'Amoxa', 'price': total, 'cost': 100, 'qty': 2}]});
    final r = report([s('a', '2026-11-01T09:00:00', 1180, tax: 180), s('b', '2026-11-02T09:00:00', 500, pay: 'Mobile Money'), s('c', '2026-11-02T09:00:00', 900, status: 'refunded'),
      s('d', '2026-10-30T09:00:00', 7777)], [{'date': '2026-11-02', 'amount': 300}], from: '2026-11-01', to: '2026-11-05');
    expect((r.count, r.sales, r.tax, r.cogs, r.grossProfit, r.expenses, r.netProfit, r.refunds), (2, 1680.0, 180.0, 400.0, 1100.0, 300.0, 800.0, 1));
    expect(r.byMedicine['Amoxa']!.qty, 4);
    expect(r.byMethod.keys.toSet(), {'Cash', 'Mobile Money'});
  });

  group('with a device database', () {
    late AppDatabase db;
    late RecordStore store;
    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      store = RecordStore(db);
    });
    tearDown(() => db.close());

    test('refills: counted, the last completes the prescription, then refused', () async {
      var r = <String, Object?>{'id': 'rx1', 'date': '2026-10-01', 'status': 'Dispensed', 'refillsAllowed': 2, 'refillsUsed': 0, 'refillDays': 30};
      r = await recordRefill(store, r, user: 'Tia', patient: 'Grace', now: DateTime(2026, 11, 1));
      expect((r['refillsUsed'], r['status'], nextRefillDue(r)), (1, 'Dispensed', '2026-12-01'));
      r = await recordRefill(store, r, user: 'Tia', patient: 'Grace');
      expect(r['status'], 'Completed');
      expect(() => recordRefill(store, r, user: 'Tia', patient: 'Grace'), throwsA(isA<RefillProblem>()));
    });

    test('a proforma keeps the lines and totals as the React till writes them', () async {
      final pf = await saveProforma(store, cart: [const CartLine(id: 'p', name: 'Amoxa', price: 500, cost: 300, qty: 3, max: 10)], discount: 100,
          settings: const PharmacySettings(), wholesale: false, customerId: 'walk-in', customerName: 'Walk-in Customer', by: 'Tia');
      expect((pf['status'], pf['total'], (pf['number'] as String).startsWith('PF')), ('Open', 1400.0, true));
    });
  });

  test('the cash book: the balance before the period, each entry with the balance after it, totals', () {
    final t = {
      'banks': [{'id': 'cash-drawer', 'name': 'Cash at hand', 'opening': 1000}],
      'sales': [{'id': 's1', 'number': 'R1', 'date': '2026-10-30T10:00:00Z', 'total': 500, 'paid': 500}, {'id': 's2', 'number': 'R2', 'date': '2026-11-02T10:00:00Z', 'total': 300, 'paid': 300}],
      'expenses': [{'id': 'e', 'date': '2026-11-03', 'amount': 200, 'description': 'Airtime'}],
    };
    final b = cashBook(t, 'cash-drawer', from: '2026-11-01', to: '2026-11-30', opening: 1000);
    expect((b.opening, b.totalIn, b.totalOut, b.closing), (1500.0, 300.0, 200.0, 1600.0));
    expect(b.rows.map((x) => x.$2), [1800.0, 1600.0]);
    final none = cashBook(t, 'cash-drawer', from: '2026-12-01', to: '2026-12-31', opening: 1000);
    expect((none.opening, none.closing, none.rows.length), (1600.0, 1600.0, 0));
  });
}
