// AI for the idle screen (src/components/idleAi.js, worker/ai-routes.js idleRoutes): which medicines to feature today
// and their wording (POST /api/ai/idle-cards, once a day), a few seasonal health tips, and an illustration per topic
// (POST /api/ai/idle-image, kept on this device). All optional: offline, unlinked, AI switched off or a hub without
// AI, the screen shows its own picks, the WHO health tips and the drawn pictures as before.
import 'dart:convert';

import '../../../core/entities/product.dart';
import '../../../core/rules/drug_class.dart';
import 'engage.dart';

/// The picture subject of a health tip (worker IDLE_SUBJECTS 'tip:…')
String tipTopic(String text) {
  final t = text.toLowerCase();
  const rules = [
    (r'mosquito|malaria|net\b', 'net'), (r'wash|hands|soap|hygiene|toilet', 'hands'), (r'water|ors|diarrh|drink|hydrat', 'water'),
    (r'blood pressure|heart|salt|stroke|smok|alcohol', 'heart'), (r'fruit|vegetable|eat|food|sugar|diet', 'food'), (r'active|walk|exercise|minutes|weight', 'walk'),
    (r'sleep|rest|mental|stress', 'sleep'), (r'vaccin|immunis|hiv|test|condom|screen', 'shield'), (r'child|baby|breast|pregnan|mother', 'baby'),
  ];
  for (final (re, topic) in rules) {
    if (RegExp(re).hasMatch(t)) return topic;
  }
  return 'medicine';
}

/// The picture subject of a medicine: its therapeutic area
String productSubject(Product p) => drugClassOf(p).area;

/// The subject a slide's picture shows
String subjectOf(Slide s) => s.isTip ? 'tip:${s.topic ?? tipTopic(s.tip!.text)}' : productSubject(s.item!.p);

/// The worker's colour names for the slide kinds
String toneOf(Slide s) => s.isTip ? 'sky' : const {'expiry': 'amber', 'slow': 'violet', 'value': 'teal', 'margin': 'green'}[s.item!.kind] ?? 'teal';

/// Today's AI cards: the medicines it picked (in order) with a headline and a line each, and seasonal tips
class IdleCards {
  const IdleCards({this.day = '', this.cards = const [], this.tips = const []});
  final String day;
  final List<({String id, String headline, String line})> cards;
  final List<({String text, String topic})> tips;

  static const empty = IdleCards();

  factory IdleCards.fromJson(Map<String, Object?> j) => IdleCards(
        day: '${j['day'] ?? ''}',
        cards: [
          for (final c in (j['cards'] as List? ?? const []))
            if (c is Map && '${c['id'] ?? ''}'.isNotEmpty && '${c['headline'] ?? ''}'.isNotEmpty) (id: '${c['id']}', headline: '${c['headline']}', line: '${c['line'] ?? ''}'),
        ],
        tips: [
          for (final t in (j['tips'] as List? ?? const []))
            if (t is Map && '${t['text'] ?? ''}'.isNotEmpty) (text: '${t['text']}', topic: '${t['topic'] ?? 'medicine'}'),
        ],
      );

  static IdleCards parse(String? raw) {
    if (raw == null || raw.isEmpty) return empty;
    try {
      return IdleCards.fromJson((jsonDecode(raw) as Map).cast<String, Object?>());
    } catch (_) {
      return empty;
    }
  }

  String encode() => jsonEncode({
        'day': day,
        'cards': [for (final c in cards) {'id': c.id, 'headline': c.headline, 'line': c.line}],
        'tips': [for (final t in tips) {'text': t.text, 'topic': t.topic}],
      });
}

/// What the AI may pick from: the medicines on the screen (customer-safe only: insights.dart isFeaturable)
List<Map<String, Object?>> idleCandidates(List<Slide> slides) => [
      for (final s in slides.where((s) => !s.isTip).take(40))
        {'id': s.item!.p.id, 'name': s.item!.p.name, 'generic': s.item!.p.generic, 'form': s.item!.p.form, 'area': productSubject(s.item!.p), 'kind': s.item!.kind, 'note': s.item!.note},
    ];

/// The slides with the AI's picks first (with its wording), then the rest; its tips before the WHO tips; a tip
/// after every third medicine, as slidesFor
List<Slide> withAi(List<Slide> slides, IdleCards ai) {
  if (ai.cards.isEmpty && ai.tips.isEmpty) return slides;
  final meds = [for (final s in slides) if (!s.isTip) s];
  final byId = {for (final s in meds) s.item!.p.id: s};
  final picked = [
    for (final c in ai.cards)
      if (byId[c.id] != null) Slide.medicine(byId[c.id]!.item!, headline: c.headline, line: c.line),
  ];
  final pickedIds = {for (final s in picked) s.item!.p.id};
  final items = [...picked, ...meds.where((s) => !pickedIds.contains(s.item!.p.id))];
  final tips = [
    for (final t in ai.tips.take(2)) Slide.tip((text: t.text, source: ''), topic: t.topic, ai: true),
    ...slides.where((s) => s.isTip),
  ].take(5).toList();
  final out = <Slide>[];
  for (final (i, x) in items.take(18).indexed) {
    out.add(x);
    if (i % 3 == 2 && tips.isNotEmpty) out.add(tips.removeAt(0));
  }
  if (items.length < 3) out.addAll(tips.take(items.isNotEmpty ? 2 : 5));
  return out;
}

/// The day key of today (UTC date, as the React app)
String idleDay([DateTime? now]) => (now ?? DateTime.now()).toUtc().toIso8601String().substring(0, 10);
