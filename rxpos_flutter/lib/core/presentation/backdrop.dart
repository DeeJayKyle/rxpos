// The Aurora look's backdrop: the page colour with three soft glows of the theme's colours, painted once behind the
// app (it never repaints while scrolling or typing), with the panels above it translucent. Plain when the look is
// another surface style.
import 'package:flutter/material.dart';

import '../theme/themes.dart';

class AuroraBackground extends StatelessWidget {
  const AuroraBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).extension<Backdrop>();
    if (b == null || !b.on) return child;
    RadialGradient glow(Alignment at, Color c, double r) => RadialGradient(center: at, radius: r, colors: [c, c.withValues(alpha: 0)]);
    return Stack(children: [
      Positioned.fill(
        child: RepaintBoundary(
          child: DecoratedBox(
            key: const Key('aurora'),
            decoration: BoxDecoration(color: b.base),
            child: DecoratedBox(
              decoration: BoxDecoration(gradient: glow(const Alignment(-1.1, -1.2), b.glowA, 1.1)),
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: glow(const Alignment(1.2, 1.1), b.glowB, 1.2)),
                child: DecoratedBox(decoration: BoxDecoration(gradient: glow(const Alignment(1.0, -1.0), b.glowC, .8))),
              ),
            ),
          ),
        ),
      ),
      child,
    ]);
  }
}

/// Whether the Aurora backdrop is on (panels then let it show through).
bool auroraOn(BuildContext context) => Theme.of(context).extension<Backdrop>()?.on ?? false;
