// Users and roles (src/pages/Users.jsx): sign-in by email or username; new users get a password hashed as the React
// app and the cloud expect; custom roles with their permissions.
import '../../../core/data/record_store.dart';
import '../../../core/rules/ids.dart';
import '../../../core/rules/passwords.dart';

class UserProblem implements Exception {
  UserProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Save a user (new when [user] has no id). [password] is required for a new user (8+ characters).
Future<Map<String, Object?>> saveUser(RecordStore store, Map<String, Object?> user, {String? password, required List<Map<String, Object?>> others,
    required String by, required String roleName}) {
  final isNew = user['id'] == null;
  final email = '${user['email'] ?? ''}'.trim().toLowerCase();
  final username = '${user['username'] ?? ''}'.trim().toLowerCase();
  if ('${user['name'] ?? ''}'.trim().isEmpty) throw UserProblem('Type the person\'s name');
  if (email.isEmpty && username.isEmpty) throw UserProblem('Give the person an email or a username to sign in with');
  if (username.isNotEmpty && !RegExp(r'^[a-z0-9._-]{3,30}$').hasMatch(username)) {
    throw UserProblem('A username is 3–30 letters, numbers, dot, dash or underscore (no spaces)');
  }
  if (email.isNotEmpty && others.any((u) => u['email'] == email && u['id'] != user['id'])) throw UserProblem('Another user already has that email');
  if (username.isNotEmpty && others.any((u) => '${u['username'] ?? ''}'.toLowerCase() == username && u['id'] != user['id'])) {
    throw UserProblem('Another user already has that username');
  }
  if (isNew && (password ?? '').length < 8) throw UserProblem('Use a password of at least 8 characters');
  final pw = isNew || (password ?? '').isNotEmpty ? makePassword(password!) : const <String, Object?>{};
  return store.update((d) {
    final rec = d.put('users', {...user, 'id': user['id'] ?? uid(), 'email': email, 'username': username,
      'phone': '${user['phone'] ?? ''}'.trim(), ...pw});
    d.audit(by, isNew ? 'User added' : (pw.isEmpty ? 'User updated' : 'Password reset'), '${rec['name']} ($roleName)');
    return rec;
  });
}

Future<Map<String, Object?>> saveRole(RecordStore store, {String? id, required String name, required List<String> permissions, required String by, required Set<String> existingIds}) {
  final rid = id ?? name.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
  if (name.trim().isEmpty) throw UserProblem('Name the role');
  if (id == null && existingIds.contains(rid)) throw UserProblem('A role with that name exists');
  return store.update((d) {
    final r = d.put('roles', {'id': rid, 'name': name.trim(), 'permissions': permissions});
    d.audit(by, 'Role saved', '${r['name']}: ${permissions.length} permissions');
    return r;
  });
}
