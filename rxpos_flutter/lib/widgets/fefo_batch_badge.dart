// The FEFO expiry traffic light of a batch (core/rules/fefo.dart expiryLevel; the web app's FefoPill): green more
// than 6 months away, amber 3–6 months, stronger amber under 3 months, red when expired (blocked from sale).
import 'package:flutter/material.dart';

import '../core/rules/fefo.dart';
import '../theme/rxpos_theme.dart';
import 'glow_status_chip.dart';

class FefoBatchBadge extends StatelessWidget {
  const FefoBatchBadge({super.key, required this.expiry, this.batch = '', this.warnDays = 90, this.today});
  final String expiry, batch;
  /// the pharmacy's expiry warning (days): inside it the badge counts the days left
  final int warnDays;
  final DateTime? today;

  @override
  Widget build(BuildContext context) {
    final level = expiryLevel(expiry, today: today);
    if (level.isEmpty) return const SizedBox.shrink();
    final (fg, bg) = statusTone(context, level == 'ok' ? 'ok' : level == 'expired' ? 'error' : 'warn');
    final e = DateTime.parse(expiry);
    final t = today ?? DateTime.now();
    final days = DateTime.utc(e.year, e.month, e.day).difference(DateTime.utc(t.year, t.month, t.day)).inDays;
    final when = level == 'expired' ? 'Expired · blocked' : days <= warnDays ? 'Exp ${days}d' : 'Exp ${expiry.substring(5, 7)}/${expiry.substring(2, 4)}';
    return Semantics(
      label: level == 'expired' ? 'Expired $expiry, not sold' : 'Expires $expiry',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999), border: level == 'short' || level == 'expired' ? Border.all(color: fg) : null),
        child: Text(batch.isEmpty ? when : '$batch · $when', style: tabular(TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: .2))),
      ),
    );
  }
}
