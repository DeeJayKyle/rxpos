// Import medicines from Excel / CSV (src/pages/Import.jsx).
import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/data/record_store.dart';
import 'package:rxpos/core/database/app_database.dart';
import 'package:rxpos/features/extras/domain/import_sheet.dart';

Uint8List xlsx(String sheetXml, String shared) {
  final a = Archive()
    ..add(ArchiveFile.string('xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Stock" sheetId="1" r:id="rId1"/></sheets></workbook>'))
    ..add(ArchiveFile.string('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'))
    ..add(ArchiveFile.string('xl/sharedStrings.xml', shared))
    ..add(ArchiveFile.string('xl/worksheets/sheet1.xml', sheetXml));
  return Uint8List.fromList(ZipEncoder().encode(a));
}

void main() {
  test('CSV: quotes, separators inside quotes, semicolons, blank lines', () {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n\n'), [
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('a;b;c\n1;2,5;3'), [
      ['a', 'b', 'c'],
      ['1', '2,5', '3'],
    ]);
  });

  test('dates: ISO, dd/mm/yyyy, mm/yyyy, Excel day numbers', () {
    expect(toDate('2027-06-30T00:00'), '2027-06-30');
    expect(toDate('5/3/27'), '2027-03-05');
    expect(toDate('02/2028'), '2028-02-29');
    expect(toDate(46387), '2026-12-31');
    expect(toDate(''), '');
  });

  test('the header row is found and columns matched by their names', () {
    final s = toSheet('f.csv', parseCsv('Price list,\nItem Name,Generic,Selling price,Cost,Qty,Exp\nPanadol,Paracetamol,500,300,10,12/2027'));
    expect(s.headers, ['Item Name', 'Generic', 'Selling price', 'Cost', 'Qty', 'Exp']);
    expect(autoMap(s.headers), {'name': 0, 'generic': 1, 'price': 2, 'cost': 3, 'stock': 4, 'expiry': 5});
  });

  test('an Excel workbook is read (shared strings, numbers, gaps)', () {
    final rows = readXlsx(xlsx(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Panadol</t></is></c><c r="C2"><v>500</v></c></row></sheetData></worksheet>',
      '<sst><si><t>Name</t></si><si><r><t>Retail</t></r><r><t> price</t></r></si></sst>',
    ));
    expect(rows, [
      ['Name', null, 'Retail price'],
      ['Panadol', null, 500],
    ]);
  });

  test('import adds new medicines with opening stock and updates existing ones', () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = RecordStore(db);
    await store.update((d) => d.put('products', {'id': 'p1', 'name': 'Panadol', 'price': 400, 'cost': 250, 'barcode': '111'}));
    final sheet = toSheet('stock.csv', parseCsv('Name,Cost,Retail price,Stock,Batch,Expiry\nPanadol,300,,5,,\nNewcough Syrup,1000,,3,NC1,2028-01-31'));
    final r = await importSheet(store, sheet, autoMap(sheet.headers), skipExisting: false, retailMarkup: 50, wholesaleMarkup: 25, user: 'Tia', branchId: 'main');
    expect(r, (added: 1, updated: 1, skipped: 0, stocked: 2));
    final p1 = (await store.get('products', 'p1'))!;
    expect(p1['cost'], 300);
    expect(p1['price'], 400, reason: 'an empty price keeps the old one');
    final fresh = (await store.rows('products')).firstWhere((p) => p['name'] == 'Newcough Syrup');
    expect(fresh['price'], 1500, reason: 'cost + the retail markup');
    expect(fresh['wholesale'], 1250);
    expect('${fresh['barcode']}', isNotEmpty);
    final b = (await store.rows('batches')).firstWhere((b) => b['productId'] == fresh['id']);
    expect((b['batch'], b['expiry']), ('NC1', '2028-01-31'));
    final again = await importSheet(store, sheet, autoMap(sheet.headers), skipExisting: true, retailMarkup: 50, wholesaleMarkup: 25, user: 'Tia', branchId: 'main');
    expect(again.skipped, 2);
    expect(utf8.decode(utf8.encode(importTemplate)), startsWith('Name,Generic'));
  });
}
