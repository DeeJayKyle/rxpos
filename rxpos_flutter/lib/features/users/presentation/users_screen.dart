import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/people.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/permissions.dart';
import '../../auth/application/session_controller.dart';
import '../../extras/domain/extras.dart' show normalizePhone;
import '../domain/users.dart';

/// Users & Roles (src/pages/Users.jsx): each person signs in with their own account; roles decide what they can see
/// and do. Add / edit, password, disable, reset two-step sign-in, delete; roles with their permissions in groups,
/// copy a role, delete a custom one, reset a built-in one to its defaults. Administrators are managed by the RxPOS
/// provider.
class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key});
  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  String _tab = 'users';

  Future<String> _by() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(tableProvider('users')).value;
    final roleRows = ref.watch(tableProvider('roles')).value ?? const [];
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    final me = ref.watch(sessionControllerProvider).value;
    if (users == null) return const Center(child: CircularProgressIndicator());
    final roles = rolesOf(roleRows.map(Role.fromRecord));
    String roleName(Object? id) => roles.where((r) => r.id == id).firstOrNull?.name ?? '$id';
    bool adminRow(Map<String, Object?> u) => u['role'] == 'admin' && u['id'] != me?.userId;
    final th = Theme.of(context);

    Future<void> edit(Map<String, Object?>? u) async {
      final mine = u != null && u['id'] == me?.userId;
      final v = await editRecord(context, title: u == null ? 'Add user' : 'Edit ${u['name']}', save: u == null ? 'Add user' : 'Save', initial: {...?u, 'role': u?['role'] ?? 'cashier', 'branchId': u?['branchId'] ?? ''}, fields: [
        const FormFieldSpec('name', 'Full name', required: true),
        const FormFieldSpec('email', 'Email – signs in and recovers the password', hint: 'name@example.com'),
        const FormFieldSpec('username', 'Username (optional) – sign in with this and the pharmacy name, no email needed', hint: 'e.g. mary'),
        const FormFieldSpec('phone', 'Phone (SMS recovery)', hint: '07XX XXX XXX'),
        const FormFieldSpec('whatsapp', 'WhatsApp number', hint: 'Same as phone if empty'),
        if (!mine)
          FormFieldSpec('role', 'Role', kind: FieldKind.choice, required: true, options: [for (final r in roles.where((r) => r.id != 'admin' || u?['role'] == 'admin')) (r.id, r.name)]),
        if (branches.length > 1) FormFieldSpec('branchId', 'Home branch', kind: FieldKind.choice, options: [('', 'Any branch'), for (final b in branches) ('${b['id']}', '${b['name']}')]),
        if (u == null) const FormFieldSpec('password', 'Password (8+ characters)', required: true),
      ]);
      if (v == null) return;
      final pw = '${v.remove('password') ?? ''}';
      if ('${v['phone'] ?? ''}'.trim().isNotEmpty && normalizePhone('${v['phone']}').length < 12 && context.mounted) {
        say(context, 'Check the phone number. It should look like 0772 123 456.', error: true);
      }
      try {
        await saveUser(ref.read(recordStoreProvider), {...?u, ...v}, password: pw.isEmpty ? null : pw, others: users, by: await _by(), roleName: roleName(v['role'] ?? u?['role']));
        if (context.mounted) say(context, u == null ? '${v['name']} can now sign in' : 'User saved');
      } on UserProblem catch (e) {
        if (context.mounted) say(context, e.message, error: true);
      }
    }

    Future<void> password(Map<String, Object?> u) async {
      final v = await editRecord(context, title: 'New password for ${u['name']}', save: 'Set password', fields: const [FormFieldSpec('password', 'New password (8+ characters)', required: true)]);
      if (v == null) return;
      try {
        await resetPassword(ref.read(recordStoreProvider), u, '${v['password']}', by: await _by());
        if (context.mounted) say(context, 'Password updated. Tell the user their new password.');
      } on UserProblem catch (e) {
        if (context.mounted) say(context, e.message, error: true);
      }
    }

    Future<void> resetTwoStep(Map<String, Object?> u) async {
      if (!await confirmAction(context, 'Switch off two-step sign-in for ${u['name']}?', 'Only if they lost their phone. They sign in with the password and can set it up again.', 'Switch off')) return;
      try {
        await ref.read(cloudApiProvider).post('/api/2fa/reset', {'uid': u['id']});
        if (context.mounted) say(context, 'Two-step sign-in switched off for ${u['name']}');
      } catch (e) {
        if (context.mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
      }
    }

    Future<void> editRole(Role? r, {bool copy = false}) async {
      final isNew = r == null || copy;
      final chosen = {...?r?.permissions};
      final name = TextEditingController(text: copy ? '${r!.name} (copy)' : r?.name ?? '');
      final maxDisc = TextEditingController(text: r?.raw['maxDiscount'] == null ? '' : '${r!.raw['maxDiscount']}');
      final ok = await showAppDialog<bool>(
        context: context,
        builder: (c) => StatefulBuilder(
          builder: (c, set) => AlertDialog(
            title: Text(isNew ? 'New role' : 'Permissions – ${r.name}'),
            content: SizedBox(
              width: 720,
              child: ListView(shrinkWrap: true, children: [
                TextField(key: const Key('role-name'), controller: name, enabled: isNew || !r.builtIn, decoration: const InputDecoration(labelText: 'Role name', hintText: 'e.g. Store keeper')),
                TextField(key: const Key('role-max-discount'), controller: maxDisc, keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Largest discount this role may give (% of the sale)', hintText: 'empty = no limit')),
                const SizedBox(height: 8),
                Wrap(spacing: 16, runSpacing: 8, children: [
                  for (final (group, list) in permissionGroups)
                    SizedBox(
                      width: 330,
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(group, style: const TextStyle(fontWeight: FontWeight.w700))),
                              TextButton(onPressed: () => set(() {
                                final all = list.every((x) => chosen.contains(x.$1));
                                for (final (k, _) in list) {
                                  all ? chosen.remove(k) : chosen.add(k);
                                }
                              }), child: Text(list.every((x) => chosen.contains(x.$1)) ? 'None' : 'All')),
                            ]),
                            for (final (k, label) in list)
                              CheckboxListTile(dense: true, contentPadding: EdgeInsets.zero, value: chosen.contains(k), title: Text(label),
                                  onChanged: (on) => set(() => on == true ? chosen.add(k) : chosen.remove(k))),
                          ]),
                        ),
                      ),
                    ),
                ]),
              ]),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save role')),
            ],
          ),
        ),
      );
      if (ok != true) return;
      try {
        await saveRole(ref.read(recordStoreProvider), id: isNew ? null : r.id, name: name.text, permissions: [for (final (_, list) in permissionGroups) for (final (k, _) in list) if (chosen.contains(k)) k],
            by: await _by(), existingIds: {for (final x in roles) x.id}, maxDiscount: double.tryParse(maxDisc.text.trim()));
        if (context.mounted) say(context, 'Role saved. It applies on every device after the next sync.');
      } on UserProblem catch (e) {
        if (context.mounted) say(context, e.message, error: true);
      }
    }

    return PageFrame(
      title: 'Users & Roles',
      subtitle: 'Each person signs in with their own account. Roles decide what they can see and do.',
      actions: [
        if (_tab == 'users') FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.person_add_alt), label: const Text('Add user'))
        else FilledButton.icon(onPressed: () => editRole(null), icon: const Icon(Icons.add), label: const Text('New role')),
      ],
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<String>(
            segments: [ButtonSegment(value: 'users', label: Text('Users (${users.length})')), ButtonSegment(value: 'roles', label: Text('Roles & permissions (${roles.length})'))],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _tab == 'users'
              ? ListView(children: [
                  if (users.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No users yet')),
                  for (final u in users)
                    Opacity(
                      opacity: u['disabled'] == true || u['active'] == false ? .55 : 1,
                      child: ListTile(
                        title: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          Text('${u['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          if (u['id'] == me?.userId) const Chip(label: Text('you'), visualDensity: VisualDensity.compact),
                          if (u['twoFactor'] == true) const Chip(label: Text('2-step'), visualDensity: VisualDensity.compact),
                          Chip(label: Text(roleName(u['role'])), visualDensity: VisualDensity.compact),
                        ]),
                        subtitle: Text([
                          u['email'], if ('${u['username'] ?? ''}'.isNotEmpty) '@${u['username']}', u['phone'],
                          if ('${u['whatsapp'] ?? ''}'.isNotEmpty && u['whatsapp'] != u['phone']) 'WA ${u['whatsapp']}',
                          if (branches.length > 1) '${branches.where((b) => b['id'] == u['branchId']).firstOrNull?['name'] ?? 'Any branch'}',
                          u['disabled'] == true || u['active'] == false ? 'Disabled' : 'Active',
                        ].where((x) => x != null && '$x'.isNotEmpty).join(' · ')),
                        trailing: adminRow(u)
                            ? Text('Managed by RxPOS provider', style: th.textTheme.bodySmall)
                            : Wrap(spacing: 2, children: [
                                TextButton(onPressed: () => edit(u), child: const Text('Edit')),
                                TextButton(onPressed: () => password(u), child: const Text('Password')),
                                if (u['id'] != me?.userId)
                                  TextButton(
                                    onPressed: () async => setDisabled(ref.read(recordStoreProvider), u, !(u['disabled'] == true || u['active'] == false), by: await _by()),
                                    child: Text(u['disabled'] == true || u['active'] == false ? 'Enable' : 'Disable'),
                                  ),
                                if (u['twoFactor'] == true && u['id'] != me?.userId) TextButton(onPressed: () => resetTwoStep(u), child: const Text('Reset 2-step')),
                                if (u['id'] != me?.userId)
                                  IconButton(tooltip: 'Delete', icon: Icon(Icons.delete_outline, color: th.colorScheme.error), onPressed: () async {
                                    if (!await confirmAction(context, 'Delete ${u['name']}?', 'They will no longer be able to sign in on any device. Their past sales stay in the records.', 'Delete user')) return;
                                    await deleteUser(ref.read(recordStoreProvider), u, by: await _by());
                                  }),
                              ]),
                      ),
                    ),
                ])
              : ListView(children: [
                  Wrap(spacing: 12, runSpacing: 12, children: [
                    for (final r in roles)
                      SizedBox(
                        width: 320,
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text(r.name, style: th.textTheme.titleMedium)),
                                if (r.builtIn) const Chip(label: Text('built-in'), visualDensity: VisualDensity.compact),
                              ]),
                              Text('${r.id == 'admin' ? 'Everything, always.' : '${r.permissions.length} permissions${r.raw['maxDiscount'] == null ? '' : ' · discounts up to ${r.raw['maxDiscount']}%'}'} · ${users.where((u) => u['role'] == r.id).length} user(s)', style: th.textTheme.bodySmall),
                              Wrap(spacing: 4, children: [
                                if (r.id != 'admin') TextButton(onPressed: () => editRole(r), child: const Text('Edit permissions')),
                                IconButton(tooltip: 'Copy as a new role', icon: const Icon(Icons.copy, size: 18), onPressed: () => editRole(r, copy: true)),
                                if (!r.builtIn)
                                  IconButton(tooltip: 'Delete role', icon: Icon(Icons.delete_outline, color: th.colorScheme.error), onPressed: () async {
                                    if (!await confirmAction(context, 'Delete the ${r.name} role?', 'Nobody has it any more.', 'Delete')) return;
                                    try {
                                      await deleteRole(ref.read(recordStoreProvider), r.id, r.name, users: users, by: await _by());
                                    } on UserProblem catch (e) {
                                      if (context.mounted) say(context, e.message, error: true);
                                    }
                                  }),
                                if (r.builtIn && r.id != 'admin' && roleRows.any((x) => x['id'] == r.id))
                                  TextButton(onPressed: () async {
                                    final d = defaultRoles.firstWhere((x) => x.id == r.id);
                                    await ref.read(recordStoreProvider).update((x) => x.put('roles', {'id': d.id, 'name': d.name, 'builtIn': true, 'permissions': d.permissions}));
                                  }, child: const Text('Reset to default')),
                              ]),
                            ]),
                          ),
                        ),
                      ),
                  ]),
                ]),
        ),
      ]),
    );
  }
}
