import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/sales_pos/domain/scan_buffer.dart';
import 'package:rxpos/theme/rxpos_theme.dart';

Duration ms(int n) => Duration(milliseconds: n);

/// Types [code] one key every [gap] ms from [start], then Enter after the same gap; returns what the buffer handed back.
String? burst(ScanBuffer b, String code, {int gap = 5, int start = 0}) {
  var t = start;
  for (final c in code.split('')) {
    expect(b.key(character: c, at: ms(t)), isNull);
    t += gap;
  }
  return b.key(enter: true, at: ms(t));
}

void main() {
  group('ScanBuffer', () {
    test('a fast burst ending in Enter is a scan', () {
      expect(burst(ScanBuffer(), '6001234567890'), '6001234567890');
    });

    test('a person typing (keys over 30 ms apart) is not a scan', () {
      expect(burst(ScanBuffer(), '6001234567890', gap: 120), isNull);
    });

    test('a slow Enter after a fast burst is not a scan', () {
      final b = ScanBuffer();
      for (final (i, c) in '12345678'.split('').indexed) {
        b.key(character: c, at: ms(i * 5));
      }
      expect(b.key(enter: true, at: ms(35 + 200)), isNull);
      expect(b.pending, isEmpty);
    });

    test('a pause starts a new burst: only the fast tail is the code', () {
      final b = ScanBuffer();
      b.key(character: 'x', at: ms(0));
      b.key(character: 'y', at: ms(10));
      expect(burst(b, 'ABCD1234', start: 500), 'ABCD1234');
    });

    test('too short a burst is not a scan', () {
      expect(burst(ScanBuffer(), '12'), isNull);
    });

    test('Shift (no character) does not break a burst of capitals', () {
      final b = ScanBuffer();
      b.key(character: 'A', at: ms(0));
      expect(b.key(at: ms(3)), isNull); // Shift down
      b.key(character: 'B', at: ms(6));
      b.key(character: '1', at: ms(9));
      b.key(character: '2', at: ms(12));
      expect(b.key(enter: true, at: ms(15)), 'AB12');
    });

    test('a control character drops what was collected', () {
      final b = ScanBuffer();
      b.key(character: '1', at: ms(0));
      b.key(character: '2', at: ms(5));
      b.key(character: '\t', at: ms(10));
      expect(b.pending, isEmpty);
    });

    test('the buffer is empty again after a scan, and reset clears it', () {
      final b = ScanBuffer();
      expect(burst(b, '11112222'), '11112222');
      expect(b.pending, isEmpty);
      b.key(character: '9', at: ms(1000));
      b.reset();
      expect(b.pending, isEmpty);
    });
  });

  group('windowClassFor', () {
    test('< 600 compact, < 900 medium, else expanded', () {
      expect(windowClassFor(412), WindowClass.compact);
      expect(windowClassFor(599.9), WindowClass.compact);
      expect(windowClassFor(600), WindowClass.medium);
      expect(windowClassFor(899), WindowClass.medium);
      expect(windowClassFor(900), WindowClass.expanded);
      expect(windowClassFor(1440), WindowClass.expanded);
    });
  });
}
