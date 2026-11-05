import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/people.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/permissions.dart';
import '../../auth/application/session_controller.dart';
import '../domain/users.dart';

/// Users & roles: who can sign in, with which role; reset a password; custom roles and their permissions.
class UsersScreen extends ConsumerWidget {
  const UsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(tableProvider('users')).value;
    final roleRows = ref.watch(tableProvider('roles')).value ?? const [];
    final branches = ref.watch(tableProvider('branches')).value ?? const [];
    if (users == null) return const Center(child: CircularProgressIndicator());
    final roles = rolesOf(roleRows.map(Role.fromRecord));
    String roleName(Object? id) => roles.where((r) => r.id == id).firstOrNull?.name ?? '$id';
    Future<String> by() async => (await ref.read(sessionControllerProvider.future))?.userName ?? '';

    Future<void> edit(Map<String, Object?>? u) async {
      final v = await editRecord(context, title: u == null ? 'New user' : 'Edit ${u['name']}', initial: {...?u, 'role': u?['role'] ?? 'cashier', 'active': u?['active'] ?? true}, fields: [
        const FormFieldSpec('name', 'Name', required: true),
        const FormFieldSpec('email', 'Email'),
        const FormFieldSpec('username', 'Username (instead of an email)'),
        const FormFieldSpec('phone', 'Phone'),
        FormFieldSpec('role', 'Role', kind: FieldKind.choice, required: true, options: [for (final r in roles) (r.id, r.name)]),
        FormFieldSpec('branchId', 'Branch', kind: FieldKind.choice, options: [for (final b in branches) ('${b['id']}', '${b['name']}')]),
        const FormFieldSpec('active', 'Can sign in', kind: FieldKind.flag),
        FormFieldSpec('password', u == null ? 'Password (8+ characters)' : 'New password (leave empty to keep it)'),
      ]);
      if (v == null) return;
      final pw = '${v.remove('password') ?? ''}';
      try {
        await saveUser(ref.read(recordStoreProvider), {...?u, ...v}, password: pw.isEmpty ? null : pw, others: users, by: await by(), roleName: roleName(v['role']));
        if (context.mounted) say(context, u == null ? '${v['name']} can now sign in' : 'User saved');
      } on UserProblem catch (e) {
        if (context.mounted) say(context, e.message, error: true);
      }
    }

    Future<void> editRole(Role? r) async {
      final chosen = {...?r?.permissions};
      final name = TextEditingController(text: r?.name ?? '');
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => StatefulBuilder(
          builder: (c, set) => AlertDialog(
            title: Text(r == null ? 'New role' : 'Role: ${r.name}'),
            content: SizedBox(
              width: 420,
              child: ListView(shrinkWrap: true, children: [
                TextField(controller: name, enabled: r == null, decoration: const InputDecoration(labelText: 'Name')),
                for (final p in allPermissions)
                  CheckboxListTile(dense: true, value: chosen.contains(p), title: Text(p),
                      onChanged: r?.id == 'admin' ? null : (v) => set(() => v == true ? chosen.add(p) : chosen.remove(p))),
              ]),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
              FilledButton(onPressed: r?.id == 'admin' ? null : () => Navigator.pop(c, true), child: const Text('Save role')),
            ],
          ),
        ),
      );
      if (ok != true) return;
      try {
        await saveRole(ref.read(recordStoreProvider), id: r?.id, name: name.text, permissions: chosen.toList(), by: await by(), existingIds: {for (final x in roles) x.id});
      } on UserProblem catch (e) {
        if (context.mounted) say(context, e.message, error: true);
      }
    }

    final list = [...users]..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    return PageFrame(
      title: 'Users & roles',
      actions: [
        OutlinedButton.icon(onPressed: () => editRole(null), icon: const Icon(Icons.badge_outlined), label: const Text('New role')),
        FilledButton.icon(onPressed: () => edit(null), icon: const Icon(Icons.person_add_alt), label: const Text('Add user')),
      ],
      scroll: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final u in list)
          ListTile(
            leading: CircleAvatar(child: Text('${u['name']}'.isEmpty ? '?' : '${u['name']}'[0])),
            title: Text('${u['name']}${u['active'] == false ? ' (cannot sign in)' : ''}'),
            subtitle: Text('${roleName(u['role'])} · ${[u['email'], u['username']].where((x) => x != null && '$x'.isNotEmpty).join(' · ')}'),
            onTap: () => edit(u),
          ),
        const Divider(),
        Text('Roles', style: Theme.of(context).textTheme.titleMedium),
        for (final r in roles) ListTile(dense: true, title: Text(r.name), subtitle: Text('${r.id == 'admin' ? 'everything' : '${r.permissions.length} permissions'}${r.builtIn ? ' · built in' : ''}'), onTap: () => editRole(r)),
      ]),
    );
  }
}
