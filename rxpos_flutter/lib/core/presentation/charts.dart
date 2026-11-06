// Charts drawn by hand (src/charts.jsx, the bar chart and donut of src/ui.jsx / Reports): one colour per meaning (money
// in teal, purchases orange, expenses red, gross profit violet), the value axis always starts at 0, and today is
// drawn as "so far" (a dashed end), so an unfinished day never looks like a collapse.
import 'dart:math';

import 'package:flutter/material.dart';

const moneyIn = Color(0xFF0D9488), purchasesColor = Color(0xFFEA580C), expensesColor = Color(0xFFDC2626), profitColor = Color(0xFF7C3AED);
const shareColors = [Color(0xFF0D9488), Color(0xFF7C3AED), Color(0xFFEA580C), Color(0xFF2563EB), Color(0xFFDB2777)];

/// A round axis maximum (1, 2, 2.5, 5, 10 × 10ⁿ at or above [v]).
double niceMax(double v) {
  if (v <= 0) return 1;
  final p = pow(10, (log(v) / ln10).floor()).toDouble();
  return [1, 2, 2.5, 5, 10].map((m) => m * p).firstWhere((m) => m >= v);
}

/// 1.2k, 3.4M: short numbers for an axis.
String compact(double v) {
  final a = v.abs();
  String f(double x) => x == x.roundToDouble() ? '${x.toInt()}' : x.toStringAsFixed(1);
  if (a >= 1e9) return '${f(v / 1e9)}B';
  if (a >= 1e6) return '${f(v / 1e6)}M';
  if (a >= 1e3) return '${f(v / 1e3)}k';
  return f(v);
}

const _monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
String _day(String k) => '${int.parse(k.substring(8, 10))} ${_monthNames[int.parse(k.substring(5, 7)) - 1]}';

/// The axis text of the chart being painted: the app's font and its readable muted colour (AA on light and dark
/// themes), set by each chart as it builds.
TextStyle _axis = const TextStyle(color: Color(0xFF6B7280));

void _axisFrom(BuildContext context) {
  final t = Theme.of(context);
  _axis = (t.textTheme.labelSmall ?? const TextStyle()).copyWith(color: t.colorScheme.onSurfaceVariant, fontFeatures: const [FontFeature.tabularFigures()]);
}

void _text(Canvas c, String s, Offset at, {Color? color, double size = 10, TextAlign align = TextAlign.left}) {
  final tp = TextPainter(text: TextSpan(text: s, style: _axis.copyWith(color: color, fontSize: size)), textDirection: TextDirection.ltr)..layout();
  final dx = switch (align) { TextAlign.right || TextAlign.end => -tp.width, TextAlign.center => -tp.width / 2, _ => 0.0 };
  tp.paint(c, at + Offset(dx, -tp.height / 2));
}

/// Daily sales over the last [days] (keys oldest first, the last one is today). Tap a day to open it.
class DailyTrend extends StatefulWidget {
  const DailyTrend({super.key, required this.byDay, required this.keysFor, required this.money, this.onDay});
  final Map<String, double> byDay;
  /// the day keys for a range (oldest first, today last)
  final List<String> Function(int days) keysFor;
  final String Function(num) money;
  final ValueChanged<String>? onDay;
  @override
  State<DailyTrend> createState() => _DailyTrendState();
}

class _DailyTrendState extends State<DailyTrend> {
  int _range = 30;
  int? _hover;

  @override
  Widget build(BuildContext context) {
    _axisFrom(context);
    final keys = widget.keysFor(_range);
    final vals = [for (final k in keys) widget.byDay[k] ?? 0.0];
    final done = vals.sublist(0, vals.length - 1);
    final total = vals.fold<double>(0, (a, v) => a + v);
    final avg = done.isEmpty ? 0.0 : done.fold<double>(0, (a, v) => a + v) / done.length;
    var best = 0;
    for (var i = 0; i < done.length; i++) {
      if (done[i] > done[best]) best = i;
    }
    final th = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text('Daily sales · last $_range days', style: th.textTheme.titleMedium),
        SegmentedButton<int>(
          segments: const [ButtonSegment(value: 7, label: Text('7 days')), ButtonSegment(value: 30, label: Text('30 days')), ButtonSegment(value: 90, label: Text('90 days'))],
          selected: {_range},
          onSelectionChanged: (v) => setState(() {
            _range = v.first;
            _hover = null;
          }),
        ),
      ]),
      Wrap(spacing: 16, children: [
        Text('Total ${widget.money(total)}'),
        Text('Daily average ${widget.money(avg.round())}'),
        if (done.isNotEmpty && done[best] > 0) Text('Best day ${_day(keys[best])} · ${widget.money(done[best])}'),
      ]),
      const SizedBox(height: 6),
      LayoutBuilder(builder: (_, box) {
        const h = 200.0;
        final w = box.maxWidth;
        int indexAt(double dx) => ((dx - 46) / (w - 60) * (keys.length - 1)).round().clamp(0, keys.length - 1);
        return MouseRegion(
          onExit: (_) => setState(() => _hover = null),
          onHover: (e) => setState(() => _hover = indexAt(e.localPosition.dx)),
          child: GestureDetector(
            onTapUp: (e) => widget.onDay?.call(keys[indexAt(e.localPosition.dx)]),
            child: CustomPaint(size: Size(w, h), painter: _TrendPainter(keys, vals, avg, done.isNotEmpty && done[best] > 0 ? best : null, _hover, th.dividerColor)),
          ),
        );
      }),
      Text(_hover == null
          ? 'Point at a day to see it; tap to open its sales.'
          : '${_day(keys[_hover!])}${_hover == keys.length - 1 ? ' (so far)' : ''} · ${widget.money(vals[_hover!])} · tap to open that day\'s sales',
          style: th.textTheme.bodySmall),
    ]);
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.keys, this.vals, this.avg, this.best, this.hover, this.grid);
  final List<String> keys;
  final List<double> vals;
  final double avg;
  final int? best, hover;
  final Color grid;

  @override
  void paint(Canvas c, Size s) {
    const l = 46.0, r = 14.0, t = 10.0, b = 24.0;
    final n = max(1, keys.length - 1);
    final top = niceMax(vals.fold<double>(0, max));
    double x(int i) => l + i * (s.width - l - r) / n;
    double y(double v) => s.height - b - v / top * (s.height - t - b);
    final gp = Paint()..color = grid..strokeWidth = 1;
    for (final f in [0, .25, .5, .75, 1.0]) {
      c.drawLine(Offset(l, y(top * f)), Offset(s.width - r, y(top * f)), gp);
      _text(c, compact(top * f), Offset(l - 6, y(top * f)), align: TextAlign.right);
    }
    final every = keys.length <= 7 ? 1 : keys.length <= 30 ? 5 : 15;
    for (var i = 0; i < keys.length; i++) {
      if (i % every == 0 || i == n) _text(c, i == n ? 'Today' : _day(keys[i]), Offset(x(i), s.height - 8), align: i == n ? TextAlign.right : i == 0 ? TextAlign.left : TextAlign.center);
    }
    final line = Path();
    for (var i = 0; i < n; i++) {
      i == 0 ? line.moveTo(x(i), y(vals[i])) : line.lineTo(x(i), y(vals[i]));
    }
    if (n > 1) {
      final fill = Path.from(line)..lineTo(x(n - 1), y(0))..lineTo(x(0), y(0))..close();
      c.drawPath(fill, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [moneyIn.withValues(alpha: .28), moneyIn.withValues(alpha: 0)]).createShader(Offset.zero & s));
      c.drawPath(line, Paint()..color = moneyIn..strokeWidth = 2..style = PaintingStyle.stroke);
    }
    // today: a dashed end ("so far")
    final from = Offset(x(n - 1), y(vals[n - 1])), to = Offset(x(n), y(vals[n]));
    for (var k = 0.0; k < 1; k += .2) {
      c.drawLine(Offset.lerp(from, to, k)!, Offset.lerp(from, to, min(1, k + .1))!, Paint()..color = moneyIn..strokeWidth = 2);
    }
    c.drawCircle(to, 4, Paint()..color = moneyIn);
    if (avg > 0) {
      final ap = Paint()..color = Colors.grey..strokeWidth = 1;
      for (var xx = l; xx < s.width - r; xx += 8) {
        c.drawLine(Offset(xx, y(avg)), Offset(min(xx + 4, s.width - r), y(avg)), ap);
      }
      _text(c, 'average', Offset(s.width - r, y(avg) - 8), align: TextAlign.right);
    }
    if (best != null) c.drawCircle(Offset(x(best!), y(vals[best!])), 4.5, Paint()..color = profitColor);
    if (hover != null) {
      c.drawLine(Offset(x(hover!), t), Offset(x(hover!), s.height - b), gp);
      c.drawCircle(Offset(x(hover!), y(vals[hover!])), 4.5, Paint()..color = Colors.black54);
    }
  }

  @override
  bool shouldRepaint(_TrendPainter o) => o.vals != vals || o.hover != hover;
}

/// One line per series over the last 6 or 12 months. [series]: (name, colour, month key → value).
class MonthLines extends StatefulWidget {
  const MonthLines({super.key, required this.series, required this.money, required this.monthKeys});
  final List<(String, Color, Map<String, double>)> series;
  final String Function(num) money;
  /// the last [n] month keys (YYYY-MM), oldest first
  final List<String> Function(int n) monthKeys;
  @override
  State<MonthLines> createState() => _MonthLinesState();
}

class _MonthLinesState extends State<MonthLines> {
  int _months = 6;
  @override
  Widget build(BuildContext context) {
    _axisFrom(context);
    final keys = widget.monthKeys(_months);
    final th = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text('Money in & out, month by month', style: th.textTheme.titleMedium),
        SegmentedButton<int>(
          segments: const [ButtonSegment(value: 6, label: Text('6 months')), ButtonSegment(value: 12, label: Text('12 months'))],
          selected: {_months},
          onSelectionChanged: (v) => setState(() => _months = v.first),
        ),
      ]),
      Wrap(spacing: 12, children: [
        for (final (name, color, _) in widget.series)
          Row(mainAxisSize: MainAxisSize.min, children: [Container(width: 12, height: 3, color: color), const SizedBox(width: 4), Text(name)]),
      ]),
      const SizedBox(height: 6),
      LayoutBuilder(builder: (_, box) => CustomPaint(size: Size(box.maxWidth, 200), painter: _LinesPainter(keys, widget.series, th.dividerColor))),
      for (final (name, _, values) in widget.series)
        Text('$name this month: ${widget.money(values[keys.last] ?? 0)}', style: th.textTheme.bodySmall),
    ]);
  }
}

class _LinesPainter extends CustomPainter {
  _LinesPainter(this.keys, this.series, this.grid);
  final List<String> keys;
  final List<(String, Color, Map<String, double>)> series;
  final Color grid;
  @override
  void paint(Canvas c, Size s) {
    const l = 46.0, r = 14.0, t = 10.0, b = 24.0;
    final all = [for (final (_, _, v) in series) for (final k in keys) v[k] ?? 0.0];
    final lo = min(0.0, all.fold<double>(0, min)), top = niceMax(all.fold<double>(0, max));
    final n = max(1, keys.length - 1);
    double x(int i) => l + i * (s.width - l - r) / n;
    double y(double v) => s.height - b - (v - lo) / (top - lo) * (s.height - t - b);
    final gp = Paint()..color = grid;
    for (final f in [0, .25, .5, .75, 1.0]) {
      final v = lo + (top - lo) * f;
      c.drawLine(Offset(l, y(v)), Offset(s.width - r, y(v)), gp);
      _text(c, compact(v), Offset(l - 6, y(v)), align: TextAlign.right);
    }
    for (var i = 0; i < keys.length; i++) {
      final m = _monthNames[int.parse(keys[i].substring(5, 7)) - 1];
      _text(c, keys.length > 6 && i % 3 != 0 ? m : '$m ${keys[i].substring(2, 4)}', Offset(x(i), s.height - 8),
          align: i == 0 ? TextAlign.left : i == keys.length - 1 ? TextAlign.right : TextAlign.center);
    }
    for (final (_, color, values) in series) {
      final p = Path();
      for (var i = 0; i < keys.length; i++) {
        final pt = Offset(x(i), y(values[keys[i]] ?? 0));
        i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
        c.drawCircle(pt, 3.2, Paint()..color = color);
      }
      c.drawPath(p, Paint()..color = color..strokeWidth = 2..style = PaintingStyle.stroke);
    }
  }

  @override
  bool shouldRepaint(_LinesPainter o) => true;
}

/// Bars, one per label (e.g. daily sales in a report period).
class BarChart extends StatelessWidget {
  const BarChart({super.key, required this.data, required this.money, this.height = 180});
  final List<(String, double)> data;
  final String Function(num) money;
  final double height;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        // (the axis text style is taken in the builder below)
        builder: (_, box) => Tooltip(
          message: data.isEmpty ? '' : 'Highest ${money(data.map((x) => x.$2).reduce(max))}',
          child: CustomPaint(size: Size(box.maxWidth, height), painter: (() {
            _axisFrom(context);
            return _BarsPainter(data, Theme.of(context).dividerColor);
          })()),
        ),
      );
}

class _BarsPainter extends CustomPainter {
  _BarsPainter(this.data, this.grid);
  final List<(String, double)> data;
  final Color grid;
  @override
  void paint(Canvas c, Size s) {
    if (data.isEmpty) return;
    const l = 46.0, r = 8.0, t = 8.0, b = 22.0;
    final top = niceMax(data.map((x) => x.$2).reduce(max));
    double y(double v) => s.height - b - v / top * (s.height - t - b);
    for (final f in [0, .5, 1.0]) {
      c.drawLine(Offset(l, y(top * f)), Offset(s.width - r, y(top * f)), Paint()..color = grid);
      _text(c, compact(top * f), Offset(l - 6, y(top * f)), align: TextAlign.right);
    }
    final w = (s.width - l - r) / data.length;
    final every = max(1, (data.length / 8).ceil());
    for (var i = 0; i < data.length; i++) {
      final x0 = l + i * w;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(x0 + w * .15, y(data[i].$2), x0 + w * .85, y(0)), const Radius.circular(2)), Paint()..color = moneyIn);
      if (i % every == 0) _text(c, data[i].$1.length == 10 ? _day(data[i].$1) : data[i].$1, Offset(x0 + w / 2, s.height - 8), align: TextAlign.center);
    }
  }

  @override
  bool shouldRepaint(_BarsPainter o) => o.data != data;
}

/// The share of each part as a ring (same order and colours as the share bars beside it).
class Donut extends StatelessWidget {
  const Donut({super.key, required this.parts, this.size = 140});
  final List<(String, double)> parts;
  final double size;
  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _DonutPainter(parts));
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.parts);
  final List<(String, double)> parts;
  @override
  void paint(Canvas c, Size s) {
    final total = parts.fold<double>(0, (a, p) => a + p.$2);
    final rect = Rect.fromCircle(center: s.center(Offset.zero), radius: s.width / 2 - 12);
    if (total <= 0) {
      c.drawArc(rect, 0, 2 * pi, false, Paint()..color = Colors.grey.shade300..style = PaintingStyle.stroke..strokeWidth = 22);
      return;
    }
    var a = -pi / 2;
    for (final (i, p) in parts.indexed) {
      final sweep = p.$2 / total * 2 * pi;
      c.drawArc(rect, a, sweep, false, Paint()..color = shareColors[i % shareColors.length]..style = PaintingStyle.stroke..strokeWidth = 22);
      a += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter o) => o.parts != parts;
}

/// A table of shares: name, a bar, the percentage and the amount.
class ShareTable extends StatelessWidget {
  const ShareTable({super.key, required this.parts, required this.money});
  final List<(String, double)> parts;
  final String Function(num) money;
  @override
  Widget build(BuildContext context) {
    _axisFrom(context);
    final all = parts.fold<double>(0, (a, p) => a + p.$2);
    return Column(children: [
      for (final (i, (k, v)) in parts.indexed)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(children: [
            SizedBox(width: 130, child: Text(k.isEmpty ? '—' : k, overflow: TextOverflow.ellipsis)),
            Expanded(child: LinearProgressIndicator(value: all == 0 ? 0 : v / all, color: shareColors[i % shareColors.length], minHeight: 8)),
            SizedBox(width: 44, child: Text('${all == 0 ? 0 : (v / all * 100).round()}%', textAlign: TextAlign.right)),
            SizedBox(width: 120, child: Text(money(v), textAlign: TextAlign.right)),
          ]),
        ),
    ]);
  }
}
