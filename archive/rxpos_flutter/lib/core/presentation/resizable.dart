// Panels the person sizes by dragging, remembered on this device: a side-by-side split (the till's medicines | sale)
// and a section whose height is dragged (the till's payment area), which also folds down to a compact strip.
// Double-click (or double-tap) a handle to go back to the standard size.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';

double? _stored(WidgetRef ref, String key) => double.tryParse(ref.watch(deviceValueProvider(key)).value ?? '');

/// [left] fills the room; [right] has the width dragged on the handle between them ([initial] until it is dragged),
/// kept between [min] and the room left after [leftMin].
class ResizableSplit extends ConsumerStatefulWidget {
  const ResizableSplit({super.key, required this.storeKey, required this.left, required this.right, this.initial = 460, this.min = 340, this.leftMin = 360});
  final String storeKey;
  final Widget left, right;
  final double initial, min, leftMin;
  @override
  ConsumerState<ResizableSplit> createState() => _ResizableSplitState();
}

class _ResizableSplitState extends ConsumerState<ResizableSplit> {
  double? _drag; // the width while dragging (saved when the drag ends)

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (_, box) {
      final maxW = (box.maxWidth - widget.leftMin).clamp(widget.min, double.infinity);
      final w = (_drag ?? _stored(ref, widget.storeKey) ?? widget.initial).clamp(widget.min, maxW);
      return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: widget.left),
        DragHandle(
          key: Key('split-${widget.storeKey}'),
          axis: Axis.horizontal,
          tooltip: 'Drag to resize · double-click for the standard size',
          onDrag: (dx) => setState(() => _drag = ((_drag ?? w) - dx).clamp(widget.min, maxW)),
          onEnd: () {
            if (_drag != null) ref.read(deviceValueProvider(widget.storeKey).notifier).set(_drag!.round().toString());
            setState(() => _drag = null);
          },
          onReset: () => ref.read(deviceValueProvider(widget.storeKey).notifier).set(null),
        ),
        SizedBox(width: w, child: widget.right),
      ]);
    });
  }
}

/// A section at the bottom of a column whose height is dragged on the handle above it (its natural height until then),
/// and which folds down to [compact] with the chevron.
class ResizableSection extends ConsumerStatefulWidget {
  const ResizableSection({super.key, required this.storeKey, required this.children, required this.compact, this.min = 110, this.label = ''});
  final String storeKey, label;
  final List<Widget> children;
  final Widget compact;
  final double min;
  @override
  ConsumerState<ResizableSection> createState() => _ResizableSectionState();
}

class _ResizableSectionState extends ConsumerState<ResizableSection> {
  double? _drag;
  final _natural = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final folded = ref.watch(deviceValueProvider('${widget.storeKey}-fold')).value == '1';
    final stored = _stored(ref, widget.storeKey);
    final maxH = MediaQuery.sizeOf(context).height * .7;
    final h = _drag ?? stored;
    final th = Theme.of(context);
    final body = Column(key: _natural, crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: widget.children);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Row(children: [
        Expanded(
          child: folded
              ? const SizedBox(height: 16)
              : DragHandle(
                  key: Key('section-${widget.storeKey}'),
                  axis: Axis.vertical,
                  tooltip: 'Drag to resize ${widget.label} · double-click for its full size',
                  onDrag: (dy) => setState(() {
                    final now = _drag ?? stored ?? (_natural.currentContext?.size?.height ?? 300);
                    _drag = (now - dy).clamp(widget.min, maxH);
                  }),
                  onEnd: () {
                    if (_drag != null) ref.read(deviceValueProvider(widget.storeKey).notifier).set(_drag!.round().toString());
                    setState(() => _drag = null);
                  },
                  onReset: () => ref.read(deviceValueProvider(widget.storeKey).notifier).set(null),
                ),
        ),
        IconButton(
          key: Key('fold-${widget.storeKey}'),
          tooltip: folded ? 'Show the whole ${widget.label}' : 'Fold the ${widget.label} away',
          visualDensity: VisualDensity.compact,
          iconSize: 20,
          icon: AnimatedRotation(turns: folded ? .5 : 0, duration: const Duration(milliseconds: 180), child: const Icon(Icons.keyboard_arrow_down)),
          onPressed: () => ref.read(deviceValueProvider('${widget.storeKey}-fold').notifier).set(folded ? null : '1'),
        ),
      ]),
      AnimatedSize(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        alignment: Alignment.topCenter,
        child: folded
            ? widget.compact
            : h == null
                ? body
                : SizedBox(height: h, child: Scrollbar(child: SingleChildScrollView(child: body))),
      ),
      if (!folded && h != null) Divider(height: 1, color: th.dividerColor.withValues(alpha: .3)),
    ]);
  }
}

/// The grip between two panels: drag it, double-click it to reset. [axis] horizontal: a vertical bar dragged sideways.
class DragHandle extends StatefulWidget {
  const DragHandle({super.key, required this.axis, required this.onDrag, required this.onEnd, required this.onReset, this.tooltip = ''});
  final Axis axis;
  final ValueChanged<double> onDrag;
  final VoidCallback onEnd, onReset;
  final String tooltip;
  @override
  State<DragHandle> createState() => _DragHandleState();
}

class _DragHandleState extends State<DragHandle> {
  bool _hot = false;
  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    final across = widget.axis == Axis.horizontal;
    final grip = AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: across ? 4 : 44,
      height: across ? 44 : 4,
      decoration: BoxDecoration(
        color: _hot ? th.colorScheme.primary : th.colorScheme.outlineVariant,
        borderRadius: BorderRadius.circular(4),
      ),
    );
    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 700),
      child: MouseRegion(
        cursor: across ? SystemMouseCursors.resizeColumn : SystemMouseCursors.resizeRow,
        onEnter: (_) => setState(() => _hot = true),
        onExit: (_) => setState(() => _hot = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onDoubleTap: widget.onReset,
          onHorizontalDragUpdate: across ? (d) => widget.onDrag(d.delta.dx) : null,
          onHorizontalDragEnd: across ? (_) => widget.onEnd() : null,
          onVerticalDragUpdate: across ? null : (d) => widget.onDrag(d.delta.dy),
          onVerticalDragEnd: across ? null : (_) => widget.onEnd(),
          child: SizedBox(width: across ? 12 : null, height: across ? null : 16, child: Center(child: grip)),
        ),
      ),
    );
  }
}
