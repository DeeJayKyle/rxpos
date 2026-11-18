// Pieces every screen uses: a page with a title and actions, figure cards, a search box, an empty state, a record form,
// money formatted in the pharmacy's currency.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/sync_status/application/sync_controller.dart';

import '../entities/settings.dart';
import '../theme/themes.dart';
import '../rules/money.dart';
import 'app_dialog.dart';
import 'form_kit.dart';
import 'package:flutter/services.dart';

export 'app_dialog.dart';
export 'form_kit.dart';

extension Money on PharmacySettings {
  String money(num n) => formatMoney(n, currency: currency, decimals: decimalPlaces, locale: locale);
  /// UGX 1.2M / UGX 350K on figure cards (UI batch 3, B6)
  String moneyShort(num n) => formatMoneyShort(n, currency: currency, decimals: decimalPlaces, locale: locale);
}

/// A screen's frame: title (and a line under it), actions on the right, then the content.
class PageFrame extends StatelessWidget {
  const PageFrame({super.key, required this.title, this.subtitle, this.actions = const [], required this.child, this.scroll = false});
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final Widget child;
  final bool scroll;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final tk = t.extension<DesignTokens>() ?? const DesignTokens();
    // a design's band behind the title (Studio Grid: dark; Travel Orange: orange, curved): the title in white on it
    final band = tk.heroBand.isNotEmpty;
    final onBand = band ? Colors.white : null;
    Widget head = Padding(
      padding: band ? const EdgeInsets.fromLTRB(20, 22, 20, 22) : const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, alignment: WrapAlignment.spaceBetween, children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(title, style: (band ? t.textTheme.headlineMedium : t.textTheme.headlineSmall)?.copyWith(fontWeight: band ? null : FontWeight.w800, color: onBand)),
          if (subtitle != null) Text(subtitle!, style: t.textTheme.bodySmall?.copyWith(color: onBand?.withValues(alpha: .78))),
        ]),
        if (actions.isNotEmpty) Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: actions),
      ]),
    );
    // a page that draws its own heading (the dashboard's greeting card) has no title row
    if (title.isEmpty && subtitle == null && actions.isEmpty) head = const SizedBox(height: 14);
    if (band && title.isNotEmpty) {
      head = Padding(
        padding: EdgeInsets.only(bottom: 12, left: tk.heroCurve > 0 ? 0 : 16, right: tk.heroCurve > 0 ? 0 : 16, top: tk.heroCurve > 0 ? 0 : 12),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: tk.heroBand.length > 1 ? LinearGradient(colors: tk.heroBand, begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
            color: tk.heroBand.first,
            borderRadius: tk.heroCurve > 0 ? BorderRadius.vertical(bottom: Radius.circular(tk.heroCurve)) : BorderRadius.circular(tk.radius),
          ),
          // white on the band: its search fields and buttons keep their own colours
          child: Theme(data: t.copyWith(textTheme: t.textTheme.apply(bodyColor: Colors.white, displayColor: Colors.white)), child: head),
        ),
      );
    }
    // phones: pull a list down to sync now (UI batch 3, C11)
    Widget body(Widget c) => PullToSync(child: tk.rails ? _Rails(child: c) : c);
    if (scroll) {
      return body(ListView(padding: const EdgeInsets.only(bottom: 24), children: [head, Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: child)]));
    }
    // phones: the heading (title, search, filters, buttons) keeps at most 45 % of the height and scrolls by itself
    // when taller (large text), so the page's list always has room; both stay reachable
    final pad = Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: child);
    return body(LayoutBuilder(builder: (context, c) {
      final phone = MediaQuery.sizeOf(context).width < 600 && c.maxHeight.isFinite;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        phone ? ConstrainedBox(constraints: BoxConstraints(maxHeight: c.maxHeight * .45), child: SingleChildScrollView(child: head)) : head,
        Expanded(child: pad),
      ]);
    }));
  }
}

/// A tiny 7-day trend line for a figure card (src/ui.jsx Spark); the last point is today.
class Spark extends StatelessWidget {
  const Spark({super.key, required this.data, required this.color});
  final List<double> data;
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(width: 84, height: 26, child: CustomPaint(painter: _SparkPainter(data, color)));
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.data, this.color);
  final List<double> data;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    if (data.length < 2) return;
    final hi = data.reduce((a, b) => a > b ? a : b), lo = data.reduce((a, b) => a < b ? a : b), span = hi - lo == 0 ? 1 : hi - lo;
    final pts = [for (final (i, v) in data.indexed) Offset(i / (data.length - 1) * size.width, size.height - 3 - (v - lo) / span * (size.height - 6))];
    final line = Path()..addPolygon(pts, false);
    final area = Path()..moveTo(0, size.height)..addPolygon(pts, false)..lineTo(size.width, size.height)..close();
    canvas.drawPath(area, Paint()..color = color.withValues(alpha: .14));
    canvas.drawPath(line, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 2..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
    canvas.drawCircle(pts.last, 2.6, Paint()..color = color);
  }
  @override
  bool shouldRepaint(_SparkPainter o) => o.data != data || o.color != color;
}

/// Phones: a list pulled down past its top syncs now and says "Synced just now" (UI batch 3, C11, as the classic
/// app's src/refresh.jsx). Elsewhere it is the child as it is.
class PullToSync extends ConsumerWidget {
  const PullToSync({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (MediaQuery.sizeOf(context).width >= 600) return child;
    return RefreshIndicator(
      key: const Key('pull-to-sync'),
      notificationPredicate: (n) => n.metrics.axis == Axis.vertical,
      onRefresh: () async {
        final r = await ref.read(syncControllerProvider.notifier).runNow();
        if (!context.mounted) return;
        say(context, switch (r.state) {
          SyncState.synced => 'Synced just now',
          SyncState.offline => 'Offline: your work is saved and goes up when the internet is back',
          SyncState.signedOut => 'This device is not linked to the cloud',
          _ => r.error ?? 'Could not reach the cloud',
        }, error: r.state != SyncState.synced && r.state != SyncState.offline);
      },
      child: child,
    );
  }
}

/// A figure with its label (and a line under it); tappable when [onTap] is set.
class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.full, this.sub, this.icon, this.color, this.onTap, this.spark});
  final String label, value;
  /// the whole amount when [value] is said short (UGX 1.2M, UI batch 3 B6): the figure's tooltip and what screen
  /// readers say
  final String? full;
  /// the last 7 days of this figure, drawn as a small trend line (2026-11-18)
  final List<double>? spark;
  final String? sub;
  final IconData? icon;
  final Color? color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    // Vivid (This device → Theme → Colour): a solid tile of the figure's colour with white text
    final vivid = t.extension<LookLevel>()?.vivid ?? false;
    final (va, vb) = vividFor(color);
    final ink = vivid ? Colors.white : null;
    // a figure's colour (purple, orange, blue…) is lifted until it reads on this card: AA on light and dark themes
    final dark = t.brightness == Brightness.dark;
    // RxPOS Green: the card washed in its figure's colour, the icon in a tile of it
    final tinted = !vivid && (t.extension<DesignTokens>()?.tintedStats ?? false);
    final tone = color ?? t.colorScheme.primary;
    final wash = Color.alphaBlend(tone.withValues(alpha: dark ? .16 : .08), t.cardTheme.color ?? t.colorScheme.surface);
    final shown = color == null ? null : Color(readable(color!.toARGB32(), [(tinted ? wash : t.cardTheme.color ?? t.colorScheme.surface).toARGB32()], dark ? 0xFFFFFFFF : 0xFF000000));
    // the grid (or the parent) decides the width; the figure shrinks to fit rather than being cut or wrapped
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 140),
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        color: tinted ? wash : null,
        shape: tinted ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.extension<DesignTokens>()!.radius), side: BorderSide(color: tone.withValues(alpha: .28))) : null,
        child: Ink(
          // as the React app's figure cards (src/styles/dashboard.css .kpi): a 3 px band of the figure's colour on top
          decoration: vivid
              ? BoxDecoration(gradient: LinearGradient(colors: [va, vb], begin: Alignment.topLeft, end: Alignment.bottomRight))
              : tinted
                  ? null
                  : BoxDecoration(border: Border(top: BorderSide(color: tone, width: 3))),
          child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: EdgeInsets.all(MediaQuery.sizeOf(context).width < 600 ? 12 : 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(label.toUpperCase(), style: t.textTheme.labelSmall?.copyWith(letterSpacing: .6, fontWeight: FontWeight.w700, color: ink))),
                if (icon != null)
                  !vivid
                      ? Container(padding: const EdgeInsets.all(9), decoration: BoxDecoration(color: tone.withValues(alpha: .14), borderRadius: BorderRadius.circular(12)),
                          child: Icon(icon, size: 20, color: shown ?? t.colorScheme.tertiary))
                      : Icon(icon, size: 20, color: ink ?? shown ?? t.colorScheme.primary),
              ]),
              const SizedBox(height: 6),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                // the figure in the text colour, as React (the colour is in the band and the icon tile)
                child: () {
                  final txt = Text(value, maxLines: 1, semanticsLabel: full, style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -.3, color: ink ?? (tinted ? shown : null)));
                  return full != null && full != value ? Tooltip(key: const Key('stat-full'), message: full!, child: txt) : txt;
                }(),
              ),
              if (spark != null && spark!.any((v) => v != 0))
                Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Spark(key: const Key('spark'), data: spark!, color: ink ?? t.colorScheme.primary)),
              if (sub != null || onTap != null)
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  // the change and "vs yesterday" on one line (UI batch 3, B2); the whole line in the tooltip
                  Expanded(child: Tooltip(message: sub ?? '', child: Text(sub ?? '', key: const Key('stat-sub'), maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.bodySmall?.copyWith(color: ink?.withValues(alpha: .9))))),
                  // a card that opens a page says so
                  if (onTap != null) Icon(Icons.arrow_outward, size: 16, color: (ink ?? shown ?? t.colorScheme.primary).withValues(alpha: .8)),
                ]),
            ]),
          ),
          ),
        ),
      ),
    );
  }
}

/// Figures side by side that fill the row: each [StatCard] gets an equal share of the width (at least [minWidth]),
/// so a row never ends in a gap; anything else in the grid keeps its own size.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children, this.minWidth = 230, this.spacing = 12});
  final List<Widget> children;
  final double minWidth, spacing;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        final cards = children.whereType<StatCard>().length;
        final w = c.maxWidth.isFinite ? c.maxWidth : minWidth * 4;
        // phones: two figures to a row while each still gets 150 px (amounts stay readable), else one
        final min = w < 600 ? 150.0 : minWidth;
        final cols = ((w + spacing) / (min + spacing)).floor().clamp(1, cards == 0 ? 1 : cards);
        final cw = ((w - spacing * (cols - 1)) / cols).floorToDouble();
        return Wrap(spacing: spacing, runSpacing: spacing, children: [
          for (final x in children) x is StatCard ? SizedBox(width: cw, child: x) : x,
        ]);
      });
}

class SearchField extends StatelessWidget {
  const SearchField({super.key, required this.onChanged, this.hint = 'Search…', this.width = 280, this.initial = '', this.focusNode, this.controller});
  final ValueChanged<String> onChanged;
  final String hint;
  final double width;
  final String initial;
  /// for a list's keys (list_controls.dart): / goes to the search, Esc clears it
  final FocusNode? focusNode;
  final TextEditingController? controller;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: TextFormField(initialValue: controller == null ? initial : null, controller: controller, focusNode: focusNode, onChanged: onChanged,
            decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: hint, isDense: true, border: const OutlineInputBorder())),
      );
}

/// A date (YYYY-MM-DD, or empty for none), typed or picked from a calendar.
class DateBox extends StatefulWidget {
  const DateBox({super.key, required this.label, required this.value, required this.onChanged, this.width = 160});
  final String label, value;
  final ValueChanged<String> onChanged;
  final double width;
  @override
  State<DateBox> createState() => _DateBoxState();
}

class _DateBoxState extends State<DateBox> {
  late final _c = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(DateBox old) {
    super.didUpdateWidget(old);
    if (widget.value != old.value && widget.value != _c.text) _c.text = widget.value;
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: widget.width,
        child: TextField(
          key: Key('date-${widget.label}'),
          controller: _c,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: 'YYYY-MM-DD',
            isDense: true,
            suffixIcon: IconButton(
              tooltip: 'Pick a date',
              icon: const Icon(Icons.calendar_today, size: 18),
              onPressed: () async {
                final now = DateTime.now();
                final d = await showDatePicker(context: context, firstDate: DateTime(2015), lastDate: DateTime(now.year + 5),
                    initialDate: DateTime.tryParse(_c.text) ?? now);
                if (d == null) return;
                final v = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
                _c.text = v;
                widget.onChanged(v);
              },
            ),
          ),
          onChanged: (v) {
            final t = v.trim();
            if (t.isEmpty || RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(t)) widget.onChanged(t);
          },
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key, this.icon = Icons.inbox_outlined});
  final String text;
  final IconData icon;
  @override
  // scrolls when there is little room (a phone with large text) rather than running off the bottom
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 40, color: Theme.of(context).disabledColor), const SizedBox(height: 8), Text(text, textAlign: TextAlign.center)]),
        ),
      );
}

/// One field of a [RecordForm].
class FormFieldSpec {
  const FormFieldSpec(this.key, this.label, {this.kind = FieldKind.text, this.required = false, this.options = const [], this.hint, this.help, this.validate});
  final String key, label;
  final FieldKind kind;
  final bool required;
  /// for [FieldKind.choice]: (value, label)
  final List<(String, String)> options;
  final String? hint;
  /// D3: one sentence shown by a (?) beside the field
  final String? help;
  /// D1: a check of its own: the message, or null when fine (value as typed, the form's values so far)
  final String? Function(String value, Map<String, Object?> values)? validate;
}

/// money (D5): the currency in front and commas while typing, kept as a number; phone (D6): formatted as typed
enum FieldKind { text, number, multiline, choice, flag, date, money, phone, photo }

/// What [editRecord] returns when its Delete button is pressed (and the deletion confirmed).
const deleteRecord = {'_delete': true};

/// A dialog that edits a record's fields and returns the edited values (null when cancelled). With [delete] (the
/// record's name, e.g. 'medicine'), a Delete button asks "Delete this medicine?" and then returns [deleteRecord].
Future<Map<String, Object?>?> editRecord(BuildContext context, {required String title, required List<FormFieldSpec> fields,
    Map<String, Object?> initial = const {}, String save = 'Save', String? delete, bool side = false, String currency = 'UGX', Future<String?> Function()? pickPhoto, String note = ''}) {
  final values = Map<String, Object?>.of(initial);
  final ctl = {
    for (final f in fields)
      if (f.kind != FieldKind.choice && f.kind != FieldKind.flag && f.kind != FieldKind.photo)
        f.key: TextEditingController(text: f.kind == FieldKind.money ? groupDigits(_show(initial[f.key])) : f.kind == FieldKind.phone ? formatPhone(_show(initial[f.key])) : _show(initial[f.key])),
  };
  final formKey = GlobalKey<FormState>();
  final texts = [for (final f in fields) if (ctl.containsKey(f.key)) f.key];
  // the values as typed so far, for the checks that compare fields (a price under the cost)
  Map<String, Object?> now() => {...values, for (final e in ctl.entries) e.key: e.value.text};
  return showAppDialog<Map<String, Object?>>(
    side: side, // a record's details beside its list on a wide screen (UI batch 3, C8)
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, set) {
        void submit() {
          if (!(formKey.currentState?.validate() ?? false)) return;
          for (final f in fields) {
            final x = ctl[f.key];
            if (x == null) continue;
            final s = x.text.trim();
            values[f.key] = f.kind == FieldKind.number || f.kind == FieldKind.money ? (s.isEmpty ? 0 : _num(moneyValue(s))) : s;
          }
          Navigator.pop(c, values);
        }

        return CallbackShortcuts(
          // D7: Ctrl+Enter saves from any field
          bindings: {const SingleActivator(LogicalKeyboardKey.enter, control: true): submit, const SingleActivator(LogicalKeyboardKey.enter, meta: true): submit},
          child: AlertDialog(
            // F5: "Edited by Amina · 2 h ago" under the title
            title: note.isEmpty ? Text(title) : Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(title),
                Text(note, key: const Key('who-changed'), style: Theme.of(c).textTheme.bodySmall),
              ]),
            content: SizedBox(
              width: dialogMd, // D9: the middle of the three sizes
              child: Form(
                key: formKey,
                // D1: each field is checked when it is left
                autovalidateMode: AutovalidateMode.onUnfocus,
                child: SingleChildScrollView(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    for (final f in fields)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: switch (f.kind) {
                          // A5: a photo: taken or chosen by [pickPhoto], which returns its address once stored
                          FieldKind.photo => Row(key: ValueKey('field-${f.key}'), children: [
                              MedThumb(name: '${values['name'] ?? ''}', photo: '${values[f.key] ?? ''}', size: 56),
                              const SizedBox(width: 10),
                              OutlinedButton.icon(
                                onPressed: pickPhoto == null
                                    ? null
                                    : () async {
                                        final path = await pickPhoto();
                                        if (path != null) set(() => values[f.key] = path);
                                      },
                                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                                label: Text('${values[f.key] ?? ''}'.isEmpty ? 'Add a photo' : 'Change photo'),
                              ),
                              if ('${values[f.key] ?? ''}'.isNotEmpty) TextButton(onPressed: () => set(() => values[f.key] = ''), child: const Text('Remove')),
                            ]),
                          FieldKind.flag => SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(f.label), value: values[f.key] == true, onChanged: (v) => set(() => values[f.key] = v)),
                          FieldKind.choice => DropdownButtonFormField<String>(
                              initialValue: f.options.any((o) => o.$1 == values[f.key]) ? values[f.key] as String : null,
                              decoration: InputDecoration(labelText: f.label, suffixIcon: f.help == null ? null : HelpTip(f.help!)),
                              // the field's full width; a long choice ends in "…" instead of running off the edge
                              isExpanded: true,
                              items: [for (final o in f.options) DropdownMenuItem(value: o.$1, child: Text(o.$2, maxLines: 1, overflow: TextOverflow.ellipsis))],
                              validator: (v) => f.required && v == null ? 'Choose ${f.label.toLowerCase()}' : null,
                              onChanged: (v) => values[f.key] = v,
                            ),
                          _ => TextFormField(
                              key: ValueKey('field-${f.key}'),
                              controller: ctl[f.key],
                              // D7: the cursor in the first field; Enter to the next, the last one saves
                              autofocus: texts.isNotEmpty && texts.first == f.key,
                              textInputAction: f.kind == FieldKind.multiline ? TextInputAction.newline : texts.last == f.key ? TextInputAction.done : TextInputAction.next,
                              // (TextInputAction.next moves the focus on by itself; the last field sends the form)
                              onFieldSubmitted: f.kind == FieldKind.multiline || texts.last != f.key ? null : (_) => submit(),
                              decoration: InputDecoration(
                                labelText: f.label,
                                hintText: f.hint ?? (f.kind == FieldKind.date ? 'YYYY-MM-DD' : f.kind == FieldKind.phone ? '0772 123 456' : null),
                                prefixText: f.kind == FieldKind.money && currency.isNotEmpty ? '$currency ' : null,
                                suffixIcon: f.kind == FieldKind.phone && phoneOk(ctl[f.key]!.text)
                                    ? Icon(Icons.check_circle, key: ValueKey('phone-ok-${f.key}'), color: c.tones.ok, semanticLabel: 'Valid for WhatsApp and SMS')
                                    : f.help == null
                                        ? null
                                        : HelpTip(f.help!),
                              ),
                              maxLines: f.kind == FieldKind.multiline ? 3 : 1,
                              keyboardType: f.kind == FieldKind.number || f.kind == FieldKind.money ? const TextInputType.numberWithOptions(decimal: true) : f.kind == FieldKind.phone ? TextInputType.phone : null,
                              inputFormatters: f.kind == FieldKind.money ? [MoneyFormatter()] : f.kind == FieldKind.phone ? [PhoneFormatter()] : null,
                              onChanged: f.kind == FieldKind.phone ? (_) => set(() {}) : null,
                              validator: (v) {
                                final s = (v ?? '').trim();
                                if (f.required && s.isEmpty) return '${f.label} is needed';
                                if ((f.kind == FieldKind.number || f.kind == FieldKind.money) && s.isNotEmpty && double.tryParse(s.replaceAll(',', '')) == null) return 'A number';
                                if (f.kind == FieldKind.date && s.isNotEmpty && !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(s)) return 'YYYY-MM-DD';
                                if (f.kind == FieldKind.phone && s.isNotEmpty && !phoneOk(s)) return 'Not a full phone number (e.g. 0772 123 456)';
                                if (s.isNotEmpty && f.key == 'email' && !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(s)) return 'Not an email address';
                                return s.isEmpty ? null : f.validate?.call(s, now());
                              },
                            ),
                        },
                      ),
                  ]),
                ),
              ),
            ),
            actions: [
              if (delete != null)
                TextButton(
                  key: const Key('record-delete'),
                  style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
                  onPressed: () async {
                    if (!await confirmAction(c, 'Delete this $delete?', 'This cannot be undone.', 'Delete', danger: true, effects: ['this $delete removed on every device'])) return;
                    if (c.mounted) Navigator.pop(c, deleteRecord);
                  },
                  child: const Text('Delete'),
                ),
              TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
              FilledButton(onPressed: submit, child: Text(save)),
            ],
          ),
        );
      },
    ),
  );
}

String _show(Object? v) => v == null ? '' : v is double && v == v.roundToDouble() ? '${v.toInt()}' : '$v';
Object _num(double v) => v == v.roundToDouble() ? v.toInt() : v;

/// A short message at the bottom of the screen.
void say(BuildContext context, String message, {bool error = false}) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? Theme.of(context).colorScheme.error : null));

/// Yes / no question; true when confirmed. danger (D10): what will happen listed ([effects]), Cancel has the focus, the
/// one real red on the button at the right.
Future<bool> confirmAction(BuildContext context, String title, String message, String yes, {bool danger = false, List<String> effects = const []}) async =>
    await showAppDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: dialogSm),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (message.isNotEmpty) Text(message),
            if (effects.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final e in effects)
                Padding(
                  key: ValueKey('dialog-effect-$e'),
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('•  ', style: TextStyle(color: danger ? c.tones.block : null, fontWeight: FontWeight.w800)),
                    Expanded(child: Text(e)),
                  ]),
                ),
            ],
          ]),
        ),
        actions: [
          TextButton(autofocus: danger, onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(
            key: const Key('confirm-yes'),
            style: danger ? FilledButton.styleFrom(backgroundColor: c.tones.block, foregroundColor: Colors.white) : null,
            onPressed: () => Navigator.pop(c, true),
            child: Text(yes),
          ),
        ],
      ),
    ) ??
    false;

/// Studio Grid: on a wide screen, the page sits between fine rule lines with hatched rails beside them.
class _Rails extends StatelessWidget {
  const _Rails({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (_, box) {
        if (box.maxWidth < 1100) return child;
        final line = Theme.of(context).dividerColor;
        return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SizedBox(width: 26, child: RepaintBoundary(child: CustomPaint(painter: _Hatch(line)))),
          Expanded(child: child),
          SizedBox(width: 26, child: RepaintBoundary(child: CustomPaint(painter: _Hatch(line)))),
        ]);
      });
}

class _Hatch extends CustomPainter {
  _Hatch(this.color);
  final Color color;
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()..color = color..strokeWidth = 1;
    c.drawLine(Offset(0, 0), Offset(0, s.height), p);
    c.drawLine(Offset(s.width, 0), Offset(s.width, s.height), p);
    c.save();
    c.clipRect(Offset.zero & s);
    for (var y = -s.width; y < s.height; y += 9) {
      c.drawLine(Offset(0, y + s.width), Offset(s.width, y), p);
    }
    c.restore();
  }

  @override
  bool shouldRepaint(_Hatch o) => o.color != color;
}

/// A page's shape while it loads (2026-11-18: skeletons, not a spinner or a blank page; src/ui.jsx PageSkeleton).
class PageSkeleton extends StatefulWidget {
  const PageSkeleton({super.key});
  @override
  State<PageSkeleton> createState() => _PageSkeletonState();
}

class _PageSkeletonState extends State<PageSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);
  @override
  void dispose() {
    _a.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return LayoutBuilder(builder: (context, box0) => !box0.maxWidth.isFinite || !box0.maxHeight.isFinite
        // somewhere without a page's room (inside a row or a scrolling list): a small spinner as before
        ? const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
        : Semantics(
      label: 'Loading',
      child: AnimatedBuilder(
        animation: _a,
        builder: (context, _) {
          final c = Color.lerp(s.surfaceContainerHigh, s.surfaceContainerHighest, reduce ? 0 : _a.value)!;
          Widget box(double h, {double? w, double r = 12}) => Container(height: h, width: w, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(r)));
          return ListView(key: const Key('page-skeleton'), padding: const EdgeInsets.all(16), physics: const NeverScrollableScrollPhysics(), children: [
            Align(alignment: Alignment.centerLeft, child: box(28, w: 260)),
            const SizedBox(height: 8),
            Align(alignment: Alignment.centerLeft, child: box(14, w: 380)),
            const SizedBox(height: 16),
            Wrap(spacing: 16, runSpacing: 16, children: [for (var i = 0; i < 4; i++) box(104, w: 200, r: 18)]),
            const SizedBox(height: 16),
            for (var i = 0; i < 6; i++) Padding(padding: const EdgeInsets.only(bottom: 10), child: box(16, r: 8)),
          ]);
        },
      ),
    ));
  }
}

/// E5 (as src/forms.jsx rangePresets): Today, Yesterday, 7 days, This month, Last month: (id, label, from, to)
List<(String, String, String, String)> rangePresets([DateTime? now]) {
  final n = now ?? DateTime.now();
  String ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String day(int k) => ymd(DateTime(n.year, n.month, n.day + k));
  return [
    ('today', 'Today', day(0), day(0)), ('yesterday', 'Yesterday', day(-1), day(-1)), ('7d', '7 days', day(-6), day(0)),
    ('month', 'This month', ymd(DateTime(n.year, n.month, 1)), day(0)), ('last', 'Last month', ymd(DateTime(n.year, n.month - 1, 1)), ymd(DateTime(n.year, n.month, 0))),
  ];
}

/// E5: one date-range control everywhere: a quick choice (Today … Last month, All, Custom) and the two dates
class DateRangeBox extends StatelessWidget {
  const DateRangeBox({super.key, required this.from, required this.to, required this.onChanged, this.allowAll = true});
  final String from, to;
  final void Function(String from, String to) onChanged;
  final bool allowAll;
  @override
  Widget build(BuildContext context) {
    final presets = rangePresets();
    final hit = presets.where((p) => p.$3 == from && p.$4 == to).firstOrNull;
    final cur = hit?.$1 ?? (from.isEmpty && to.isEmpty && allowAll ? 'all' : 'custom');
    return Wrap(key: const Key('date-range'), spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
      SizedBox(
        width: 150,
        child: DropdownButtonFormField<String>(
          key: ValueKey('date-range-$cur'),
          initialValue: cur,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Dates', isDense: true),
          items: [
            if (allowAll) const DropdownMenuItem(value: 'all', child: Text('All dates')),
            for (final p in presets) DropdownMenuItem(value: p.$1, child: Text(p.$2)),
            const DropdownMenuItem(value: 'custom', child: Text('Custom')),
          ],
          onChanged: (v) {
            if (v == 'all') onChanged('', '');
            final p = presets.where((x) => x.$1 == v).firstOrNull;
            if (p != null) onChanged(p.$3, p.$4);
          },
        ),
      ),
      DateBox(label: 'From', value: from, onChanged: (v) => onChanged(v, to)),
      DateBox(label: 'To', value: to, onChanged: (v) => onChanged(from, v)),
    ]);
  }
}
