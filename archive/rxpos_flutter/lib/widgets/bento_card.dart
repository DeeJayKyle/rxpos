// Bento grid cards (lib/theme/rxpos_theme.dart; the web app's .bento-card): 18 px corners, a 1 px hairline, no heavy
// chrome; a micro label over a large figure or any content. BentoGrid lays cards out asymmetrically by width: one
// column on a phone, two on a tablet, three or four on a wide counter screen, a card spanning as many as it asks.
import 'package:flutter/material.dart';

import '../theme/rxpos_theme.dart';

class BentoCard extends StatelessWidget {
  const BentoCard({super.key, this.label, this.title, this.icon, this.trailing, required this.child, this.onTap, this.padding = const EdgeInsets.all(16), this.span = 1});
  /// the uppercase micro label (11 px, 0.06 em)
  final String? label;
  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  /// columns this card takes in a [BentoGrid] (capped by the grid's columns)
  final int span;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(kBentoRadius), side: BorderSide(color: t.colorScheme.outlineVariant));
    return Material(
      color: t.cardTheme.color ?? t.colorScheme.surface,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            if (label != null || title != null || trailing != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(children: [
                  if (icon != null) ...[Icon(icon, size: 18, color: t.colorScheme.tertiary), const SizedBox(width: 8)],
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (label != null) Text(label!.toUpperCase(), style: microLabel(context)),
                      if (title != null) Text(title!, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    ]),
                  ),
                  ?trailing,
                ]),
              ),
            child,
          ]),
        ),
      ),
    );
  }
}

/// Cards in an asymmetric bento grid: as many columns as the width allows, each card as wide as its [BentoCard.span].
class BentoGrid extends StatelessWidget {
  const BentoGrid({super.key, required this.children, this.gap = kBentoGap, this.minColumn = 300});
  final List<Widget> children;
  final double gap, minColumn;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        final cols = (c.maxWidth / minColumn).floor().clamp(1, 4);
        final unit = (c.maxWidth - gap * (cols - 1)) / cols;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (final w in children)
            SizedBox(width: () {
              final span = (w is BentoCard ? w.span : 1).clamp(1, cols);
              return unit * span + gap * (span - 1);
            }(), child: w),
        ]);
      });
}
