// The "Call" button with a choice (src/calls.jsx CallMenu): an in-app call to a colleague (free, over the internet),
// WhatsApp, or a normal phone call.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../auth/application/session_controller.dart';
import '../../extras/domain/extras.dart';
import '../application/call_controller.dart';

class CallMenu extends ConsumerWidget {
  const CallMenu({super.key, required this.person, this.staff = false, this.compact = false});

  /// The person's record ({id, name, phone, whatsapp}).
  final Map<String, Object?> person;

  /// A colleague (can be called in the app).
  final bool staff;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(sessionControllerProvider).value;
    final name = '${person['name'] ?? ''}';
    final phone = '${person['phone'] ?? ''}'.trim().isNotEmpty ? '${person['phone']}'.trim() : '${person['whatsapp'] ?? ''}'.trim();
    final wa = normalizePhone('${person['whatsapp'] ?? ''}'.trim().isNotEmpty ? '${person['whatsapp']}' : phone);
    final inApp = staff && person['id'] != null && s != null && s.token.startsWith('u.');
    if (!inApp && phone.isEmpty) return const SizedBox.shrink();
    return PopupMenuButton<String>(
      key: Key('call-${person['id'] ?? name}'),
      tooltip: 'Call $name',
      icon: const Icon(Icons.phone_outlined),
      onSelected: (v) => switch (v) {
        'app' => ref.read(callProvider.notifier).start('${person['id']}', name),
        'wa' => launchUrl(Uri.parse(whatsappLink(wa, '')), mode: LaunchMode.externalApplication),
        _ => launchUrl(Uri.parse('tel:${phone.replaceAll(RegExp(r'[^\d+]'), '')}')),
      },
      itemBuilder: (_) => [
        if (inApp) const PopupMenuItem(value: 'app', child: ListTile(leading: Icon(Icons.wifi), title: Text('In-app call'), subtitle: Text('Free, over the internet'))),
        if (wa.length >= 12) const PopupMenuItem(value: 'wa', child: ListTile(leading: Icon(Icons.chat_outlined), title: Text('WhatsApp'), subtitle: Text('Opens the chat; tap the call button'))),
        if (phone.isNotEmpty) PopupMenuItem(value: 'tel', child: ListTile(leading: const Icon(Icons.phone), title: const Text('Phone call'), subtitle: Text(phone))),
      ],
    );
  }
}
