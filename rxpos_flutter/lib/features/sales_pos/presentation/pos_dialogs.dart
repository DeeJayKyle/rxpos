// The till's dialogs ported from src/pages/POS.jsx: Mobile Money request to the customer's phone, the directions
// (drug label) for a line, the reason for selling expired stock, drug information and the keyboard shortcuts.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../drug_info/presentation/drug_info_screen.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/entities/product.dart';
import '../../../core/entities/settings.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/money.dart';
import '../../extras/domain/extras.dart';
import '../domain/cart.dart';

/// How a Mobile Money sale was paid: confirmed by the network ([momo]) or a transaction ID typed by staff ([txid]).
typedef MomoPaid = ({Map<String, Object?>? momo, String? txid});

/// Mobile Money: send a payment request to the customer's phone and wait for approval, or record the payment by
/// its transaction ID. Null when cancelled.
Future<MomoPaid?> askMomo(BuildContext context, {required double total, required String amount, String phone = ''}) => showDialog<MomoPaid>(
  context: context,
  barrierDismissible: false,
  builder: (_) => _MomoDialog(total: total, amount: amount, phone: phone),
);

class _MomoDialog extends ConsumerStatefulWidget {
  const _MomoDialog({required this.total, required this.amount, required this.phone});
  final double total;
  final String amount, phone;
  @override
  ConsumerState<_MomoDialog> createState() => _MomoDialogState();
}

class _MomoDialogState extends ConsumerState<_MomoDialog> {
  late final _phone = TextEditingController(text: widget.phone);
  final _txid = TextEditingController();
  late String _network = guessNetwork(normalizePhone(widget.phone));
  Map<String, Object?>? _cfg;
  bool _waiting = false, _gone = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    ref
        .read(cloudApiProvider)
        .config()
        .then(
          (c) {
            if (mounted) setState(() => _cfg = c);
          },
          onError: (_) {
            if (mounted) setState(() => _cfg = const {});
          },
        );
  }

  @override
  void dispose() {
    _gone = true;
    super.dispose();
  }

  Future<void> _send() async {
    final phone = normalizePhone(_phone.text);
    if (phone.length < 12) return setState(() => _error = 'Enter the customer’s mobile money number');
    setState(() {
      _waiting = true;
      _error = '';
    });
    try {
      final m = await requestMomo(
        ref.read(cloudApiProvider),
        provider: _network,
        phone: phone,
        amount: widget.total,
        pharmacy: ref.read(pharmacyProvider).value?.settings.name ?? 'RxPOS',
        cancelled: () => _gone || !_waiting,
      );
      if (mounted) Navigator.pop(context, (momo: m, txid: null));
    } on MomoCancelled {
      return;
    } catch (e) {
      if (mounted) {
        setState(() {
          _waiting = false;
          _error = '$e'.replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _cfg?[_network] == true;
    return AlertDialog(
      title: Text('Mobile Money – ${widget.amount}'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _phone,
              enabled: !_waiting,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Customer’s mobile money number', hintText: 'e.g. 0772 123 456'),
              onChanged: (v) => setState(() => _network = guessNetwork(normalizePhone(v))),
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'mtn', label: Text('MTN')),
                ButtonSegment(value: 'airtel', label: Text('Airtel')),
              ],
              selected: {_network},
              onSelectionChanged: _waiting ? null : (v) => setState(() => _network = v.first),
            ),
            const SizedBox(height: 10),
            if (_waiting)
              const Row(
                children: [
                  SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                  SizedBox(width: 10),
                  Expanded(child: Text('Waiting for the customer to approve on their phone…')),
                ],
              )
            else
              FilledButton.icon(
                onPressed: ready ? _send : null,
                icon: const Icon(Icons.send_to_mobile),
                label: Text(
                  _cfg == null
                      ? 'Checking the cloud…'
                      : ready
                      ? 'Send payment request to the phone'
                      : '${_network == 'mtn' ? 'MTN' : 'Airtel'} requests are not set up (Settings → Online & Mobile Money)',
                ),
              ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            const Divider(height: 28),
            const Text('Or: the customer paid to your merchant number — type the transaction ID from their SMS.'),
            TextField(
              controller: _txid,
              enabled: !_waiting,
              decoration: const InputDecoration(labelText: 'Transaction ID'),
              onChanged: (_) => setState(() {}),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => _waiting ? setState(() => _waiting = false) : Navigator.pop(context), child: Text(_waiting ? 'Stop waiting' : 'Cancel')),
        FilledButton(
          onPressed: _waiting || _txid.text.trim().isEmpty
              ? null
              : () => Navigator.pop(context, (
                  momo: {'provider': _network, 'phone': normalizePhone(_phone.text), 'txid': _txid.text.trim(), 'manual': true},
                  txid: _txid.text.trim(),
                )),
          child: const Text('Record payment'),
        ),
      ],
    );
  }
}

const labelWarnings = [
  'Take after meals',
  'Take before meals',
  'May cause drowsiness. Do not drive',
  'Complete the full course',
  'Shake well before use',
  'Keep in a fridge (2–8 °C)',
  'Avoid alcohol',
  'For external use only',
];
const _doses = ['1 tablet', '2 tablets', '½ tablet', '1 capsule', '5 ml', '10 ml', '2.5 ml', '1 sachet', '2 drops', 'Apply thinly'];
const _freqs = ['once a day', 'twice a day', '3 times a day', '4 times a day', 'every 8 hours', 'at night', 'when needed (max 4 times a day)'];

/// The label's lines (the same text as the React app prints).
List<String> labelLines(CartLine l, Map<String, Object?> dir, PharmacySettings st, {DateTime? today}) {
  final dose = '${dir['dose'] ?? ''}'.trim(), freq = '${dir['freq'] ?? ''}'.trim(), days = '${dir['days'] ?? ''}'.trim();
  final patient = '${dir['patient'] ?? ''}'.trim();
  final d = today ?? DateTime.now();
  return [
    [st.name, st.phone].where((x) => x.isNotEmpty).join(' · '),
    '${l.name} × ${formatQty(l.count)}${l.pack != null ? ' ${l.pack!.name}' : ''}',
    if (dose.isNotEmpty || freq.isNotEmpty) [dose, freq, if (days.isNotEmpty) 'for $days days'].where((x) => x.isNotEmpty).join(' '),
    for (final n in (dir['notes'] as List?) ?? const []) '$n',
    '${patient.isEmpty ? '' : '$patient · '}${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}',
  ];
}

Future<Uint8List> labelPdf(List<String> lines) async {
  final doc = pw.Document()
    ..addPage(
      pw.Page(
        pageFormat: const PdfPageFormat(80 * PdfPageFormat.mm, 50 * PdfPageFormat.mm, marginAll: 4 * PdfPageFormat.mm),
        build: (_) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < lines.length; i++)
              pw.Text(
                lines[i],
                style: pw.TextStyle(fontSize: i == 1 || i == 2 ? 11 : 8, fontWeight: i == 1 || i == 2 ? pw.FontWeight.bold : null),
              ),
          ],
        ),
      ),
    );
  return doc.save();
}

/// The directions for a line (dose, how often, days, warnings, patient); the label can be printed. Returns the
/// directions to keep on the line, an empty map to clear them, null when closed without a change.
Future<Map<String, Object?>?> askDirections(BuildContext context, CartLine l, PharmacySettings st, {String patient = ''}) {
  final dir = {...?l.directions};
  final dose = TextEditingController(text: '${dir['dose'] ?? ''}'), freq = TextEditingController(text: '${dir['freq'] ?? ''}');
  final days = TextEditingController(text: '${dir['days'] ?? ''}'), who = TextEditingController(text: '${dir['patient'] ?? patient}');
  final notes = <String>{for (final n in (dir['notes'] as List?) ?? const []) '$n'};
  Map<String, Object?> now() => {
    'dose': dose.text.trim(),
    'freq': freq.text.trim(),
    'days': days.text.trim(),
    'notes': [...notes],
    'patient': who.text.trim(),
  };
  return showDialog<Map<String, Object?>>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, set) => AlertDialog(
        title: Text('Directions · ${l.name}'),
        content: SizedBox(
          width: 460,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  key: const Key('dir-dose'),
                  controller: dose,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'Dose'),
                  onChanged: (_) => set(() {}),
                ),
                Wrap(
                  spacing: 4,
                  children: [for (final x in _doses) ActionChip(label: Text(x), onPressed: () => set(() => dose.text = x))],
                ),
                TextField(
                  key: const Key('dir-freq'),
                  controller: freq,
                  decoration: const InputDecoration(labelText: 'How often'),
                  onChanged: (_) => set(() {}),
                ),
                Wrap(
                  spacing: 4,
                  children: [for (final x in _freqs) ActionChip(label: Text(x), onPressed: () => set(() => freq.text = x))],
                ),
                TextField(
                  key: const Key('dir-days'),
                  controller: days,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'For how many days'),
                  onChanged: (_) => set(() {}),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: [
                    for (final w in labelWarnings)
                      FilterChip(label: Text(w), selected: notes.contains(w), onSelected: (on) => set(() => on ? notes.add(w) : notes.remove(w))),
                  ],
                ),
                TextField(
                  controller: who,
                  decoration: const InputDecoration(labelText: 'Patient (optional)'),
                  onChanged: (_) => set(() {}),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    border: Border.all(color: Theme.of(c).dividerColor),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final x in labelLines(l, now(), st)) Text(x)]),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, <String, Object?>{}), child: const Text('Clear')),
          TextButton.icon(
            onPressed: () => Printing.layoutPdf(onLayout: (_) => labelPdf(labelLines(l, now(), st)), name: 'Label ${l.name}'),
            icon: const Icon(Icons.print),
            label: const Text('Print label'),
          ),
          FilledButton(onPressed: () => Navigator.pop(c, now()), child: const Text('Done')),
        ],
      ),
    ),
  );
}

/// Only expired stock is left: sell it anyway? Returns the reason (recorded in the audit log), null when not.
Future<String?> askExpiredReason(BuildContext context, String name) {
  final why = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, set) => AlertDialog(
        title: const Text('Only expired stock left'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('All remaining $name stock has expired. Sell expired anyway? The reason is recorded in the audit log.'),
            TextField(
              key: const Key('expired-reason'),
              controller: why,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Reason'),
              onChanged: (_) => set(() {}),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(onPressed: why.text.trim().isEmpty ? null : () => Navigator.pop(c, why.text.trim()), child: const Text('Sell expired')),
        ],
      ),
    ),
  );
}

/// Drug information for a medicine on the sale (what the pharmacy has on it, and alternatives with the same generic).
Future<void> showDrugInfo(BuildContext context, Product p, PharmacyData d) => showDialog<void>(
  context: context,
  builder: (c) => AlertDialog(
    title: Text(p.name),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text([p.generic, p.form, p.strength].where((x) => x.isNotEmpty).join(' · ')),
            const SizedBox(height: 6),
            Text('${p.rx ? 'Prescription only' : 'Over the counter'}${p.controlled ? ' · controlled drug' : ''}'),
            Text('Price ${d.settings.money(p.price)} · in stock ${formatQty(d.stockOf(p.id))}'),
            if (p.generic.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Same medicine, other brands: ${d.products.where((x) => x.id != p.id && x.generic.toLowerCase() == p.generic.toLowerCase()).map((x) => '${x.name} (${formatQty(d.stockOf(x.id))})').take(8).join(', ').ifEmpty('none')}',
              ),
            ],
            const Divider(height: 20),
            DrugInfoPanel(name: p.name, generic: p.generic, compact: true),
          ],
        ),
      ),
    ),
    actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
  ),
);

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

const posShortcuts = [
  ('F2', 'Search medicines'),
  ('F8', 'Back to the search box'),
  ('Enter', 'Add the scanned barcode or the first match'),
  ('F9 / Ctrl+Enter', 'Charge'),
  ('Alt+H', 'Hold the sale'),
  ('Alt+← / Alt+→', 'Switch between held sales'),
  ('+ / −', 'More / less of the selected line'),
  ('Delete', 'Remove the selected line'),
  ('?', 'These shortcuts'),
];

Future<void> showKeyboardHelp(BuildContext context) => showDialog<void>(
  context: context,
  builder: (c) => AlertDialog(
    title: const Text('Keyboard shortcuts'),
    content: SizedBox(
      width: 380,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (k, what) in posShortcuts)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  SizedBox(
                    width: 130,
                    child: Text(
                      k,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'monospace'),
                    ),
                  ),
                  Expanded(child: Text(what)),
                ],
              ),
            ),
        ],
      ),
    ),
    actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
  ),
);
