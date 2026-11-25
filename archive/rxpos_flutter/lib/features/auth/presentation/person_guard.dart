// Audit P2-7, option 1 (the owner's decision, 17 Nov 2026; src/App.jsx does the same): on a device that holds another
// person's cloud sign-in token, the person signed in with a PIN, fingerprint or offline password types their own
// password before a call that acts as a person in the cloud. The device then holds their token. Selling and syncing
// never wait for this.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../../../core/presentation/widgets.dart';
import '../application/session_controller.dart';
import '../domain/offline_secrets.dart';

/// Throws when the person does not confirm (the call is then not made).
Future<void> confirmPersonIfBorrowed(BuildContext context, WidgetRef ref) async {
  final s = ref.read(sessionControllerProvider).value;
  final repo = ref.read(authRepositoryProvider);
  if (s == null || !await repo.borrowedToken(s)) return;
  if (!context.mounted) throw const OfflineError('Not done: it needs your own password on this device.');
  final pw = TextEditingController();
  final ok = await showAppDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Confirm it is you'),
      content: SizedBox(
        width: 380,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('This device is still signed in to the cloud as someone else (they signed in last with their password). To do this as ${s.userName}, type your password.'),
          const SizedBox(height: 12),
          TextField(key: const Key('person-guard-password'), controller: pw, obscureText: true, autofocus: true, decoration: const InputDecoration(labelText: 'Your password'),
              onSubmitted: (_) => Navigator.pop(c, true)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Continue')),
      ],
    ),
  );
  final password = pw.text;
  pw.dispose();
  if (ok != true || password.isEmpty) throw const OfflineError('Not done: it needs your own password on this device.');
  final token = await repo.confirmPerson(s, password);
  ref.read(authTokenProvider.notifier).set(token);
  if (context.mounted) say(context, 'Signed in to the cloud as you on this device');
}
