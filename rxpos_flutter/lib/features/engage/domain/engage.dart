// Rules behind the things that help the pharmacy sell and stay on top of the day (src/engage.jsx, src/idleart.jsx):
// quiet hours, alerts announced once per kind per day, the hourly / greeting slots, the outside readings logged every
// 6 hours, and the idle screen's slides (medicines worth recommending mixed with health tips, each with a picture).
import 'package:flutter/material.dart';

import '../../../core/entities/settings.dart';
import '../../../core/rules/health_tips.dart';
import '../../alerts/domain/alerts.dart';
import '../../dashboard/domain/insights.dart';
import '../../storage/domain/weather.dart';

/// Quiet hours (Settings → Alerts & storage; 21:00 to 07:00 unless changed): no pop-ups or chimes.
bool quietNow(PharmacySettings s, DateTime now) {
  final from = (num.tryParse('${s.raw['quietFrom'] ?? ''}') ?? 21).toInt(), to = (num.tryParse('${s.raw['quietTo'] ?? ''}') ?? 7).toInt();
  final h = now.hour;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

/// Greetings at 08:00, 14:00 and 16:00 (morning, afternoon).
const greetSlots = {8, 14, 16};

/// Readings to take (room and fridge) at 06:00, 12:00 and 18:00.
const readingSlots = {6, 12, 18};

/// What has been announced today: {day, keys: {alert key: its count}}. An alert pops up again when its count grows.
({String day, Map<String, int> keys}) announcedToday(Map<String, Object?>? saved, String today) {
  if (saved == null || saved['day'] != today) return (day: today, keys: <String, int>{});
  return (day: today, keys: {for (final e in ((saved['keys'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num?)?.toInt() ?? 0});
}

List<Alert> freshAlerts(List<Alert> alerts, Map<String, int> seen, {required bool selling}) =>
    alerts.where((a) => (seen[a.key] ?? -1) < a.n && (!selling || a.tone == 'danger')).toList();

/// The outside readings from the weather (00, 06, 12, 18 up to now) not yet in the log, as tempLogs records.
List<Map<String, Object?>> weatherReadings(Map? weather, Set<String> have, {required String branch, String placeName = ''}) => [
      for (final r in sixHourReadings(weather))
        if (!have.contains('wx-$branch-${r.time.substring(0, 13)}'))
          {
            'id': 'wx-$branch-${r.time.substring(0, 13)}', 'at': '${r.time}:00', 'place': 'Outside', 'temp': (r.temp * 10).round() / 10,
            'humidity': r.humidity?.round(), 'by': 'Automatic (weather)', 'note': placeName, 'auto': true, 'branchId': branch,
          },
    ];

/// WHO Disease Outbreak News items near Uganda (from the cloud's /api/health-alerts).
List<({String title, String url, String date})> nearAlerts(Map<String, Object?>? j) => [
      for (final x in ((j?['items'] as List?) ?? const []))
        if (x is Map && x['near'] == true) (title: '${x['title']}', url: '${x['url']}', date: '${x['date'] ?? ''}'),
    ];

// ---------- the idle screen ----------
class Slide {
  const Slide.medicine(Insight this.item, {this.headline, this.line}) : tip = null, topic = null, ai = false;
  const Slide.tip(({String text, String source}) this.tip, {this.topic, this.ai = false}) : item = null, headline = null, line = null;
  final Insight? item;
  final ({String text, String source})? tip;
  /// the AI's wording for a medicine today (features/engage/domain/idle_ai.dart), when it picked it
  final String? headline, line;
  /// a tip's picture topic, and whether the AI wrote it (no WHO source then)
  final String? topic;
  final bool ai;
  bool get isTip => tip != null;
  String get id => isTip ? 'tip-${tip!.text.hashCode}' : item!.p.id;
}

/// Interleave the lists so the slideshow mixes kinds, with a health tip after every third medicine (5 tips a day).
List<Slide> slidesFor(({List<Insight> shortExpiry, List<Insight> slow, List<Insight> highValue, List<Insight> highMargin}) ins, DateTime now) {
  final lists = [ins.shortExpiry, ins.highMargin, ins.slow, ins.highValue];
  final items = <Insight>[];
  final seen = <String>{};
  for (var i = 0; i < 10; i++) {
    for (final l in lists) {
      if (i < l.length && seen.add(l[i].p.id)) items.add(l[i]);
    }
  }
  final start = (now.millisecondsSinceEpoch ~/ 86400000) * 3;
  final tips = [for (var i = 0; i < 5; i++) healthTips[(start + i) % healthTips.length]].map((t) => (text: t.$1, source: t.$2)).toList();
  final out = <Slide>[];
  for (final (i, x) in items.take(18).indexed) {
    out.add(Slide.medicine(x));
    if (i % 3 == 2 && tips.isNotEmpty) out.add(Slide.tip(tips.removeAt(0)));
  }
  if (tips.length == 5) out.addAll(tips.take(items.isNotEmpty ? 2 : 5).map(Slide.tip)); // few medicines: still some tips
  return out;
}

const slideKinds = {
  'expiry': ('Sell first', Icons.hourglass_bottom, Colors.amber),
  'slow': ('Slow mover', Icons.timer_outlined, Colors.deepPurple),
  'value': ('Premium', Icons.diamond_outlined, Colors.teal),
  'margin': ('Top margin', Icons.trending_up, Colors.green),
};

/// A picture of a medicine from its form (src/idleart.jsx ProductArt).
IconData medicineArt(String form, String name) {
  final t = '$form $name'.toLowerCase();
  for (final (re, icon) in [
    (r'inject|infusion|vaccine|vial|ampoule', Icons.vaccines_outlined),
    (r'syrup|suspension|drop|lotion|liquid|mixture|elixir', Icons.local_drink_outlined),
    (r'cream|ointment|gel|cosmetic', Icons.sanitizer_outlined),
    (r'inhal|spray|puff', Icons.air),
    (r'capsule', Icons.medication_outlined),
    (r'sachet|powder|ors|granule', Icons.inventory_2_outlined),
    (r'surgical|device|sundr|bandage|gauze|plaster', Icons.healing_outlined),
  ]) {
    if (RegExp(re).hasMatch(t)) return icon;
  }
  return Icons.medication_liquid_outlined;
}

/// A picture for a health tip's topic (src/idleart.jsx TipArt).
IconData tipArt(String text) {
  final t = text.toLowerCase();
  for (final (re, icon) in [
    (r'mosquito|malaria|net\b', Icons.bug_report_outlined),
    (r'wash|hands|soap|hygiene|toilet', Icons.wash_outlined),
    (r'water|ors|diarrh|drink|hydrat', Icons.water_drop_outlined),
    (r'blood pressure|heart|salt|stroke|smok|alcohol', Icons.monitor_heart_outlined),
    (r'fruit|vegetable|eat|food|sugar|diet', Icons.restaurant_outlined),
    (r'active|walk|exercise|minutes|weight', Icons.directions_walk),
    (r'sleep|rest|mental|stress', Icons.bedtime_outlined),
    (r'vaccin|immunis|hiv|test|condom|screen', Icons.verified_user_outlined),
    (r'child|baby|breast|pregnan|mother', Icons.child_care_outlined),
  ]) {
    if (RegExp(re).hasMatch(t)) return icon;
  }
  return Icons.medication_outlined;
}
