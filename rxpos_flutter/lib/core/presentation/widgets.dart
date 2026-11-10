// Pieces every screen uses: a page with a title and actions, figure cards, a search box, an empty state, a record form,
// money formatted in the pharmacy's currency.
import 'package:flutter/material.dart';

import '../entities/settings.dart';
import '../theme/themes.dart';
import '../rules/money.dart';

extension Money on PharmacySettings {
  String money(num n) => formatMoney(n, currency: currency, decimals: decimalPlaces, locale: locale);
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
    Widget body(Widget c) => tk.rails ? _Rails(child: c) : c;
    if (scroll) {
      return body(ListView(padding: const EdgeInsets.only(bottom: 24), children: [head, Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: child)]));
    }
    return body(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [head, Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: child))]));
  }
}

/// A figure with its label (and a line under it); tappable when [onTap] is set.
class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.sub, this.icon, this.color, this.onTap});
  final String label, value;
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
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 200, maxWidth: 250),
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        color: tinted ? wash : null,
        shape: tinted ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.extension<DesignTokens>()!.radius), side: BorderSide(color: tone.withValues(alpha: .28))) : null,
        child: Ink(
          decoration: vivid ? BoxDecoration(gradient: LinearGradient(colors: [va, vb], begin: Alignment.topLeft, end: Alignment.bottomRight)) : null,
          child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(label.toUpperCase(), style: t.textTheme.labelSmall?.copyWith(letterSpacing: .6, fontWeight: FontWeight.w700, color: ink))),
                if (icon != null)
                  tinted
                      ? Container(padding: const EdgeInsets.all(7), decoration: BoxDecoration(color: tone.withValues(alpha: .14), borderRadius: BorderRadius.circular(10)),
                          child: Icon(icon, size: 20, color: shown ?? t.colorScheme.tertiary))
                      : Icon(icon, size: 20, color: ink ?? shown ?? t.colorScheme.primary),
              ]),
              const SizedBox(height: 6),
              Text(value, style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: ink ?? shown)),
              if (sub != null || onTap != null)
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Expanded(child: Text(sub ?? '', style: t.textTheme.bodySmall?.copyWith(color: ink?.withValues(alpha: .9)))),
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
        final cols = ((w + spacing) / (minWidth + spacing)).floor().clamp(1, cards == 0 ? 1 : cards);
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
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 40, color: Theme.of(context).disabledColor), const SizedBox(height: 8), Text(text, textAlign: TextAlign.center)]),
        ),
      );
}

/// One field of a [RecordForm].
class FormFieldSpec {
  const FormFieldSpec(this.key, this.label, {this.kind = FieldKind.text, this.required = false, this.options = const [], this.hint});
  final String key, label;
  final FieldKind kind;
  final bool required;
  /// for [FieldKind.choice]: (value, label)
  final List<(String, String)> options;
  final String? hint;
}

enum FieldKind { text, number, multiline, choice, flag, date }

/// What [editRecord] returns when its Delete button is pressed (and the deletion confirmed).
const deleteRecord = {'_delete': true};

/// A dialog that edits a record's fields and returns the edited values (null when cancelled). With [delete] (the
/// record's name, e.g. 'medicine'), a Delete button asks "Delete this medicine?" and then returns [deleteRecord].
Future<Map<String, Object?>?> editRecord(BuildContext context, {required String title, required List<FormFieldSpec> fields,
    Map<String, Object?> initial = const {}, String save = 'Save', String? delete}) {
  final values = Map<String, Object?>.of(initial);
  final ctl = {for (final f in fields) if (f.kind != FieldKind.choice && f.kind != FieldKind.flag) f.key: TextEditingController(text: _show(initial[f.key]))};
  final formKey = GlobalKey<FormState>();
  return showDialog<Map<String, Object?>>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, set) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 460,
          child: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                for (final f in fields)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: switch (f.kind) {
                      FieldKind.flag => SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(f.label), value: values[f.key] == true, onChanged: (v) => set(() => values[f.key] = v)),
                      FieldKind.choice => DropdownButtonFormField<String>(
                          initialValue: f.options.any((o) => o.$1 == values[f.key]) ? values[f.key] as String : null,
                          decoration: InputDecoration(labelText: f.label),
                          // the field's full width; a long choice ends in "…" instead of running off the edge
                          isExpanded: true,
                          items: [for (final o in f.options) DropdownMenuItem(value: o.$1, child: Text(o.$2, maxLines: 1, overflow: TextOverflow.ellipsis))],
                          validator: (v) => f.required && v == null ? 'Choose ${f.label.toLowerCase()}' : null,
                          onChanged: (v) => values[f.key] = v,
                        ),
                      _ => TextFormField(
                          controller: ctl[f.key],
                          decoration: InputDecoration(labelText: f.label, hintText: f.hint ?? (f.kind == FieldKind.date ? 'YYYY-MM-DD' : null)),
                          maxLines: f.kind == FieldKind.multiline ? 3 : 1,
                          keyboardType: f.kind == FieldKind.number ? const TextInputType.numberWithOptions(decimal: true) : null,
                          validator: (v) {
                            final s = (v ?? '').trim();
                            if (f.required && s.isEmpty) return 'Required';
                            if (f.kind == FieldKind.number && s.isNotEmpty && double.tryParse(s.replaceAll(',', '')) == null) return 'A number';
                            if (f.kind == FieldKind.date && s.isNotEmpty && !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(s)) return 'YYYY-MM-DD';
                            return null;
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
                if (!await confirmAction(c, 'Delete this $delete?', 'This cannot be undone.', 'Delete')) return;
                if (c.mounted) Navigator.pop(c, deleteRecord);
              },
              child: const Text('Delete'),
            ),
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (!(formKey.currentState?.validate() ?? false)) return;
              for (final f in fields) {
                final x = ctl[f.key];
                if (x == null) continue;
                final s = x.text.trim();
                values[f.key] = f.kind == FieldKind.number ? (s.isEmpty ? 0 : _num(double.parse(s.replaceAll(',', '')))) : s;
              }
              Navigator.pop(c, values);
            },
            child: Text(save),
          ),
        ],
      ),
    ),
  );
}

String _show(Object? v) => v == null ? '' : v is double && v == v.roundToDouble() ? '${v.toInt()}' : '$v';
Object _num(double v) => v == v.roundToDouble() ? v.toInt() : v;

/// A short message at the bottom of the screen.
void say(BuildContext context, String message, {bool error = false}) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? Theme.of(context).colorScheme.error : null));

/// Yes / no question; true when confirmed.
Future<bool> confirmAction(BuildContext context, String title, String message, String yes) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(title: Text(title), content: Text(message), actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(yes)),
      ]),
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
