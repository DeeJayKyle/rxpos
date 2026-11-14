// A status chip (sync state, queue depth, database health): a dot and a label in the status colour on its soft tint,
// with a faint glow on dark themes (none on OLED black, where light would bleed). The colours are the web app's
// status tokens, AA on their tints in light and dark.
import 'package:flutter/material.dart';

import '../theme/rxpos_theme.dart';

/// 'ok', 'warn', 'error' or 'info' → (text, tint) for this theme
(Color, Color) statusTone(BuildContext context, String status) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  final fg = switch (status) {
    'ok' => dark ? const Color(0xFF34D399) : const Color(0xFF047857),
    'warn' => dark ? const Color(0xFFFB923C) : const Color(0xFFC2410C),
    'error' => dark ? const Color(0xFFFB7185) : const Color(0xFFBE123C),
    _ => Theme.of(context).colorScheme.tertiary,
  };
  return (fg, fg.withValues(alpha: dark ? .16 : .10));
}

class GlowStatusChip extends StatelessWidget {
  const GlowStatusChip({super.key, required this.label, this.status = 'ok', this.icon});
  final String label;
  final String status;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = statusTone(context, status);
    final t = Theme.of(context);
    final glow = t.brightness == Brightness.dark && t.scaffoldBackgroundColor != const Color(0xFF000000);
    return Container(
      constraints: const BoxConstraints(minHeight: 32),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withValues(alpha: .35)),
        boxShadow: glow ? [BoxShadow(color: fg.withValues(alpha: .28), blurRadius: 14, spreadRadius: -4)] : null,
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        icon != null ? Icon(icon, size: 14, color: fg) : Container(width: 7, height: 7, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Flexible(child: Text(label, style: tabular(TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 12.5)), overflow: TextOverflow.ellipsis)),
      ]),
    );
  }
}
