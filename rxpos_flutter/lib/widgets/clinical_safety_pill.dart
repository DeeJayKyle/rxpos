// The live clinical safety pill above the till's cart (core/rules/clinical.dart; the web app's ClinicalSafetyPill):
// green when nothing is found, amber for a caution, red for a major allergy or interaction; tap to see each finding.
// A prompt for the pharmacist, never a block.
import 'package:flutter/material.dart';

import '../core/entities/product.dart';
import '../core/rules/clinical.dart';
import '../theme/rxpos_theme.dart';
import 'glow_status_chip.dart';

class ClinicalSafetyPill extends StatefulWidget {
  const ClinicalSafetyPill({super.key, required this.productIds, required this.products, this.customerName = '', this.allergies = ''});
  final List<String> productIds;
  final List<Product> products;
  final String customerName, allergies;

  @override
  State<ClinicalSafetyPill> createState() => _ClinicalSafetyPillState();
}

class _ClinicalSafetyPillState extends State<ClinicalSafetyPill> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    if (widget.productIds.isEmpty) return const SizedBox.shrink();
    final r = safetyCheck(widget.productIds, widget.products, customerName: widget.customerName, allergies: widget.allergies);
    // all clear: no row here (a clean sale keeps its lines in view); SafetyBadge says so beside the title
    if (r.level == 'ok') return const SizedBox.shrink();
    final (fg, bg) = statusTone(context, r.level == 'major' ? 'error' : r.level == 'caution' ? 'warn' : 'ok');
    final icon = r.level == 'major' ? Icons.gpp_bad_outlined : r.level == 'caution' ? Icons.gpp_maybe_outlined : Icons.verified_user_outlined;
    final head = r.level == 'ok'
        ? 'No allergy or interaction found'
        : '${r.findings.length} safety ${r.findings.length == 1 ? 'check' : 'checks'}: ${r.findings.first.text}';
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14), border: r.level == 'ok' ? null : Border.all(color: fg)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: r.level == 'ok' ? null : () => setState(() => _open = !_open),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: kMinTouch),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(children: [
                  Icon(icon, size: 18, color: fg),
                  const SizedBox(width: 8),
                  Expanded(child: Text(head, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 13))),
                  if (r.level != 'ok') Icon(_open ? Icons.expand_less : Icons.expand_more, color: fg),
                ]),
              ),
            ),
          ),
          if (_open && r.level != 'ok')
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              child: Column(children: [
                for (final f in r.findings)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(top: 6),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Theme.of(context).colorScheme.outlineVariant)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${f.level == 'major' ? 'MAJOR' : 'CAUTION'} · ${f.kind.toUpperCase()}', style: microLabel(context).copyWith(color: statusTone(context, f.level == 'major' ? 'error' : 'warn').$1)),
                      const SizedBox(height: 2),
                      Text(f.text, style: const TextStyle(fontSize: 13)),
                    ]),
                  ),
              ]),
            ),
        ]),
      ),
    );
  }
}

/// All clear: a small badge beside the sale's title
class SafetyBadge extends StatelessWidget {
  const SafetyBadge({super.key, required this.productIds, required this.products, this.customerName = '', this.allergies = ''});
  final List<String> productIds;
  final List<Product> products;
  final String customerName, allergies;

  @override
  Widget build(BuildContext context) {
    if (productIds.isEmpty || safetyCheck(productIds, products, customerName: customerName, allergies: allergies).level != 'ok') return const SizedBox.shrink();
    final (fg, bg) = statusTone(context, 'ok');
    return Tooltip(
      message: 'No allergy or interaction found',
      child: Container(
        margin: const EdgeInsets.only(left: 8),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.verified_user_outlined, size: 13, color: fg),
          const SizedBox(width: 4),
          Text('SAFETY', style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: .5)),
        ]),
      ),
    );
  }
}
