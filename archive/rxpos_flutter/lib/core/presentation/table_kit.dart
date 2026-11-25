// Tables and lists, UI batch 3 (C), as src/tablekit.jsx:
//   LoadMore       C7: 100 rows, then more as the list is scrolled ("Showing 100 of 2,340"), no page buttons
//   ColumnsChoice  C2: a "Columns" button: show / hide and reorder the columns, kept on this device
//   SwipeRow       C10: on a phone, a row swiped to the left shows its actions (Call, WhatsApp, Print, Refund…)
//   sideDialogs    C8: on screens 1280 px and wider a row's details open as a panel on the right, the list stays
//   HealthBar      C9: a thin bar of stock against the reorder level (2 × reorder = full)
//   CellEdit       C5: a figure edited in the table: Enter saves, Esc cancels
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';
import '../theme/themes.dart' show TonesOfContext;

/// C7: how many rows to draw; grows by [step] when the list nears its end. Wrap the list in [listen].
class LoadMore {
  LoadMore(this.onChange, {this.step = 100});
  final VoidCallback onChange;
  final int step;
  int _n = 100;
  String _key = '';
  int shown(int total, String key) {
    if (key != _key) {
      _key = key;
      _n = step;
    }
    return total < _n ? total : _n;
  }

  void more() {
    _n += step;
    onChange();
  }

  /// more rows as the list is scrolled near its end
  Widget listen({required int total, required Widget child}) => NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.axis == Axis.vertical && n.metrics.extentAfter < 400 && _n < total) more();
          return false;
        },
        child: child,
      );

  /// the line under the list: "Showing 100 of 2,340" and a button for the rest
  Widget footer(BuildContext context, int total) {
    final n = total < _n ? total : _n;
    if (n >= total) return const SizedBox.shrink(); // all drawn: nothing to say
    return Padding(
      key: const Key('load-more'),
      padding: const EdgeInsets.all(10),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Text('Showing $n of $total', style: Theme.of(context).textTheme.bodySmall),
        if (n < total) ...[const SizedBox(width: 12), TextButton(onPressed: more, child: Text('Show ${total - n < step ? total - n : step} more'))],
      ]),
    );
  }
}

/// C2: the columns of a list in this device's order, the hidden ones left out (deviceValueProvider 'columns:KEY')
class ColumnsChoice {
  ColumnsChoice(this.key, this.labels, {this.fixed = 1, String? saved}) {
    try {
      final j = saved == null || saved.isEmpty ? const {} : jsonDecode(saved) as Map;
      final o = [for (final x in (j['order'] as List?) ?? const []) '$x'];
      order = [...o.where(labels.contains), ...labels.where((l) => !o.contains(l))];
      hidden = {for (final x in (j['hidden'] as List?) ?? const []) '$x'};
    } catch (_) {
      order = [...labels];
    }
    // the fixed columns stay first and shown
    order = [...labels.take(fixed), ...order.where((l) => !labels.take(fixed).contains(l))];
  }
  final String key;
  final List<String> labels;
  final int fixed;
  late List<String> order;
  Set<String> hidden = {};

  /// the columns shown, in order, as indexes into [labels]
  List<int> get shown => [for (final l in order) if (!hidden.contains(l)) labels.indexOf(l)];
  String encode() => jsonEncode({'order': order, 'hidden': hidden.toList()});

  static ColumnsChoice of(WidgetRef ref, String key, List<String> labels) => ColumnsChoice(key, labels, saved: ref.watch(deviceValueProvider('columns:$key')).value);

  /// the "Columns" button: a dialog with a tick and up / down for each column
  Widget button(BuildContext context, WidgetRef ref) => OutlinedButton.icon(
        key: Key('columns-$key'),
        onPressed: () => showDialog<void>(
          context: context,
          builder: (c) => StatefulBuilder(builder: (c, set) {
            void save() {
              ref.read(deviceValueProvider('columns:$key').notifier).set(encode());
              set(() {});
            }
            return AlertDialog(
              title: const Text('Columns'),
              content: SizedBox(
                width: 320,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  for (final (i, l) in order.indexed)
                    Row(key: Key('col-$l'), children: [
                      Checkbox(value: !hidden.contains(l), onChanged: i < fixed ? null : (v) {
                        v == true ? hidden.remove(l) : hidden.add(l);
                        save();
                      }),
                      Expanded(child: Text(l)),
                      IconButton(tooltip: 'Move $l up', onPressed: i <= fixed ? null : () {
                        order.insert(i - 1, order.removeAt(i));
                        save();
                      }, icon: const Icon(Icons.arrow_upward, size: 18)),
                      IconButton(tooltip: 'Move $l down', onPressed: i < fixed || i == order.length - 1 ? null : () {
                        order.insert(i + 1, order.removeAt(i));
                        save();
                      }, icon: const Icon(Icons.arrow_downward, size: 18)),
                    ]),
                ]),
              ),
              actions: [
                TextButton(onPressed: () {
                  ref.read(deviceValueProvider('columns:$key').notifier).set(null);
                  Navigator.pop(c);
                }, child: const Text('Standard columns')),
                FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Done')),
              ],
            );
          }),
        ),
        icon: const Icon(Icons.view_column_outlined, size: 18),
        label: const Text('Columns'),
      );
}

/// C9: stock against the reorder level (twice the reorder level fills it), shaded by its state
class HealthBar extends StatelessWidget {
  const HealthBar({super.key, required this.stock, required this.reorder, this.width = 110});
  final double stock, reorder, width;
  @override
  Widget build(BuildContext context) {
    final s = stock < 0 ? 0.0 : stock;
    final full = reorder > 0 ? reorder * 2 : (s > 1 ? s : 1);
    final k = (s / full).clamp(0.0, 1.0);
    final state = s <= 0 ? 'out' : reorder > 0 && s <= reorder ? 'low' : 'ok';
    final color = state == 'out' ? Theme.of(context).colorScheme.error : state == 'low' ? context.tones.warn : context.tones.ok;
    return Semantics(
      label: 'Stock ${state == 'ok' ? 'good' : state}',
      child: Container(
        key: Key('health-$state'),
        width: width,
        height: 4,
        margin: const EdgeInsets.only(top: 4),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(99)),
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(widthFactor: s > 0 && k < .04 ? .04 : k, child: Container(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)))),
      ),
    );
  }
}

/// C10: on a phone, swipe the row to the left to show its actions; swipe back (or use one) to hide them
class SwipeRow extends StatefulWidget {
  const SwipeRow({super.key, required this.child, required this.actions});
  final Widget child;
  /// (label, icon, run)
  final List<(String, IconData, VoidCallback)> actions;
  @override
  State<SwipeRow> createState() => _SwipeRowState();
}

class _SwipeRowState extends State<SwipeRow> {
  bool _open = false;
  double _dx = 0;
  @override
  Widget build(BuildContext context) {
    if (widget.actions.isEmpty || MediaQuery.sizeOf(context).width >= 600) return widget.child;
    return GestureDetector(
      onHorizontalDragStart: (_) => _dx = 0,
      onHorizontalDragUpdate: (d) => _dx += d.delta.dx,
      onHorizontalDragEnd: (_) {
        if (_dx < -40) setState(() => _open = true);
        if (_dx > 40) setState(() => _open = false);
      },
      child: Stack(children: [
        widget.child,
        if (_open)
          Positioned.fill(
            child: Align(
              alignment: Alignment.centerRight,
              child: Container(
                key: const Key('swipe-actions'),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(gradient: LinearGradient(colors: [Theme.of(context).colorScheme.surface.withValues(alpha: 0), Theme.of(context).colorScheme.surface], stops: const [0, .12])),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const SizedBox(width: 16),
                  for (final (label, icon, run) in widget.actions)
                    Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: FilledButton.tonalIcon(onPressed: () {
                        setState(() => _open = false);
                        run();
                      }, icon: Icon(icon, size: 16), label: Text(label)),
                    ),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

// C8: showAppDialog(side: true) in app_dialog.dart

/// C5: a figure edited in place: tap it, type, Enter saves, Esc cancels
class CellEdit extends StatefulWidget {
  const CellEdit({super.key, required this.text, required this.value, required this.onSave, this.enabled = true, this.label = ''});
  final String text, label;
  final double value;
  final Future<void> Function(double v) onSave;
  final bool enabled;
  @override
  State<CellEdit> createState() => _CellEditState();
}

class _CellEditState extends State<CellEdit> {
  TextEditingController? _c;
  final _f = FocusNode();
  @override
  void dispose() {
    _c?.dispose();
    _f.dispose();
    super.dispose();
  }

  void _save() {
    final v = double.tryParse((_c?.text ?? '').replaceAll(',', '').trim());
    setState(() => _c = null);
    if (v == null || v < 0) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text('Type a number of 0 or more')));
      return;
    }
    if (v != widget.value) widget.onSave(v);
  }

  @override
  Widget build(BuildContext context) {
    if (_c == null) {
      if (!widget.enabled) return Text(widget.text);
      return InkWell(
        onTap: () => setState(() {
          final t = widget.value == widget.value.roundToDouble() ? '${widget.value.round()}' : '${widget.value}';
          _c = TextEditingController(text: t)..selection = TextSelection(baseOffset: 0, extentOffset: t.length);
          WidgetsBinding.instance.addPostFrameCallback((_) => _f.requestFocus());
        }),
        child: Tooltip(
          message: 'Tap to change (Enter saves, Esc cancels)',
          child: Container(
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor, style: BorderStyle.solid))),
            child: Text(widget.text),
          ),
        ),
      );
    }
    return SizedBox(
      width: 96,
      child: Focus(
        onKeyEvent: (_, e) {
          if (e is KeyDownEvent && e.logicalKey == LogicalKeyboardKey.escape) {
            setState(() => _c = null);
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: TextField(
          key: Key('cell-edit-${widget.label}'),
          controller: _c,
          focusNode: _f,
          autofocus: true,
          textAlign: TextAlign.right,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(isDense: true, labelText: widget.label.isEmpty ? null : widget.label, floatingLabelBehavior: FloatingLabelBehavior.never),
          onSubmitted: (_) => _save(),
          onTapOutside: (_) => setState(() => _c = null),
        ),
      ),
    );
  }
}
