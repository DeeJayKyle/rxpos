// Forms, UI batch 3 (D), as src/forms.jsx:
//   MoneyFormatter / moneyValue  D5: thousand commas while typing; the value stays a number
//   PhoneFormatter / phoneOk     D6: 0772 123 456 as it is typed, valid for WhatsApp / SMS
//   HelpTip / helpTexts          D3: a small (?) with a one-sentence explanation
//   SyncMark                     D4: a dot while a save goes to the cloud, a tick once the cloud has it
//   dialog sizes                 D9: sm 420 · md 640 · lg 960
import 'dart:convert' show base64Decode;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/sync_status/application/sync_controller.dart';
import '../theme/themes.dart' show TonesOfContext;
import '../network/cloud_api.dart' show cloudApiProvider;
import '../data/pharmacy_providers.dart' show brandingProvider, settingsProvider;

const dialogSm = 420.0, dialogMd = 640.0, dialogLg = 960.0;

/// "1234567.5" → "1,234,567.5" (the decimals typed are kept, at most two)
String groupDigits(String text) {
  final s = text.replaceAll(RegExp(r'[^\d.]'), '');
  final parts = s.split('.');
  var intPart = parts.first.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  intPart = intPart.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  if (parts.length > 1) return '${intPart.isEmpty ? '0' : intPart}.${parts.skip(1).join().substring(0, parts.skip(1).join().length.clamp(0, 2))}';
  return intPart;
}

double moneyValue(String text) => double.tryParse(text.replaceAll(',', '').trim()) ?? 0;

/// D5: commas while an amount is typed, the cursor kept at the end
class MoneyFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final t = groupDigits(newValue.text);
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}

/// "0772123456" → "0772 123 456"; "+256772123456" → "+256 772 123 456"
String formatPhone(String text) {
  var s = text.replaceAll(RegExp(r'[^\d+]'), '');
  final plus = s.startsWith('+');
  s = s.replaceAll('+', '');
  String chunk(String d, List<int> at) {
    final out = <String>[];
    var i = 0;
    for (final n in at) {
      if (i >= d.length) break;
      out.add(d.substring(i, (i + n).clamp(0, d.length)));
      i += n;
    }
    if (i < d.length) out.add(d.substring(i));
    return out.join(' ');
  }

  return plus ? '+${chunk(s, [3, 3, 3])}' : chunk(s, [4, 3]);
}

/// A number WhatsApp and SMS can reach (src/forms.jsx phoneOk)
bool phoneOk(String text) {
  var p = text.replaceAll(RegExp(r'[^\d+]'), '');
  if (p.startsWith('+')) p = p.substring(1);
  if (p.startsWith('00')) p = p.substring(2);
  if (p.startsWith('0')) p = '256${p.substring(1)}';
  if (p.length == 9) p = '256$p';
  return p.startsWith('256') ? p.length == 12 : p.length >= 11 && p.length <= 15;
}

class PhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final t = formatPhone(newValue.text);
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}

/// D3: the same sentences as src/forms.jsx HELP
const helpTexts = {
  'reorder': 'When stock falls to this number, the medicine shows as low and goes on the reorder list.',
  'fefo': 'First expiry, first out: the till sells the batch that expires soonest, so older stock goes before it expires.',
  'blind': 'The cashier counts the cash without seeing what the till expects, so the count is honest; the difference shows after.',
  'wholesale': 'The price for wholesale customers (clinics, other pharmacies); the wholesale till uses it instead of the retail price.',
  'tax': 'VAT added to (or included in) sales. Leave 0 if the pharmacy does not charge VAT.',
  'credit': 'The most this client may owe. A sale on credit that would go over it needs a manager.',
  'markup': 'Added to the cost to suggest a selling price when stock is received.',
  'expiryWarn': 'How many days before expiry a batch shows as expiring soon.',
  'refundApprove': 'Refunds above this amount need a manager’s PIN or password, unless a manager does the refund.',
};

/// D3: a (?) beside a tricky field: the sentence on hover, long-press or tap
class HelpTip extends StatelessWidget {
  const HelpTip(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Tooltip(
        message: text,
        triggerMode: TooltipTriggerMode.tap,
        showDuration: const Duration(seconds: 6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Semantics(label: 'What is this? $text', child: Icon(Icons.help_outline, size: 16, color: Theme.of(context).hintColor)),
        ),
      );
}

/// D4: the cloud's side of a save: a dot while it is on its way, a tick once the cloud has everything
class SyncMark extends ConsumerWidget {
  const SyncMark({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(syncControllerProvider);
    if (st.state == SyncState.signedOut) return const SizedBox.shrink();
    final done = st.state == SyncState.synced && st.pending == 0;
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: done
          ? Icon(Icons.check_circle, key: const Key('sync-mark-done'), size: 14, color: context.tones.ok, semanticLabel: 'In the cloud')
          : Semantics(
              label: st.state == SyncState.offline ? 'Saved here; it goes to the cloud when the internet is back' : 'Going to the cloud',
              child: Container(key: const Key('sync-mark-pending'), width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: .7))),
            ),
    );
  }
}

/// D4: "Saved" at once, with the cloud's mark beside it
void saySaved(BuildContext context, String message) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(key: const Key('saved-snack'), content: Row(children: [Flexible(child: Text(message)), const SyncMark()])));

/// A5: a medicine's photo (its address in the pharmacy's files), or its first letter when it has none
class MedThumb extends ConsumerWidget {
  const MedThumb({super.key, required this.name, required this.photo, this.size = 30});
  final String name, photo;
  final double size;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final initial = Container(
      key: const Key('med-initial'),
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: t.colorScheme.primary.withValues(alpha: .14), borderRadius: BorderRadius.circular(8)),
      child: Text(name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase(), style: TextStyle(fontWeight: FontWeight.w800, fontSize: size * .45, color: t.colorScheme.primary)),
    );
    if (photo.isEmpty) return ExcludeSemantics(child: initial);
    return ClipRRect(
      key: const Key('med-photo'),
      borderRadius: BorderRadius.circular(8),
      child: Image.network(ref.read(cloudApiProvider).fileUrl(photo), width: size, height: size, fit: BoxFit.cover, excludeFromSemantics: true, errorBuilder: (_, _, _) => initial),
    );
  }
}

/// E6 (as src/logo.jsx pharmacyLogo): the owner's logo (branding), else the one the pharmacy uploaded in Settings
/// (a file in its cloud, settings 'logo'); '' when none
final pharmacyLogoProvider = Provider.autoDispose<String>((ref) {
  final owner = '${ref.watch(brandingProvider)?['logo'] ?? ''}';
  if (owner.isNotEmpty) return owner;
  final path = '${ref.watch(settingsProvider).value?.raw['logo'] ?? ''}';
  return path.isEmpty ? '' : ref.read(cloudApiProvider).fileUrl(path);
});

/// E6: the pharmacy's logo, or nothing when it has none
class PharmacyLogo extends ConsumerWidget {
  const PharmacyLogo({super.key, this.size = 34, this.fallback});
  final double size;
  final Widget? fallback;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(pharmacyLogoProvider);
    final none = fallback ?? const SizedBox.shrink();
    if (url.isEmpty) return none;
    final img = url.startsWith('data:image')
        ? Image.memory(base64Decode(url.split(',').last), width: size, height: size, fit: BoxFit.contain, errorBuilder: (_, _, _) => none)
        : Image.network(url, width: size, height: size, fit: BoxFit.contain, errorBuilder: (_, _, _) => none);
    return ClipRRect(key: const Key('pharmacy-logo'), borderRadius: BorderRadius.circular(8), child: img);
  }
}
