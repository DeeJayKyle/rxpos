// The F-key legend under the till on a computer (the classic app's src/components/FKeyBar.jsx): what each function
// key does on the till, each one clickable. Hidden on this device with × (device value "pos-fkeys" = off); the
// shortcuts sheet (F1 or ?) shows it again.
import 'package:flutter/material.dart';

/// One key of the bar: [go] a page, or [run] an action on the till ('search', 'charge', 'proforma', 'help').
typedef FKey = ({String key, String label, String? go, String? run});

/// The keys, in keyboard order (the Flutter till's own bindings: F8 search, F9 charge, F10 proforma, F1 help).
List<FKey> fkeyItems({required bool Function(String) can, bool wholesale = false}) => [
      if (wholesale && can('pos.sell')) (key: 'F2', label: 'Retail', go: '/pos', run: null),
      if (!wholesale && can('pos.wholesale')) (key: 'F3', label: 'Wholesale', go: '/pos/wholesale', run: null),
      if (can('stock.receive')) (key: 'F4', label: 'Add stock', go: '/add-stock', run: null),
      if (can('sales.view')) (key: 'F6', label: 'Sales', go: '/sales', run: null),
      if (can('inventory.view')) (key: 'F7', label: 'Inventory', go: '/inventory', run: null),
      (key: 'F8', label: 'Search', go: null, run: 'search'),
      (key: 'F9', label: 'Charge', go: null, run: 'charge'),
      (key: 'F10', label: 'Proforma', go: null, run: 'proforma'),
      (key: 'F1', label: 'All keys', go: null, run: 'help'),
    ];

class FKeyBar extends StatelessWidget {
  const FKeyBar({super.key, required this.items, required this.onGo, required this.onRun, required this.onHide});
  final List<FKey> items;
  final void Function(String to) onGo;
  final void Function(String action) onRun;
  final VoidCallback onHide;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Semantics(
      container: true,
      label: 'Function keys',
      child: Container(
        height: 34,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: t.colorScheme.surface, border: Border(top: BorderSide(color: t.dividerColor))),
        child: Row(children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final x in items)
                  Tooltip(
                    message: '${x.label} (${x.key})',
                    child: InkWell(
                      borderRadius: BorderRadius.circular(6),
                      onTap: () => x.go != null ? onGo(x.go!) : onRun(x.run!),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Container(
                            constraints: const BoxConstraints(minWidth: 28),
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(border: Border.all(color: t.colorScheme.outline), borderRadius: BorderRadius.circular(5)),
                            child: Text(x.key, textAlign: TextAlign.center, style: t.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(width: 6),
                          Text(x.label, style: t.textTheme.bodySmall),
                        ]),
                      ),
                    ),
                  ),
              ]),
            ),
          ),
          IconButton(visualDensity: VisualDensity.compact, iconSize: 14, tooltip: 'Hide this bar', onPressed: onHide, icon: const Icon(Icons.close)),
        ]),
      ),
    );
  }
}
