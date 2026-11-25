// The shift questions (the owner's rules, 2026-11-20; src/App.jsx and src/pages/Shifts.jsx):
//  - on signing in, someone who works shifts and has none open here is asked whether to start one;
//  - on signing out, someone who started a shift is asked whether to end it (counting the cash);
//  - the owner sees past sales made outside any shift and may turn them into shifts, only once approved.
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/sale.dart';
import '../../../core/entities/settings.dart';
import '../../../core/entities/shift.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/stock.dart' show mainBranch;
import '../../auth/application/session_controller.dart';
import '../domain/shifts.dart';
import 'shifts_screen.dart' show closeShiftFlow;

/// Ask the questions? Always for people; widget tests only when a test switches them on (so the other tests aren't
/// stopped by a question on every sign-in).
bool shiftQuestions = kIsWeb || !Platform.environment.containsKey('FLUTTER_TEST');

/// The people already asked since they signed in on this device (asked once per sign-in)
final _asked = <String>{};

/// This person's open shift at [branch] (or null)
Shift? openShiftOf(Iterable<Map<String, Object?>> rows, String userId, String branch) => rows.map(Shift.fromRecord)
    .where((s) => s.userId == userId && s.isOpen && (s.branchId.isEmpty ? mainBranch : s.branchId) == branch).firstOrNull;

/// Around the signed-in app: asks "Start your shift?" once after signing in.
class ShiftOnSignIn extends ConsumerStatefulWidget {
  const ShiftOnSignIn({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<ShiftOnSignIn> createState() => _ShiftOnSignInState();
}

class _ShiftOnSignInState extends ConsumerState<ShiftOnSignIn> {
  @override
  void initState() {
    super.initState();
    if (shiftQuestions) WidgetsBinding.instance.addPostFrameCallback((_) => Future<void>.delayed(const Duration(milliseconds: 800), _ask));
  }

  Future<void> _ask() async {
    if (!mounted || !shiftQuestions) return;
    final session = ref.read(sessionControllerProvider).value;
    if (session == null || _asked.contains(session.userId)) return;
    final can = await ref.read(permissionsProvider.future);
    final d = await ref.read(pharmacyProvider.future);
    if (!can.contains('shifts') || d.features['shifts'] == false) return;
    final rows = await ref.read(recordStoreProvider).rows('shifts');
    _asked.add(session.userId);
    if (openShiftOf(rows, session.userId, d.branch) != null || !mounted) return;
    final v = await editRecord(context, title: 'Start your shift?', save: 'Start shift',
        note: 'Your sales are then counted in your shift. Type the cash already in the drawer (the float), or leave it empty for none. Cancel: not now.',
        fields: const [FormFieldSpec('float', 'Opening float (cash in the drawer)', kind: FieldKind.number)]);
    if (v == null) return;
    await openShift(ref.read(recordStoreProvider), userId: session.userId, user: session.userName, float: ((v['float'] as num?) ?? 0).toDouble(), branchId: d.branch);
    if (mounted) say(context, 'Shift started');
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Before signing out: someone with a shift open is asked whether to end it. True: go on signing out (the shift was
/// closed, or kept open); false: stay signed in (the cash count was cancelled).
Future<bool> endShiftBeforeSignOut(BuildContext context, WidgetRef ref) async {
  final session = ref.read(sessionControllerProvider).value;
  if (session == null || !shiftQuestions) return true;
  final d = await ref.read(pharmacyProvider.future);
  final open = openShiftOf(await ref.read(recordStoreProvider).rows('shifts'), session.userId, d.branch);
  if (open == null || !context.mounted) return true;
  final end = await confirmAction(context, 'End your shift?',
      'You started a shift at ${open.openedAt.length >= 16 ? DateTime.parse(open.openedAt).toLocal().toString().substring(11, 16) : open.openedAt}. Ending it means counting the cash in the drawer now. Cancel: sign out and leave it open for later.',
      'End shift and count cash');
  if (!end || !context.mounted) return true;
  final sales = (await ref.read(recordStoreProvider).rows('sales')).map(Sale.fromRecord).toList();
  final st = ref.read(settingsProvider).value ?? const PharmacySettings();
  if (!context.mounted) return false;
  return closeShiftFlow(context, ref, open, sales, st);
}

/// Forget who was asked (on signing out), so the next sign-in asks again.
void forgetShiftQuestion(String userId) => _asked.remove(userId);

/// The owner's card on Shifts: past sales made outside any shift, turned into shifts once approved.
class PastSalesShifts extends ConsumerWidget {
  const PastSalesShifts({super.key, required this.sales, required this.shifts, required this.approvedBy});
  final List<Sale> sales;
  final List<Shift> shifts;
  final String approvedBy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(tableProvider('users')).value ?? const [];
    final plan = shiftsFromSales(sales, shifts, {for (final u in users) '${u['name'] ?? ''}'.trim().toLowerCase(): '${u['id']}'});
    if (plan.isEmpty) return const SizedBox.shrink();
    final st = ref.watch(settingsProvider).value ?? const PharmacySettings();
    final n = plan.fold<int>(0, (a, g) => a + g.sales), people = plan.map((g) => g.user).toSet().length;
    return Card(
      key: const Key('shift-backfill'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$n past sale${n == 1 ? '' : 's'} made outside any shift (${plan.length} day${plan.length == 1 ? '' : 's'} of work by $people ${people == 1 ? 'person' : 'people'}). Nothing changes until you approve.'),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('shift-backfill-review'),
            onPressed: () async {
              final ok = await showAppDialog<bool>(
                context: context,
                builder: (c) => AlertDialog(
                  title: const Text('Past sales → shifts (needs your approval)'),
                  content: SizedBox(
                    width: 520,
                    child: ListView(shrinkWrap: true, children: [
                      const Text('One shift per person, branch and day, from their first sale to their last. No float and no cash count, so they never show as balanced or short. Sales are not changed.'),
                      const SizedBox(height: 8),
                      for (final g in plan) ListTile(dense: true, title: Text('${g.day} · ${g.user}'), subtitle: Text('${g.sales} sale${g.sales == 1 ? '' : 's'} · ${st.money(g.total)}')),
                    ]),
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not now')),
                    FilledButton(key: const Key('shift-backfill-approve'), onPressed: () => Navigator.pop(c, true), child: Text('Approve and create ${plan.length} shift${plan.length == 1 ? '' : 's'}')),
                  ],
                ),
              );
              if (ok != true) return;
              await createRebuiltShifts(ref.read(recordStoreProvider), plan, sales, approvedBy: approvedBy);
              if (context.mounted) say(context, '${plan.length} shift${plan.length == 1 ? '' : 's'} created from past sales');
            },
            child: const Text('Review and turn into shifts'),
          ),
        ]),
      ),
    );
  }
}
