// Settings laid out as the owner chose from the "app settings" references (src/components/SettingsKit.jsx, 2026-11-15):
// labelled groups in rounded containers, an icon and one line on every row, › when a row opens a section, a search over
// every setting, quick switches that save at once, and a red Danger zone behind a warning screen and a last question.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/presentation/widgets.dart' show confirmAction;

/// The sections: (group, tab, name, line, icon)
const settingsSections = [
  ('Pharmacy', 'general', 'Pharmacy', 'Name, contacts, tax and markups', Icons.storefront_outlined),
  ('Pharmacy', 'payments', 'Payment methods', 'Cash, mobile money, card and insurance at the till', Icons.credit_card),
  ('Selling & stock', 'receipts', 'Receipts & stock', 'Printing, packs, expiry warnings and reordering', Icons.print_outlined),
  ('Alerts & messages', 'messages', 'Messages & recovery', 'Reminder texts, password recovery, client details', Icons.sms_outlined),
  ('Alerts & messages', 'alerts', 'Alerts & storage', 'Daily summary, report emails, reminders, weather, storage limits', Icons.notifications_outlined),
  ('Online & data', 'online', 'Online & Mobile Money', 'Cloud sync, Mobile Money and SMS', Icons.cloud_outlined),
  ('Online & data', 'backup', 'Data & backup', 'Updates, backups and the daily stock sheet', Icons.backup_outlined),
];

/// What the search finds: (setting, section)
const settingsIndex = [
  ('Pharmacy name', 'general'), ('Phone', 'general'), ('Address', 'general'), ('Licence', 'general'), ('TIN', 'general'), ('Currency', 'general'),
  ('Decimal places', 'general'), ('Tax / VAT rate', 'general'), ('Retail markup', 'general'), ('Wholesale markup', 'general'), ('Target margin', 'general'),
  ('Round prices', 'general'), ('Non-cash sales go to', 'general'), ('Payment methods', 'payments'), ('Receipt printer paper', 'receipts'),
  ('Print the receipt automatically', 'receipts'), ('Blind cash-up', 'receipts'), ('Receipt footer', 'receipts'), ('Packs and units', 'receipts'),
  ('Expiry warning', 'receipts'), ('Supplier lead time', 'receipts'), ('Reorder levels', 'receipts'), ('Dead stock', 'receipts'), ('Safety stock', 'receipts'),
  ('Refill reminder text', 'messages'), ('Payment reminder text', 'messages'), ("Administrator's WhatsApp", 'messages'), ('Client details at the POS', 'messages'),
  ('Daily summary for the owner', 'alerts'), ('Report emails', 'alerts'), ('Idle promotions', 'alerts'), ('Hourly reminder', 'alerts'), ('Quiet hours', 'alerts'),
  ('Weather location', 'alerts'), ('Storage limits', 'alerts'), ('Online sync', 'online'), ('Mobile Money & SMS', 'online'), ('Backup', 'backup'),
  ('Daily stock sheet', 'backup'), ('Restore default settings', 'backup'),
];

/// One labelled group
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({super.key, required this.label, required this.children, this.danger = false});
  final String label;
  final List<Widget> children;
  final bool danger;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(padding: const EdgeInsets.fromLTRB(6, 0, 6, 6), child: Text(label, style: t.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700, color: danger ? t.colorScheme.error : t.colorScheme.onSurfaceVariant))),
        Material(
          color: t.colorScheme.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: danger ? t.colorScheme.error.withValues(alpha: .35) : t.dividerColor)),
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final (i, c) in children.indexed) ...[if (i > 0) const Divider(height: 1, indent: 54), c],
            ]),
          ),
        ),
      ]),
    );
  }
}

Widget _icon(BuildContext context, IconData icon, {bool danger = false}) {
  final cs = Theme.of(context).colorScheme;
  return Container(
    width: 34,
    height: 34,
    decoration: BoxDecoration(color: (danger ? cs.error : cs.primary).withValues(alpha: .12), borderRadius: BorderRadius.circular(10)),
    child: Icon(icon, size: 18, color: danger ? cs.error : cs.tertiary),
  );
}

/// The list of settings: search, quick switches, the sections, more pages and the Danger zone
class SettingsList extends StatefulWidget {
  const SettingsList({super.key, required this.tab, required this.onTab, required this.quick, required this.onQuick, required this.danger});
  final String? tab;
  final ValueChanged<String> onTab;
  /// (name, line, icon, key, on)
  final List<(String, String, IconData, String, bool)> quick;
  final void Function(String key, bool on) onQuick;
  /// (name, line, title, text, confirm, run)
  final List<(String, String, String, String, String, Future<void> Function())> danger;
  @override
  State<SettingsList> createState() => _SettingsListState();
}

class _SettingsListState extends State<SettingsList> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final q = _q.trim().toLowerCase();
    final hits = q.isEmpty ? const <(String, String)>[] : settingsIndex.where((x) => x.$1.toLowerCase().contains(q)).take(8).toList();
    final groups = {for (final s in settingsSections) s.$1};
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextField(
        key: const Key('settings-search'),
        decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search settings', isDense: true),
        onChanged: (v) => setState(() => _q = v),
      ),
      if (hits.isNotEmpty)
        Card(
          margin: const EdgeInsets.only(top: 6),
          child: Column(children: [
            for (final (label, tab) in hits)
              ListTile(
                dense: true,
                title: Text(label),
                subtitle: Text(settingsSections.firstWhere((s) => s.$2 == tab).$3),
                onTap: () {
                  setState(() => _q = '');
                  widget.onTab(tab);
                },
              ),
          ]),
        ),
      if (q.isNotEmpty && hits.isEmpty) Padding(padding: const EdgeInsets.all(8), child: Text('No setting matches "$_q"', style: t.textTheme.bodySmall)),
      const SizedBox(height: 14),
      SettingsGroup(label: 'Quick switches', children: [
        for (final (name, line, icon, key, on) in widget.quick)
          SwitchListTile(
            key: ValueKey('quick-$key'),
            contentPadding: const EdgeInsets.symmetric(horizontal: 10),
            secondary: _icon(context, icon),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(line),
            value: on,
            onChanged: (v) => widget.onQuick(key, v),
          ),
      ]),
      for (final g in groups)
        SettingsGroup(label: g, children: [
          for (final (_, tab, name, line, icon) in settingsSections.where((s) => s.$1 == g))
            ListTile(
              key: ValueKey('settings-$tab'),
              selected: widget.tab == tab,
              selectedTileColor: t.colorScheme.primary.withValues(alpha: .10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 10),
              leading: _icon(context, icon),
              title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(line),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => widget.onTab(tab),
            ),
        ]),
      SettingsGroup(label: 'More', children: [
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 10),
          leading: _icon(context, Icons.devices_outlined),
          title: const Text('This device', style: TextStyle(fontWeight: FontWeight.w600)),
          subtitle: const Text('Screen, sounds, keyboard, updates'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go('/device'),
        ),
      ]),
      if (widget.danger.isNotEmpty)
        SettingsGroup(label: 'Danger zone', danger: true, children: [
          for (final (name, line, title, text, confirm, run) in widget.danger)
            ListTile(
              key: ValueKey('danger-$name'),
              contentPadding: const EdgeInsets.symmetric(horizontal: 10),
              leading: _icon(context, Icons.restart_alt, danger: true),
              title: Text(name, style: TextStyle(fontWeight: FontWeight.w600, color: t.colorScheme.error)),
              subtitle: Text(line),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                if (await showDangerSheet(context, title: title, text: text, confirm: confirm) != true || !context.mounted) return;
                if (!await confirmAction(context, '$confirm?', 'This can\'t be undone.', confirm)) return;
                await run();
              },
            ),
        ]),
    ]);
  }
}

/// The warning screen before a Danger zone action: a big warning sign, what will happen, "Yes, …" and Cancel
Future<bool?> showDangerSheet(BuildContext context, {required String title, required String text, required String confirm}) => showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final t = Theme.of(context);
        return SafeArea(
          child: Padding(
            key: const Key('danger-sheet'),
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: .6, end: 1),
                duration: const Duration(milliseconds: 420),
                curve: Curves.elasticOut,
                builder: (_, k, c) => Transform.scale(scale: k, child: c),
                child: Center(
                  child: Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFF87171), Color(0xFFB91C1C)], begin: Alignment.topLeft, end: Alignment.bottomRight), borderRadius: BorderRadius.circular(26)),
                    child: const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 48),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(title, textAlign: TextAlign.center, style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(text, textAlign: TextAlign.center, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 16),
              OutlinedButton(
                key: const Key('danger-yes'),
                style: OutlinedButton.styleFrom(foregroundColor: t.colorScheme.error, side: BorderSide(color: t.colorScheme.error, width: 1.5), minimumSize: const Size.fromHeight(46)),
                onPressed: () => Navigator.pop(context, true),
                child: Text('Yes, ${confirm.toLowerCase()}'),
              ),
              const SizedBox(height: 8),
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            ]),
          ),
        );
      },
    );
