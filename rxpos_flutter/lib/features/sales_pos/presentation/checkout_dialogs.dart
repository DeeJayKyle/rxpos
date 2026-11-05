import 'package:flutter/material.dart';

import '../domain/cart.dart';

/// Yes / no question; true when confirmed.
Future<bool> confirm(BuildContext context, String title, String message, String yes) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(title: Text(title), content: Text(message), actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(yes)),
      ]),
    ) ??
    false;

/// A number (price, discount): null when cancelled.
Future<double?> askNumber(BuildContext context, String label, double initial) {
  final ctl = TextEditingController(text: initial == 0 ? '' : (initial == initial.roundToDouble() ? '${initial.toInt()}' : '$initial'));
  return showDialog<double>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(label),
      content: TextField(controller: ctl, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onSubmitted: (v) => Navigator.pop(c, double.tryParse(v.replaceAll(',', '')) ?? 0)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(c, double.tryParse(ctl.text.replaceAll(',', '')) ?? 0), child: const Text('OK')),
      ],
    ),
  );
}

/// The controlled-drugs register entry for this sale (patient, prescriber, prescription).
Future<ControlledEntry?> askControlled(BuildContext context, {String patient = ''}) {
  final f = [TextEditingController(text: patient), TextEditingController(), TextEditingController(), TextEditingController(), TextEditingController()];
  const labels = ['Patient\'s name', 'Patient ID / phone', 'Prescriber', 'Prescriber registration no.', 'Prescription no.'];
  return showDialog<ControlledEntry>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, set) => AlertDialog(
        title: const Text('Controlled drugs register'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (var i = 0; i < 5; i++) TextField(controller: f[i], decoration: InputDecoration(labelText: labels[i]), autofocus: i == 0, onChanged: (_) => set(() {})),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(
            onPressed: f[0].text.trim().isEmpty || f[2].text.trim().isEmpty
                ? null
                : () => Navigator.pop(c, ControlledEntry(patient: f[0].text.trim(), idNo: f[1].text.trim(), prescriber: f[2].text.trim(),
                    prescriberReg: f[3].text.trim(), rxNo: f[4].text.trim())),
            child: const Text('Record'),
          ),
        ],
      ),
    ),
  );
}

/// The customer paid by Mobile Money to the pharmacy's number: the transaction ID from their message.
Future<String?> askMomoRef(BuildContext context, String amount) {
  final ctl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text('Mobile Money – $amount'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Ask the customer to pay to your merchant number, then type the transaction ID from their SMS. The receipt shows it as recorded by staff.'),
        TextField(controller: ctl, autofocus: true, decoration: const InputDecoration(labelText: 'Transaction ID')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
        FilledButton(onPressed: () => ctl.text.trim().isEmpty ? null : Navigator.pop(c, ctl.text.trim()), child: const Text('Record payment')),
      ],
    ),
  );
}

/// A new client: name, phone, allergies (a customers record).
Future<Map<String, Object?>?> askNewClient(BuildContext context) {
  final name = TextEditingController(), phone = TextEditingController(), allergies = TextEditingController();
  return showDialog<Map<String, Object?>>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('New client'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: name, autofocus: true, decoration: const InputDecoration(labelText: 'Name')),
        TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
        TextField(controller: allergies, decoration: const InputDecoration(labelText: 'Allergies (optional)')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
        FilledButton(
          onPressed: () => name.text.trim().isEmpty ? null : Navigator.pop(c, {'name': name.text.trim(), 'phone': phone.text.trim(), 'allergies': allergies.text.trim()}),
          child: const Text('Add client'),
        ),
      ],
    ),
  );
}
