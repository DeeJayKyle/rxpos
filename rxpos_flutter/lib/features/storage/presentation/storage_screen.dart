// Weather & Storage (src/pages/Storage.jsx): the weather outside with advice for medicine storage, the last reading
// for each place, a trend chart with the safe range shaded, every reading (delete one), and recording a reading.
// Out-of-range readings stand out and go in the audit log. The weather card is also on the dashboard.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/entities/settings.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/dates.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../../extras/domain/extras.dart';
import '../application/weather_controller.dart';
import '../domain/weather.dart';

const places = [('Room', Icons.warehouse_outlined), ('Fridge', Icons.ac_unit), ('Store', Icons.inventory_2_outlined), ('Outside', Icons.wb_sunny_outlined)];

String _n(num v) => v == v.roundToDouble() ? '${v.round()}' : '$v';
num? _hum(Map r) => r['humidity'] is num ? r['humidity'] as num : num.tryParse('${r['humidity'] ?? ''}');
double _temp(Map r) => ((r['temp'] as num?) ?? num.tryParse('${r['temp']}') ?? 0).toDouble();
bool readingOk(Map r, PharmacySettings s) => tempInRange('${r['place']}', _temp(r), s, _hum(r));

String _when(String at, {bool short = false}) {
  final d = DateTime.tryParse(at)?.toLocal();
  if (d == null) return at;
  String p(int v) => v.toString().padLeft(2, '0');
  return '${short ? '${p(d.day)}/${p(d.month)}' : localDate(d)} ${p(d.hour)}:${p(d.minute)}';
}

/// The weather where the device is, with advice for storing medicines. [compact] on the dashboard: hidden when it has
/// nothing to show.
class WeatherCard extends ConsumerWidget {
  const WeatherCard({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final w = ref.watch(weatherProvider);
    final s = ref.watch(pharmacyProvider).value?.settings;
    final t = Theme.of(context);
    final cur = w.current;
    if (compact && cur == null && w.error.isNotEmpty) return const SizedBox.shrink();
    final (label, icon) = describeWeather(cur?['weather_code'] as num?);
    final advice = s == null ? const <(String, String)>[] : storageAdvice(cur, storageLimits(s));
    final daily = w.data?['daily'] as Map?;
    num? first(String k) => (daily?[k] as List?)?.firstOrNull as num?;
    Widget meta(IconData i, String text) => Row(mainAxisSize: MainAxisSize.min, children: [Icon(i, size: 14), const SizedBox(width: 4), Text(text, style: t.textTheme.bodySmall)]);
    void refresh() => ref.read(weatherProvider.notifier).refresh(force: true);
    return Card(
      key: const Key('weather-card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            const Icon(Icons.place_outlined, size: 16),
            const SizedBox(width: 4),
            Expanded(child: Text(w.place?.name.isNotEmpty == true ? '${w.place!.name}${w.place!.source == 'gps' ? ' · GPS' : ''}' : 'Finding your location…', style: t.textTheme.titleSmall, overflow: TextOverflow.ellipsis)),
            if (!compact) IconButton(tooltip: 'Refresh', onPressed: refresh, icon: const Icon(Icons.refresh, size: 18)),
          ]),
          if (cur != null) ...[
            Row(children: [
              Icon(icon, size: compact ? 40 : 54),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${(cur['temperature_2m'] as num? ?? 0).round()}°C', style: t.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                  Text('$label · feels ${(cur['apparent_temperature'] as num? ?? 0).round()}°C', style: t.textTheme.bodySmall),
                ]),
              ),
            ]),
            const SizedBox(height: 6),
            Wrap(spacing: 12, runSpacing: 4, children: [
              meta(Icons.water_drop_outlined, '${cur['relative_humidity_2m']}% humidity'),
              meta(Icons.air, '${(cur['wind_speed_10m'] as num? ?? 0).round()} km/h'),
              if (first('temperature_2m_min') != null) meta(Icons.thermostat, '${first('temperature_2m_min')!.round()}° / ${first('temperature_2m_max')?.round()}°'),
              if (first('precipitation_probability_max') != null) meta(Icons.umbrella_outlined, '${first('precipitation_probability_max')}% rain'),
            ]),
            for (final (tone, text) in advice)
              Container(
                margin: const EdgeInsets.only(top: 6),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: (tone == 'danger' ? t.colorScheme.error : Colors.orange).withValues(alpha: .12), borderRadius: BorderRadius.circular(8)),
                child: Row(children: [Icon(Icons.warning_amber, size: 14, color: tone == 'danger' ? t.colorScheme.error : Colors.orange.shade800), const SizedBox(width: 6), Expanded(child: Text(text, style: t.textTheme.bodySmall))]),
              ),
            if (w.error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(w.error, style: t.textTheme.bodySmall)),
          ] else if (w.error.isNotEmpty)
            Row(children: [
              Expanded(child: Text(w.error, style: t.textTheme.bodySmall)),
              TextButton.icon(onPressed: refresh, icon: const Icon(Icons.refresh, size: 16), label: const Text('Try again')),
            ])
          else
            const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: LinearProgressIndicator(semanticsLabel: 'Loading weather')),
        ]),
      ),
    );
  }
}

/// The last 30 readings of a place; the safe range shaded, out-of-range readings in red.
class TempTrend extends StatelessWidget {
  const TempTrend({super.key, required this.points, required this.lo, required this.hi, required this.min, required this.max});
  final List<(double, bool)> points;
  final double? lo, hi;
  final double min, max;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    if (points.length < 2) return Padding(padding: const EdgeInsets.all(12), child: Text('Record at least two readings to see the trend.', style: t.textTheme.bodySmall));
    return SizedBox(
      height: 120,
      width: double.infinity,
      child: CustomPaint(
        key: const Key('temp-trend'),
        painter: _TrendPainter(points, lo, hi, min, max, t.colorScheme.primary, t.colorScheme.error, Colors.green.withValues(alpha: .14)),
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.points, this.lo, this.hi, this.min, this.max, this.line, this.bad, this.band);
  final List<(double, bool)> points;
  final double? lo, hi;
  final double min, max;
  final Color line, bad, band;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 6.0;
    final span = math.max(max - min, 1);
    double x(int i) => pad + i / (points.length - 1) * (size.width - pad * 2);
    double y(double v) => size.height - pad - (v - min) / span * (size.height - pad * 2);
    if (lo != null && hi != null) canvas.drawRect(Rect.fromLTRB(0, y(hi!), size.width, math.max(y(lo!), y(hi!))), Paint()..color = band);
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      i == 0 ? path.moveTo(x(i), y(points[i].$1)) : path.lineTo(x(i), y(points[i].$1));
    }
    canvas.drawPath(path, Paint()..color = line..style = PaintingStyle.stroke..strokeWidth = 2);
    for (var i = 0; i < points.length; i++) {
      canvas.drawCircle(Offset(x(i), y(points[i].$1)), 3.5, Paint()..color = points[i].$2 ? bad : line);
    }
  }

  @override
  bool shouldRepaint(_TrendPainter o) => o.points != points || o.lo != lo || o.hi != hi;
}

class StorageScreen extends ConsumerStatefulWidget {
  const StorageScreen({super.key});
  @override
  ConsumerState<StorageScreen> createState() => _StorageScreenState();
}

class _StorageScreenState extends ConsumerState<StorageScreen> {
  String _place = 'Fridge';

  Future<void> _record(PharmacySettings st, String branch) async {
    final v = await showDialog<Map<String, Object?>>(context: context, builder: (_) => _ReadingDialog(place: _place));
    if (v == null) return;
    final by = (await ref.read(sessionControllerProvider.future))?.userName ?? '';
    final l = storageLimits(st);
    late Map<String, Object?> rec;
    await ref.read(recordStoreProvider).update((x) {
      rec = {'id': uid(), 'at': x.now, 'place': v['place'], 'temp': v['temp'], 'humidity': v['humidity'], 'note': v['note'], 'by': by, 'branchId': branch};
      x.put('tempLogs', rec);
      if (!readingOk(rec, st)) x.audit(by, 'Storage temperature out of range', '${rec['place']} ${_n(rec['temp']! as num)}°C', branch);
    });
    if (!mounted) return;
    final ok = readingOk(rec, st);
    say(context, ok ? 'Reading saved' : 'Out of range! ${rec['place']} should be ${rec['place'] == 'Fridge' ? '${_n(l.fridgeMin)}–${_n(l.fridgeMax)}' : 'below ${_n(l.roomMax)}'}°C', error: !ok);
  }

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(tableProvider('tempLogs')).value;
    final d = ref.watch(pharmacyProvider).value;
    if (rows == null || d == null) return const Center(child: CircularProgressIndicator());
    final t = Theme.of(context);
    final st = d.settings;
    final l = storageLimits(st);
    final logs = rows.where((r) => (r['branchId'] ?? 'main') == d.branch).toList()..sort((a, b) => '${a['at']}'.compareTo('${b['at']}'));
    final series = logs.where((r) => r['place'] == _place).toList();
    final last30 = series.sublist(math.max(0, series.length - 30));
    final todays = logs.where((r) => dayOf('${r['at']}') == today()).length;
    final bad = logs.where((r) => !readingOk(r, st)).length;
    Map<String, Object?>? lastOf(String p) => logs.lastWhere((r) => r['place'] == p, orElse: () => const {}).isEmpty ? null : logs.lastWhere((r) => r['place'] == p);
    final fridge = _place == 'Fridge';
    final temps = [for (final r in last30) _temp(r)];

    Widget stat(String label, String value, String sub, IconData icon, Color tone) => SizedBox(
          width: 220,
          child: Card(
            child: ListTile(
              leading: Icon(icon, color: tone),
              title: Text(value, style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: tone)),
              subtitle: Text('$label\n$sub', style: t.textTheme.bodySmall),
              isThreeLine: true,
            ),
          ),
        );

    final stats = Wrap(children: [
      for (final (p, icon) in places)
        () {
          final r = lastOf(p);
          final h = r == null ? null : _hum(r);
          return stat('$p · last reading', r == null ? '—' : '${_n(_temp(r))}°C', r == null ? 'no readings yet' : '${_when('${r['at']}', short: true)}${h != null ? ' · ${_n(h)}% RH' : ''}', icon,
              r != null && !readingOk(r, st) ? t.colorScheme.error : Colors.teal);
        }(),
      stat('Readings today', '$todays', bad > 0 ? '$bad out of range in total' : 'all within range', Icons.thermostat, bad > 0 ? Colors.orange.shade800 : Colors.deepPurple),
    ]);

    final trend = Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 12, runSpacing: 8, children: [
            Text('Trend', style: t.textTheme.titleMedium),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [for (final (p, _) in places) ButtonSegment(value: p, label: Text(p))],
              selected: {_place},
              onSelectionChanged: (v) => setState(() => _place = v.first),
            ),
          ]),
          const SizedBox(height: 8),
          TempTrend(
            points: [for (final r in last30) (_temp(r), !readingOk(r, st))],
            lo: fridge ? l.fridgeMin : l.roomMin,
            hi: fridge ? l.fridgeMax : l.roomMax,
            min: [...temps, fridge ? l.fridgeMin - 2 : l.roomMin - 3].reduce(math.min),
            max: [...temps, fridge ? l.fridgeMax + 2 : l.roomMax + 3].reduce(math.max),
          ),
          const SizedBox(height: 8),
          Text(
            'Safe range shaded: fridge ${_n(l.fridgeMin)}–${_n(l.fridgeMax)}°C, room ${_n(l.roomMin)}–${_n(l.roomMax)}°C, humidity up to ${_n(l.humidityMax)}%. '
            'Change these in Settings → Alerts & storage. Outside temperature and humidity are logged automatically every 6 hours (00:00, 06:00, 12:00, 18:00); '
            'RxPOS reminds you to record the room and fridge at 06:00, 12:00 and 18:00.',
            style: t.textTheme.bodySmall,
          ),
        ]),
      ),
    );

    final list = Card(
      child: logs.isEmpty
          ? const Padding(padding: EdgeInsets.all(16), child: EmptyState('No readings yet. Record the fridge and room temperature twice a day.'))
          : Column(children: [
              for (final r in logs.reversed.take(200))
                ListTile(
                  key: ValueKey('reading-${r['id']}'),
                  dense: true,
                  tileColor: readingOk(r, st) ? null : t.colorScheme.error.withValues(alpha: .08),
                  leading: Icon(readingOk(r, st) ? Icons.check_circle_outline : Icons.warning_amber, color: readingOk(r, st) ? Colors.green : t.colorScheme.error),
                  title: Text('${r['place']} · ${_n(_temp(r))}°C${_hum(r) == null ? '' : ' · ${_n(_hum(r)!)}%'}'),
                  subtitle: Text([_when('${r['at']}'), '${r['by'] ?? ''}', '${r['note'] ?? ''}'].where((x) => x.isNotEmpty).join(' · ')),
                  trailing: IconButton(
                    tooltip: 'Delete',
                    icon: const Icon(Icons.delete_outline, size: 18),
                    onPressed: () async {
                      if (!await confirmAction(context, 'Delete this reading?', '${r['place']} ${_n(_temp(r))}°C · ${_when('${r['at']}')}', 'Delete')) return;
                      await ref.read(recordStoreProvider).update((x) => x.del('tempLogs', '${r['id']}'));
                    },
                  ),
                ),
            ]),
    );

    return PageFrame(
      title: 'Weather & Storage',
      subtitle: 'The weather outside, plus your fridge and room readings to keep the cold chain safe',
      actions: [FilledButton.icon(onPressed: () => _record(st, d.branch), icon: const Icon(Icons.add), label: const Text('Record reading'))],
      child: LayoutBuilder(
        builder: (context, c) => ListView(key: const Key('storage-page'), children: [
          if (c.maxWidth >= 900)
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [if (d.features['weather'] != false) const Expanded(child: WeatherCard()), Expanded(child: stats)])
          else ...[if (d.features['weather'] != false) const WeatherCard(), stats],
          trend,
          list,
        ]),
      ),
    );
  }
}

class _ReadingDialog extends StatefulWidget {
  const _ReadingDialog({required this.place});
  final String place;
  @override
  State<_ReadingDialog> createState() => _ReadingDialogState();
}

class _ReadingDialogState extends State<_ReadingDialog> {
  late String _place = widget.place;
  final _temp = TextEditingController(), _hum = TextEditingController(), _note = TextEditingController();
  final _form = GlobalKey<FormState>();

  @override
  void dispose() {
    for (final c in [_temp, _hum, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  num? _num(String s) => num.tryParse(s.trim().replaceAll(',', '.'));

  void _save() {
    if (!_form.currentState!.validate()) return;
    final h = _hum.text.trim().isEmpty ? null : _num(_hum.text);
    Navigator.pop(context, {'place': _place, 'temp': _num(_temp.text), 'humidity': h, 'note': _note.text.trim()});
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Record a temperature reading'),
        content: SizedBox(
          width: 420,
          child: Form(
            key: _form,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<String>(
                  key: const Key('reading-place'),
                  isExpanded: true,
                  initialValue: _place,
                  decoration: const InputDecoration(labelText: 'Where'),
                  items: [for (final (p, _) in places) DropdownMenuItem(value: p, child: Text(p))],
                  onChanged: (v) => setState(() => _place = v ?? _place),
                ),
                TextFormField(
                  key: const Key('reading-temp'),
                  controller: _temp,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'Temperature (°C)'),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  validator: (s) => _num(s ?? '') == null ? 'A number' : null,
                ),
                TextFormField(
                  key: const Key('reading-humidity'),
                  controller: _hum,
                  decoration: const InputDecoration(labelText: 'Humidity (%) – optional'),
                  keyboardType: TextInputType.number,
                  validator: (s) {
                    if ((s ?? '').trim().isEmpty) return null;
                    final v = _num(s!);
                    return v == null || v < 0 || v > 100 ? 'From 0 to 100' : null;
                  },
                ),
                TextFormField(key: const Key('reading-note'), controller: _note, decoration: const InputDecoration(labelText: 'Note', hintText: 'e.g. power cut 2 h'), onFieldSubmitted: (_) => _save()),
              ]),
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: _save, child: const Text('Save reading')),
        ],
      );
}
