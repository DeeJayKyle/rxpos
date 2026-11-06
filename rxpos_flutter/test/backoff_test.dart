import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/utils/backoff.dart';

class _Fixed implements Random {
  _Fixed(this.v);
  final double v;
  @override
  double nextDouble() => v;
  @override
  int nextInt(int max) => 0;
  @override
  bool nextBool() => false;
}

void main() {
  test('backoff doubles from 1 s and stops at 60 s, with 0.5–1.5 jitter', () {
    expect(backoff(0, random: _Fixed(0.5)), const Duration(seconds: 1));
    expect(backoff(3, random: _Fixed(0.5)), const Duration(seconds: 8));
    expect(backoff(10, random: _Fixed(0.5)), const Duration(seconds: 60));
    expect(backoff(2, random: _Fixed(0)), const Duration(seconds: 2));
    expect(backoff(2, random: _Fixed(1)), const Duration(seconds: 6));
  });
}
