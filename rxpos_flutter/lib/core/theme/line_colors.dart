// Colourful Add Stock (1.10, src/linecolors.js): each delivery line its own colour (stripe, numbered badge, light
// tint), each column heading its own colour band. The colour belongs to the line (`hue` kept on it), not its place.
import 'package:flutter/material.dart';

/// teal, blue, violet, pink, orange, amber, green, cyan: white numbers read on all of them
const lineColors = [Color(0xFF0F766E), Color(0xFF1D4ED8), Color(0xFF6D28D9), Color(0xFFBE185D), Color(0xFFC2410C), Color(0xFFA16207), Color(0xFF15803D), Color(0xFF0E7490)];
const columnColors = {'medicine': Color(0xFF0F766E), 'qty': Color(0xFF1D4ED8), 'cost': Color(0xFF6D28D9), 'total': Color(0xFFBE185D), 'price': Color(0xFFC2410C), 'batch': Color(0xFFA16207), 'expiry': Color(0xFF15803D)};

Color lineColor(Object? hue, int index) {
  final i = hue is num ? hue.toInt() : int.tryParse('${hue ?? ''}') ?? index;
  return lineColors[((i % lineColors.length) + lineColors.length) % lineColors.length];
}

/// [c] mixed into [surface] at [pct] percent (as CSS color-mix), so every theme keeps its text readable
Color tint(Color c, Color surface, double pct) => Color.alphaBlend(c.withValues(alpha: pct / 100), surface);

int _next = 0;
/// The next colour for a new line, one after another
int nextHue() => _next++ % lineColors.length;

/// Every list in colour (as the classic app's pages): row [index] gets its line colour as a stripe down its left edge
/// and a light tint (a card or tile in the row is tinted too). Colours rotate by position.
class Hued extends StatelessWidget {
  const Hued({super.key, required this.index, required this.child});
  final int index;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context), c = lineColor(null, index), surface = th.colorScheme.surface, bg = tint(c, surface, 7);
    return Theme(
      data: th.copyWith(
        cardTheme: th.cardTheme.copyWith(color: bg, surfaceTintColor: Colors.transparent),
      ),
      // a Material (not a coloured box), so a tile's ink splash still shows on the tint
      child: Material(color: bg, shape: Border(left: BorderSide(color: c, width: 4)), child: child),
    );
  }
}

/// An item builder whose rows are [Hued]: `itemBuilder: hued((_, i) => …)`
IndexedWidgetBuilder hued(IndexedWidgetBuilder build) => (context, i) => Hued(index: i, child: build(context, i));

/// A column of a [ColourTable]: its heading, its share of the width, and whether it holds figures (right-aligned).
class ColourCol {
  const ColourCol(this.title, {this.flex = 1, this.numeric = false});
  final String title;
  final int flex;
  final bool numeric;
}

/// The column headings of a table as the React app draws them on a computer (src/styles/pagecolors.css): each heading
/// its own colour, a band of it (16%) under a 3 px line of it.
class ColourTableHead extends StatelessWidget {
  const ColourTableHead({super.key, required this.columns, this.trailing = 0});
  final List<ColourCol> columns;
  /// room kept at the right for the rows' buttons
  final double trailing;
  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context), surface = th.colorScheme.surface;
    return SizedBox(height: 38 * MediaQuery.textScalerOf(context).scale(1), child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(width: 4),
      for (final (i, c) in columns.indexed)
        Expanded(
          flex: c.flex,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: c.numeric ? Alignment.centerRight : Alignment.centerLeft,
            decoration: BoxDecoration(color: tint(lineColor(null, i), surface, 16), border: Border(top: BorderSide(color: lineColor(null, i), width: 3))),
            child: Text(c.title.toUpperCase(), textAlign: c.numeric ? TextAlign.right : TextAlign.left, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: th.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: .7, color: th.colorScheme.onSurface)),
          ),
        ),
      if (trailing > 0) Container(width: trailing, color: tint(lineColor(null, columns.length), surface, 16), foregroundDecoration: BoxDecoration(border: Border(top: BorderSide(color: lineColor(null, columns.length), width: 3)))),
    ]));
  }
}

/// A row of a [ColourTableHead]'s table: the cells in the same shares of the width (put it in [Hued] for the row's colour).
class ColourTableRow extends StatelessWidget {
  const ColourTableRow({super.key, required this.columns, required this.cells, this.trailing, this.trailingWidth = 0, this.onTap});
  final List<ColourCol> columns;
  final List<Widget> cells;
  final Widget? trailing;
  final double trailingWidth;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Row(children: [
            for (final (i, c) in columns.indexed)
              Expanded(
                flex: c.flex,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Align(alignment: c.numeric ? Alignment.centerRight : Alignment.centerLeft, child: i < cells.length ? cells[i] : const SizedBox()),
                ),
              ),
            if (trailingWidth > 0) SizedBox(width: trailingWidth, child: Center(child: trailing)),
          ]),
        ),
      );
}

/// A status pill with a dot (src/styles.css .status-pill): In stock, Low stock, Expiring soon…
class StatusPill extends StatelessWidget {
  const StatusPill(this.text, {super.key, required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final surface = Theme.of(context).colorScheme.surface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: tint(color, surface, 14), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Flexible(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color))),
      ]),
    );
  }
}
