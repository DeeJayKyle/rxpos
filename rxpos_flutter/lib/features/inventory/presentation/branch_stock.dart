// G4 (1.13; src/components/BranchStock.jsx): a medicine's stock in each branch, from the balances every device keeps
// per branch (core/rules/stock.dart StockIndex); on the medicine and on an out-of-stock till tile.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/product.dart';
import '../../../core/presentation/app_dialog.dart';
import '../../../core/rules/money.dart';
import '../../../core/rules/stock.dart';

/// (branch id, name, qty, here) for every branch, this one first, then the most stock.
List<({String id, String name, double qty, bool here})> branchStocks(StockIndex index, List<Map<String, Object?>> branches, String productId, String here) {
  final rows = [for (final b in branches) (id: '${b['id']}', name: '${b['name'] ?? b['id']}', qty: index.ofProduct('${b['id']}', productId), here: b['id'] == here)];
  rows.sort((a, b) => a.here != b.here ? (a.here ? -1 : 1) : b.qty.compareTo(a.qty));
  return rows;
}

/// "Other branches": shown only when the pharmacy has more than one branch.
class BranchStockButton extends ConsumerWidget {
  const BranchStockButton({super.key, required this.product, this.label = true});
  final Product product;
  final bool label;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    if (branches.length < 2) return const SizedBox.shrink();
    void open() {
      final index = ref.read(stockIndexProvider).value;
      final here = ref.read(pharmacyProvider).value?.branch ?? 'main';
      if (index == null) return;
      final rows = branchStocks(index, branches, product.id, here);
      showAppDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          key: const Key('branch-stock'),
          title: Text(product.name),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final r in rows)
              ListTile(
                key: Key('branch-${r.id}'),
                dense: true,
                title: Text('${r.name}${r.here ? ' (here)' : ''}', style: TextStyle(fontWeight: r.here ? FontWeight.w700 : null)),
                trailing: Text(r.qty > 0 ? formatQty(r.qty) : 'none', style: TextStyle(fontWeight: FontWeight.w700, color: r.qty > 0 ? null : Theme.of(c).hintColor)),
              ),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
        ),
      );
    }

    return label
        ? TextButton.icon(key: Key('branches-${product.id}'), onPressed: open, icon: const Icon(Icons.store_mall_directory_outlined, size: 16), label: const Text('Other branches'))
        // compact, for a till tile (its height is fixed)
        : Tooltip(
            message: 'Stock in each branch',
            child: InkWell(key: Key('branches-${product.id}'), onTap: open, borderRadius: BorderRadius.circular(8), child: const Padding(padding: EdgeInsets.all(3), child: Icon(Icons.store_mall_directory_outlined, size: 16))),
          );
  }
}
