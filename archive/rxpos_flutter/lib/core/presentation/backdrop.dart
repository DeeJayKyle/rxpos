// The backdrop of the gradient looks (Aurora, Holographic, Retrowave, Sunset): the design's gradient with soft glows of
// colour, and the Retrowave horizon grid, painted once behind the app (it never repaints while scrolling or typing),
// with translucent panels above it. Plain when the look has none.
import 'package:flutter/material.dart';

import '../theme/design_tokens.dart';

class AuroraBackground extends StatelessWidget {
  const AuroraBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = tokensOf(context);
    if (!t.hasBackdrop) return child;
    final base = Theme.of(context).scaffoldBackgroundColor;
    RadialGradient glow(Alignment at, Color c, double r) => RadialGradient(center: at, radius: r, colors: [c, c.withValues(alpha: 0)]);
    const spots = [(Alignment(-1.1, -1.2), 1.1), (Alignment(1.2, 1.1), 1.2), (Alignment(1.0, -1.0), .8)];
    Widget layer = const SizedBox.expand();
    for (var i = t.glows.length - 1; i >= 0; i--) {
      final (at, r) = spots[i % spots.length];
      layer = DecoratedBox(decoration: BoxDecoration(gradient: glow(at, t.glows[i], r)), child: layer);
    }
    return Stack(children: [
      Positioned.fill(
        child: RepaintBoundary(
          child: DecoratedBox(
            key: const Key('aurora'),
            decoration: BoxDecoration(
              color: base,
              gradient: t.backdrop.length > 1 ? LinearGradient(colors: t.backdrop, begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
            ),
            child: t.grid == null ? layer : CustomPaint(foregroundPainter: _HorizonGrid(t.grid!), child: layer),
          ),
        ),
      ),
      child,
    ]);
  }
}

/// A synthwave horizon grid over the lower third: lines running to a vanishing point, rows closer together near it.
class _HorizonGrid extends CustomPainter {
  _HorizonGrid(this.color);
  final Color color;
  @override
  void paint(Canvas c, Size s) {
    final top = s.height * .66, mid = s.width / 2;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var i = -12; i <= 12; i++) {
      c.drawLine(Offset(mid + i * s.width / 24, top), Offset(mid + i * s.width / 4, s.height), paint);
    }
    for (var k = 1; k <= 10; k++) {
      final y = top + (s.height - top) * (k * k) / 100;
      c.drawLine(Offset(0, y), Offset(s.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_HorizonGrid o) => o.color != color;
}

/// Whether a backdrop is on (panels then let it show through).
bool auroraOn(BuildContext context) => tokensOf(context).hasBackdrop;
