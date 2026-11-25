// The keyboard map, as src/keymap.js (the owner's request, 2026-11-10): every shortcut is an action with a default key,
// changeable per device (This device → Keyboard). Keys are written the same way in both apps: "F2", "Ctrl+K",
// "Alt+ArrowLeft", a two-key sequence "G C" (press G, then C), "?", "Delete", "Escape", " " (Space).
// test/core/keymap_test.dart checks the actions and default keys match the React app's.
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// (id, label, group, default key)
const keyActions = <(String, String, String, String)>[
  ('go:/pos', 'Till (retail)', 'Pages', 'F2'),
  ('go:/pos/wholesale', 'Till (wholesale)', 'Pages', 'F3'),
  ('go:/add-stock', 'Add Stock', 'Pages', 'F4'),
  ('go:/sales', 'Sales History', 'Pages', 'F6'),
  ('go:/inventory', 'Inventory', 'Pages', 'F7'),
  ('go:/', 'Dashboard', 'Pages', 'G D'),
  ('go:/customers', 'Customers', 'Pages', 'G C'),
  ('go:/suppliers', 'Suppliers', 'Pages', 'G U'),
  ('go:/insurers', 'Insurers', 'Pages', 'G N'),
  ('go:/medicines', 'Medicine List', 'Pages', 'G M'),
  ('go:/purchases', 'Purchase History', 'Pages', 'G P'),
  ('go:/expiry', 'Expiring / Expired', 'Pages', 'G X'),
  ('go:/shifts', 'Shifts & Cash-up', 'Pages', 'G H'),
  ('go:/expenses', 'Expenses', 'Pages', 'G E'),
  ('go:/reports', 'Reports', 'Pages', 'G R'),
  ('go:/settings', 'Settings', 'Pages', 'G T'),
  ('palette', 'Search and commands', 'Anywhere', 'Ctrl+K'),
  ('help', 'Keyboard and mouse help', 'Anywhere', '?'),
  ('back', 'Back', 'Anywhere', 'Alt+ArrowLeft'),
  ('forward', 'Forward', 'Anywhere', 'Alt+ArrowRight'),
  ('pin', 'Pin or unpin this page in the menu', 'Anywhere', 'G G'),
  ('list:down', 'Next row', 'Lists', 'ArrowDown'),
  ('list:up', 'Previous row', 'Lists', 'ArrowUp'),
  ('list:first', 'First row', 'Lists', 'Home'),
  ('list:last', 'Last row', 'Lists', 'End'),
  ('list:open', 'Open the row', 'Lists', 'Enter'),
  ('list:edit', 'Edit the row', 'Lists', 'E'),
  ('list:delete', 'Delete the row (or the ticked rows)', 'Lists', 'Delete'),
  ('list:new', 'Add a new one', 'Lists', 'N'),
  ('list:search', 'Search the list', 'Lists', '/'),
  ('list:tick', 'Tick / untick the row', 'Lists', ' '),
  ('list:all', 'Tick all rows shown', 'Lists', 'Ctrl+A'),
  ('list:clear', 'Untick all, clear the search', 'Lists', 'Escape'),
];

/// The device key holding the changed keys ({"go:/customers": "G K", ...}).
const keymapKey = 'keymap';

/// The keys on this device: the defaults with the changes saved in [saved] (the device value, JSON).
class KeyMap {
  KeyMap(String? saved) : changed = _parse(saved);
  final Map<String, String> changed;
  static Map<String, String> _parse(String? s) {
    try {
      return (jsonDecode(s ?? '{}') as Map).map((k, v) => MapEntry('$k', '$v'));
    } catch (_) {
      return {};
    }
  }

  static final _defaults = {for (final a in keyActions) a.$1: a.$4};
  String keyOf(String id) => changed.containsKey(id) ? changed[id]! : _defaults[id] ?? '';
  bool isDefault(String id) => !changed.containsKey(id);

  /// The saved value after changing [id] to [key]: another action with that key (in the same scope) loses it.
  String withKey(String id, String key) {
    final m = {...changed};
    bool list(String x) => x.startsWith('list:');
    if (key.isNotEmpty) {
      for (final a in keyActions) {
        if (a.$1 != id && keyOf(a.$1) == key && list(a.$1) == list(id)) m[a.$1] = '';
      }
    }
    if (key == _defaults[id]) {
      m.remove(id);
    } else {
      m[id] = key;
    }
    return jsonEncode(m);
  }
}

const _named = {' ': 'Space', 'ArrowLeft': '←', 'ArrowRight': '→', 'ArrowUp': '↑', 'ArrowDown': '↓', 'Escape': 'Esc', 'Delete': 'Del'};

bool _isSequence(String k) => k.contains(' ') && k.trim().length > 1;

/// A key as shown: "Alt+←", "G then C", "Space".
String showKey(String k) => k.isEmpty
    ? '—'
    : _isSequence(k)
        ? k.split(' ').map((p) => _named[p] ?? p).join(' then ')
        : k.split('+').map((p) => _named[p] ?? p).join('+');

const _keyNames = {
  'Arrow Left': 'ArrowLeft', 'Arrow Right': 'ArrowRight', 'Arrow Up': 'ArrowUp', 'Arrow Down': 'ArrowDown', 'Escape': 'Escape', 'Delete': 'Delete',
  'Enter': 'Enter', 'Home': 'Home', 'End': 'End', 'Space': ' ', 'Backspace': 'Backspace', 'Tab': 'Tab', 'Page Up': 'PageUp', 'Page Down': 'PageDown',
  'Numpad Enter': 'Enter',
};

/// A key press as a key name, as the React app writes it (null for a modifier on its own or a key release).
String? comboOf(KeyEvent e) {
  if (e is KeyUpEvent) return null;
  final k = e.logicalKey;
  final mods = {LogicalKeyboardKey.shiftLeft, LogicalKeyboardKey.shiftRight, LogicalKeyboardKey.controlLeft, LogicalKeyboardKey.controlRight,
    LogicalKeyboardKey.altLeft, LogicalKeyboardKey.altRight, LogicalKeyboardKey.metaLeft, LogicalKeyboardKey.metaRight};
  if (mods.contains(k)) return null;
  final hw = HardwareKeyboard.instance;
  final ch = e.character;
  String name;
  if (ch == '?' || (k == LogicalKeyboardKey.slash && HardwareKeyboard.instance.isShiftPressed) || k == LogicalKeyboardKey.question) {
    name = '?';
  } else if (_keyNames.containsKey(k.keyLabel)) {
    name = _keyNames[k.keyLabel]!;
  } else if (RegExp(r'^F\d{1,2}$').hasMatch(k.keyLabel)) {
    name = k.keyLabel;
  } else if (k.keyLabel.length == 1) {
    name = k.keyLabel == ' ' ? ' ' : k.keyLabel.toUpperCase();
  } else {
    name = k.keyLabel;
  }
  final parts = [
    if (hw.isControlPressed || hw.isMetaPressed) 'Ctrl',
    if (hw.isAltPressed) 'Alt',
    if (hw.isShiftPressed && name.length > 1) 'Shift',
    name,
  ];
  return parts.join('+');
}

/// Feed it key presses; it answers the action pressed among [ids] (two-key sequences wait 1.5 s for the second key).
class KeyMatcher {
  KeyMatcher(this.map, this.ids);
  KeyMap map;
  final List<String> ids;
  String _first = '';
  DateTime _at = DateTime(0);

  String? match(KeyEvent e) {
    final c = comboOf(e);
    if (c == null) return null;
    final now = DateTime.now();
    final pending = _first.isNotEmpty && now.difference(_at) < const Duration(milliseconds: 1500) ? _first : '';
    _first = '';
    for (final id in ids) {
      final k = map.keyOf(id);
      if (k.isEmpty) continue;
      if (_isSequence(k)) {
        final p = k.split(' ');
        if (pending == p[0] && c == p[1]) return id;
      } else if (k == c) {
        return id;
      }
    }
    if (ids.any((id) => _isSequence(map.keyOf(id)) && map.keyOf(id).split(' ')[0] == c)) {
      _first = c;
      _at = now;
    }
    return null;
  }
}

/// Is the person typing in a text box (plain letters then belong to the box).
bool typingNow() => FocusManager.instance.primaryFocus?.context?.widget is EditableText ||
    (FocusManager.instance.primaryFocus?.context?.findAncestorWidgetOfExactType<EditableText>() != null);
