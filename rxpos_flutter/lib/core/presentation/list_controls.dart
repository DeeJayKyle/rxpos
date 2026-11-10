// Lists the same way everywhere, as src/listcontrols.jsx (the owner's request, 2026-11-10): ↑ ↓ move a highlighted row,
// Enter opens it, E edits, Delete deletes (the ticked rows, or the highlighted one), N adds, / searches, Space ticks,
// Ctrl+A ticks all, Esc unticks; a click highlights, a double-click opens, a right-click (a long press on a touch
// screen) shows the row's menu, Shift+click on a tick box ticks the rows in between. The keys come from the keyboard
// map (keymap.dart), so they can be changed per device.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'keymap.dart';
import 'keys_host.dart';

/// One item of a row's menu.
class RowAction {
  const RowAction(this.label, this.icon, this.run, {this.danger = false, this.keyId});
  final String label;
  final IconData icon;
  final VoidCallback run;
  final bool danger;
  final String? keyId;
}

/// What a list's rows get from [ListControls]: whether the row is highlighted or ticked, and the row wrapped so a
/// click, double-click and right-click work.
class RowState {
  const RowState({required this.active, required this.ticked, required this.wrap, required this.tickBox});
  final bool active, ticked;
  final Widget Function(Widget child) wrap;
  final Widget tickBox;
}

class ListControls extends ConsumerStatefulWidget {
  const ListControls({super.key, required this.ids, required this.builder, this.onOpen, this.onEdit, this.onDelete, this.onNew, this.menu, this.search,
      this.onClearSearch, this.bulk, this.selectable = true});
  /// the rows shown, in order
  final List<String> ids;
  /// builds the list from the rows' states: (context, state of row i)
  final Widget Function(BuildContext context, RowState Function(int i) row) builder;
  final void Function(int i)? onOpen, onEdit;
  final void Function(List<int> rows)? onDelete;
  final VoidCallback? onNew, onClearSearch;
  final List<RowAction> Function(int i)? menu;
  final FocusNode? search;
  /// what can be done with the ticked rows (shown in a bar over the list)
  final List<(String, IconData, void Function(List<int> rows, VoidCallback done))> Function(List<int> rows)? bulk;
  final bool selectable;
  @override
  ConsumerState<ListControls> createState() => _ListControlsState();
}

class _ListControlsState extends ConsumerState<ListControls> {
  int _active = -1, _last = -1;
  final Set<String> _ticked = {};
  late final KeyMatcher _m = KeyMatcher(ref.read(keyMapProvider), [for (final a in keyActions) if (a.$1.startsWith('list:')) a.$1]);
  final _scroll = <int, GlobalKey>{};
  // the list takes the keyboard focus (a click on a row gives it back), so its keys reach it and nothing else: a
  // focused button would otherwise also take Enter, and the arrow keys would move the focus
  final _focus = FocusNode(debugLabel: 'list');
  bool _shiftDown = false;
  String _prev = '';
  DateTime _prevAt = DateTime(0);

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onSearchKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onSearchKey);
    _focus.dispose();
    super.dispose();
  }

  /// In the list's own search box: ↓ goes to the rows, Esc clears it.
  bool _onSearchKey(KeyEvent e) {
    if (!mounted || e is KeyUpEvent || widget.search?.hasFocus != true) return false;
    if (ModalRoute.of(context)?.isCurrent == false) return false;
    if (e.logicalKey == LogicalKeyboardKey.arrowDown && widget.ids.isNotEmpty) {
      _focus.requestFocus();
      _go(0);
      return true;
    }
    if (e.logicalKey == LogicalKeyboardKey.escape && widget.onClearSearch != null) {
      widget.onClearSearch!();
      _focus.requestFocus();
      return true;
    }
    return false;
  }

  @override
  void didUpdateWidget(ListControls old) {
    super.didUpdateWidget(old);
    _ticked.removeWhere((id) => !widget.ids.contains(id));
    if (_active >= widget.ids.length) _active = widget.ids.length - 1;
  }

  List<int> get _tickedRows => [for (var i = 0; i < widget.ids.length; i++) if (_ticked.contains(widget.ids[i])) i];

  void _toggle(int i, {bool shift = false}) => setState(() {
        if (shift && _last >= 0) {
          final on = !_ticked.contains(widget.ids[i]);
          for (var k = i < _last ? i : _last; k <= (i < _last ? _last : i); k++) {
            on ? _ticked.add(widget.ids[k]) : _ticked.remove(widget.ids[k]);
          }
        } else if (!_ticked.remove(widget.ids[i])) {
          _ticked.add(widget.ids[i]);
        }
        _last = i;
      });

  void _go(int i) {
    final n = widget.ids.length;
    if (n == 0) return;
    setState(() => _active = i.clamp(0, n - 1));
    final k = _scroll[_active];
    if (k?.currentContext != null) Scrollable.ensureVisible(k!.currentContext!, alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtEnd);
  }

  bool _onKey(KeyEvent e) {
    if (!mounted || e is KeyUpEvent) return false;
    final map = _m.map = ref.read(keyMapProvider);
    final c = comboOf(e);
    if (c == null) return false;
    // the second key of a page shortcut (G then E is Expenses) is the app's, not "edit the row"
    final starters = {for (final a in keyActions) if (!a.$1.startsWith('list:') && map.keyOf(a.$1).contains(' ')) map.keyOf(a.$1).split(' ').first};
    final afterStarter = starters.contains(_prev) && DateTime.now().difference(_prevAt) < const Duration(milliseconds: 1500);
    // the key after a starter completes the app's shortcut: it starts nothing itself (G then G, then ↓ is ↓)
    _prev = afterStarter ? '' : c;
    _prevAt = DateTime.now();
    if (afterStarter || starters.contains(c)) return false;
    final id = _m.match(e);
    if (id == null) return false;
    final n = widget.ids.length, a = _active;
    switch (id) {
      case 'list:down':
        _go(a + 1);
      case 'list:up':
        _go(a <= 0 ? 0 : a - 1);
      case 'list:first':
        _go(0);
      case 'list:last':
        _go(n - 1);
      case 'list:open' when a >= 0 && (widget.onOpen ?? widget.onEdit) != null:
        (widget.onOpen ?? widget.onEdit)!(a);
      case 'list:edit' when a >= 0 && widget.onEdit != null:
        widget.onEdit!(a);
      case 'list:delete' when widget.onDelete != null && (_ticked.isNotEmpty || a >= 0):
        widget.onDelete!(_ticked.isNotEmpty ? _tickedRows : [a]);
      case 'list:new' when widget.onNew != null:
        widget.onNew!();
      case 'list:search' when widget.search != null:
        widget.search!.requestFocus();
      case 'list:tick' when a >= 0 && widget.selectable:
        _toggle(a, shift: HardwareKeyboard.instance.isShiftPressed);
      case 'list:all' when n > 0 && widget.selectable:
        setState(() => _ticked.length == n ? _ticked.clear() : _ticked.addAll(widget.ids));
      case 'list:clear':
        if (_ticked.isNotEmpty) {
          setState(_ticked.clear);
        } else {
          widget.onClearSearch?.call();
          setState(() => _active = -1);
        }
      default:
        return false;
    }
    return true;
  }

  Future<void> _menu(int i, Offset at) async {
    final items = widget.menu?.call(i) ?? const <RowAction>[];
    final all = [
      ...items,
      if (widget.selectable) RowAction(_ticked.contains(widget.ids[i]) ? 'Untick' : 'Tick', Icons.check_box_outlined, () => _toggle(i), keyId: 'list:tick'),
    ];
    if (all.isEmpty) return;
    setState(() => _active = i);
    final map = ref.read(keyMapProvider);
    final pick = await showMenu<RowAction>(
      context: context,
      position: RelativeRect.fromLTRB(at.dx, at.dy, at.dx + 1, at.dy + 1),
      items: [
        for (final a in all)
          PopupMenuItem(
            value: a,
            child: Row(children: [
              Icon(a.icon, size: 18, color: a.danger ? Theme.of(context).colorScheme.error : null),
              const SizedBox(width: 10),
              Expanded(child: Text(a.label, style: TextStyle(color: a.danger ? Theme.of(context).colorScheme.error : null))),
              if (a.keyId != null && map.keyOf(a.keyId!).isNotEmpty) Text(showKey(map.keyOf(a.keyId!)), style: Theme.of(context).textTheme.labelSmall),
            ]),
          ),
      ],
    );
    pick?.run();
  }

  RowState _row(int i) {
    final id = widget.ids[i];
    final key = _scroll.putIfAbsent(i, GlobalKey.new);
    final active = i == _active, ticked = _ticked.contains(id);
    final scheme = Theme.of(context).colorScheme;
    return RowState(
      active: active,
      ticked: ticked,
      // Shift is read when the button goes down (Shift+click ticks the rows in between)
      tickBox: widget.selectable
          ? Listener(
              onPointerDown: (_) => _shiftDown = HardwareKeyboard.instance.isShiftPressed,
              child: Checkbox(
                key: ValueKey('tick-$id'),
                semanticLabel: 'Tick this row',
                value: ticked,
                onChanged: (_) {
                  _toggle(i, shift: _shiftDown || HardwareKeyboard.instance.isShiftPressed);
                  _shiftDown = false;
                },
              ),
            )
          : const SizedBox(),
      wrap: (child) => GestureDetector(
        key: key,
        behavior: HitTestBehavior.opaque,
        // the row's own semantics (its ListTile) are what a screen reader uses; these are mouse and touch extras
        excludeFromSemantics: true,
        onTap: () {
          setState(() => _active = i);
          _focus.requestFocus();
        },
        onDoubleTap: (widget.onOpen ?? widget.onEdit) == null ? null : () => (widget.onOpen ?? widget.onEdit)!(i),
        onSecondaryTapDown: widget.menu == null && !widget.selectable ? null : (d) => _menu(i, d.globalPosition),
        onLongPressStart: widget.menu == null ? null : (d) => _menu(i, d.globalPosition),
        // the colour on a Material (a ListTile's ink shows on it), the highlighted row's bar drawn over it
        child: Material(
          color: ticked ? scheme.primary.withValues(alpha: .14) : active ? scheme.primary.withValues(alpha: .08) : Colors.transparent,
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(border: active ? Border(left: BorderSide(color: scheme.primary, width: 3)) : null),
            child: child,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows = _tickedRows;
    final bulk = rows.isEmpty ? const <(String, IconData, void Function(List<int>, VoidCallback))>[] : widget.bulk?.call(rows) ?? const [];
    void done() => setState(_ticked.clear);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (rows.isNotEmpty)
        Container(
          key: const Key('bulk-bar'),
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(10)),
          child: Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text('${rows.length} ticked', style: const TextStyle(fontWeight: FontWeight.w700)),
            for (final (label, icon, run) in bulk) OutlinedButton.icon(onPressed: () => run(rows, done), icon: Icon(icon, size: 16), label: Text(label)),
            if (widget.onDelete != null)
              OutlinedButton.icon(onPressed: () => widget.onDelete!(rows), icon: const Icon(Icons.delete_outline, size: 16), label: const Text('Delete')),
            TextButton(onPressed: done, child: const Text('Untick all (Esc)')),
          ]),
        ),
      Expanded(
        child: Focus(
          focusNode: _focus,
          autofocus: true,
          onKeyEvent: (_, e) => _onKey(e) ? KeyEventResult.handled : KeyEventResult.ignored,
          child: widget.builder(context, _row),
        ),
      ),
    ]);
  }
}
