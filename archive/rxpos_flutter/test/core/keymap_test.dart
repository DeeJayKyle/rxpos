// The keyboard map is the same in both apps (src/keymap.js ACTIONS): the same actions, labels, groups and keys.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/presentation/keymap.dart';

void main() {
  test('the actions and their default keys match the React app', () {
    final js = File('../src/keymap.js').readAsStringSync();
    final rows = [
      for (final m in RegExp(r"\[\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)'\s*\]").allMatches(js)) (m[1]!, m[2]!, m[3]!, m[4]!),
    ];
    expect(rows, isNotEmpty);
    expect(keyActions, rows);
  });
  test('a changed key moves from the action that had it; the default clears the change', () {
    var map = KeyMap(null);
    expect((map.keyOf('go:/customers'), map.keyOf('go:/sales')), ('G C', 'F6'));
    map = KeyMap(map.withKey('go:/customers', 'F6'));
    expect((map.keyOf('go:/customers'), map.keyOf('go:/sales')), ('F6', ''));
    map = KeyMap(map.withKey('go:/customers', 'G C'));
    expect((map.isDefault('go:/customers'), map.keyOf('go:/sales')), (true, ''));
    expect(KeyMap(KeyMap(null).withKey('list:edit', 'F6')).keyOf('go:/sales'), 'F6', reason: 'a list key and a page key do not clash');
  });
  test('keys are shown as people read them', () {
    expect([showKey('G C'), showKey('Alt+ArrowLeft'), showKey(' '), showKey('')], ['G then C', 'Alt+←', 'Space', '—']);
  });
}
