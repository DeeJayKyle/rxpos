// Excel export: a real workbook the import's reader (and Excel) opens; numbers stay numbers; text that looks like a
// formula stays text.
import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/presentation/xlsx.dart';
import 'package:rxpos/features/extras/domain/import_sheet.dart';

void main() {
  test('a table round-trips through Excel', () {
    final bytes = toXlsx([
      {'medicine': 'Calmex 500mg Tabs', 'inStock': 100, 'value': 30000.5, 'note': 'A & B <x>'},
      {'medicine': 'Zinco Syrup', 'inStock': 0, 'value': 0, 'note': '=1+1'},
    ], sheet: 'Stock in hand');
    final rows = readXlsx(bytes);
    expect(rows.first, ['medicine', 'inStock', 'value', 'note']);
    expect(rows[1].take(3).map((v) => '$v'), ['Calmex 500mg Tabs', '100', '30000.5']);
    expect('${rows[1][3]}', 'A & B <x>');
    expect('${rows[2][3]}', "'=1+1", reason: 'a formula-looking text is not run');
    final zip = ZipDecoder().decodeBytes(bytes);
    final sheet = utf8.decode(zip.findFile('xl/worksheets/sheet1.xml')!.content as List<int>);
    expect(sheet, allOf(contains('state="frozen"'), contains('<autoFilter ref="A1:D3"/>'), contains('<c r="B2" s="2"><v>100</v></c>')));
    expect(utf8.decode(zip.findFile('xl/workbook.xml')!.content as List<int>), contains('name="Stock in hand"'));
  });

  test('an empty table is still a valid workbook', () {
    expect(readXlsx(toXlsx(const [])), isA<List>());
  });
}
