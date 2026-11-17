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
