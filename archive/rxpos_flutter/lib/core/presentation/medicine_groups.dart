// Medicines sorted and grouped by name, pharmacological class, therapeutic area, dosage form or shelf (the choice is
// remembered on this device), with group headings that fold away. Used by Inventory, Stock Count and Shelves.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/device_settings.dart';
import '../entities/product.dart';
import '../rules/drug_class.dart';

const medicineOrderKey = 'medicineOrder';

/// The order chosen on this device (name until one is chosen).
MedicineOrder medicineOrderOf(WidgetRef ref) {
  final v = ref.watch(deviceValueProvider(medicineOrderKey)).value;
  return MedicineOrder.values.where((o) => o.name == v).firstOrNull ?? MedicineOrder.name;
}

/// "Sort by: …" for a list of medicines.
class MedicineOrderMenu extends ConsumerWidget {
  const MedicineOrderMenu({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = medicineOrderOf(ref);
    return PopupMenuButton<MedicineOrder>(
      key: const Key('medicine-order'),
      tooltip: 'Sort and group the medicines',
      initialValue: order,
      onSelected: (o) => ref.read(deviceValueProvider(medicineOrderKey).notifier).set(o.name),
      itemBuilder: (_) => [for (final o in MedicineOrder.values) PopupMenuItem(value: o, child: Text(medicineOrderLabels[o]!))],
      child: Chip(
        avatar: const Icon(Icons.sort, size: 18),
        label: Text('Sort by: ${medicineOrderLabels[order]}'),
      ),
    );
  }
}

/// One row of a grouped list: a heading (with how many under it) or a medicine.
sealed class GroupedRow {}

class GroupHeading extends GroupedRow {
  GroupHeading(this.name, this.count, this.folded);
  final String name;
  final int count;
  final bool folded;
}

class GroupedMedicine extends GroupedRow {
  GroupedMedicine(this.p);
  final Product p;
}

/// The rows to show: no headings for [MedicineOrder.name]; the medicines of a [folded] group are left out.
List<GroupedRow> groupedRows(Iterable<Product> list, MedicineOrder order, Set<String> folded) {
  if (order == MedicineOrder.name) return [for (final p in list) GroupedMedicine(p)];
  return [
    for (final (g, ps) in groupMedicines(list, order)) ...[
      GroupHeading(g, ps.length, folded.contains(g)),
      if (!folded.contains(g)) for (final p in ps) GroupedMedicine(p),
    ],
  ];
}

/// A group heading that folds its medicines away when tapped.
class GroupHeadingTile extends StatelessWidget {
  const GroupHeadingTile({super.key, required this.heading, required this.onToggle, this.trailing});
  final GroupHeading heading;
  final VoidCallback onToggle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    final th = Theme.of(context);
    return Material(
      color: th.colorScheme.surfaceContainerHigh,
      child: InkWell(
        key: Key('group-${heading.name}'),
        onTap: onToggle,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(children: [
            AnimatedRotation(turns: heading.folded ? -0.25 : 0, duration: const Duration(milliseconds: 150), child: const Icon(Icons.expand_more, size: 20)),
            const SizedBox(width: 6),
            Expanded(child: Text(heading.name, style: th.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
            ?trailing,
            const SizedBox(width: 8),
            Text('${heading.count}', style: th.textTheme.labelLarge?.copyWith(color: th.colorScheme.onSurfaceVariant)),
          ]),
        ),
      ),
    );
  }
}
