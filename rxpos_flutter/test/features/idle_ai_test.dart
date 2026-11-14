// The idle screen's AI (features/engage/domain/idle_ai.dart, src/components/idleAi.js): picture subjects, today's
// cards kept on the device, and the AI's picks and tips placed first. Fictional medicines.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/features/engage/domain/engage.dart';
import 'package:rxpos/features/engage/domain/idle_ai.dart';

Slide med(String id, String name, String kind) => Slide.medicine((kind: kind, p: Product.fromRecord({'id': id, 'name': name, 'price': 1000}), note: '', staff: ''));

void main() {
  test('health tips map to a picture topic; medicines to their therapeutic area', () {
    expect(tipTopic('Sleep under a treated mosquito net'), 'net');
    expect(tipTopic('Wash your hands with soap'), 'hands');
    expect(tipTopic('Something else entirely'), 'medicine');
    expect(productSubject(Product.fromRecord({'id': 'a', 'name': 'Amoxil 500mg', 'generic': 'Amoxicillin'})), 'Anti-infectives');
    expect(toneOf(med('a', 'A', 'expiry')), 'amber');
    expect(subjectOf(const Slide.tip((text: 'Drink clean water', source: 'WHO'))), 'tip:water');
  });

  test('today\'s cards round-trip on the device; bad data is no cards', () {
    final c = IdleCards.fromJson({'day': '2026-11-14', 'cards': [{'id': 'p2', 'headline': 'Soothe a cough', 'line': 'Ask our pharmacist.'}, {'id': '', 'headline': 'x'}], 'tips': [{'text': 'Rest well', 'topic': 'sleep'}]});
    final back = IdleCards.parse(c.encode());
    expect((back.day, back.cards.length, back.cards.first.headline, back.tips.single.topic), ('2026-11-14', 1, 'Soothe a cough', 'sleep'));
    expect(IdleCards.parse('not json').cards, isEmpty);
    expect(IdleCards.parse(null).day, '');
  });

  test('the AI picks come first with their wording, its tip before the WHO tips; no AI leaves the slides as they were', () {
    final slides = [med('p1', 'One', 'expiry'), med('p2', 'Two', 'slow'), med('p3', 'Three', 'margin'), const Slide.tip((text: 'WHO tip', source: 'WHO')), med('p4', 'Four', 'value')];
    expect(identical(withAi(slides, IdleCards.empty), slides), isTrue);
    final out = withAi(slides, const IdleCards(day: 'd', cards: [(id: 'p3', headline: 'Pick', line: 'Line'), (id: 'gone', headline: 'X', line: 'Y')], tips: [(text: 'AI tip', topic: 'net')]));
    expect(out.first.item!.p.id, 'p3');
    expect((out.first.headline, out.first.line), ('Pick', 'Line'));
    expect(out.where((s) => !s.isTip).map((s) => s.item!.p.id), ['p3', 'p1', 'p2', 'p4'], reason: 'an id the AI made up is ignored; every medicine stays');
    final tips = out.where((s) => s.isTip).toList();
    expect((tips.first.tip!.text, tips.first.ai, tips.first.topic), ('AI tip', true, 'net'));
    expect(idleCandidates(slides).map((c) => c['id']), ['p1', 'p2', 'p3', 'p4']);
  });
}
