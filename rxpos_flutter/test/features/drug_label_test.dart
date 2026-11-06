// Drug label lookup (src/druglabel.js): names tried, the best label, saved for offline, misses remembered, retries.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/drug_info/domain/drug_label.dart';

Map<String, Object?> label(String generic, {String brand = 'Brand'}) => {
      'openfda': {'generic_name': [generic], 'brand_name': [brand], 'route': ['ORAL'], 'dosage_form': ['CAPSULE']},
      'indications_and_usage': ['Infections   caused by bacteria.'],
      'dosage_and_administration': ['500 mg every 8 hours.'],
    };

void main() {
  test('names worth trying', () {
    expect(genericKey('Amoxicillin 500mg Capsules'), 'amoxicillin');
    expect(genericKey('Amoxicillin + Clavulanic acid 625mg Tabs'), 'amoxicillin');
    expect(lookupKeys('Amoxil 250mg Caps', 'Amoxicillin'), ['amoxicillin', 'amoxil']);
    expect(lookupKeys('X', ''), isEmpty);
  });

  test('the best label and what is kept', () {
    final best = pickBest([label('AMOXICILLIN AND CLAVULANATE'), label('AMOXICILLIN')], 'amoxicillin');
    expect(((best!['openfda'] as Map)['generic_name'] as List).first, 'AMOXICILLIN');
    final info = toInfo(best, 'amoxicillin', '2026-11-05T00:00:00Z');
    expect(info['title'], 'AMOXICILLIN (Brand)');
    expect(info['form'], 'CAPSULE');
    expect(info['sections'], [
      ['Uses', 'Infections caused by bacteria.'],
      ['Dosage & administration', '500 mg every 8 hours.'],
    ]);
  });

  test('saved on the device, fresh for 30 days; a miss is remembered for a day; busy servers are retried', () async {
    final store = <String, Object?>{};
    var now = DateTime.utc(2026, 11, 5);
    final calls = <String>[];
    var answers = <(int, Object?)>[];
    DrugLookup make() => DrugLookup(
          fetch: (url, _) async {
            calls.add(url);
            return answers.removeAt(0);
          },
          get: (k) async => store[k],
          set: (k, v) async => store[k] = v,
          now: () => now,
          backoff: Duration.zero,
        );
    var l = make();
    answers = [(503, null), (200, {'results': [label('AMOXICILLIN')]})];
    final info = await l.refresh('amoxicillin');
    expect(info!['title'], 'AMOXICILLIN (Brand)');
    expect(calls, hasLength(2), reason: 'one retry after a busy answer');
    expect(store['drug:amoxicillin'], isNotNull);

    l = make(); // a new session reads the device's copy
    expect((await l.saved('amoxicillin'))!.fresh, isTrue);
    now = now.add(const Duration(days: 31));
    expect((await make().saved('amoxicillin'))!.fresh, isFalse);

    answers = [(404, null)];
    expect(await l.refresh('zzzlocal'), isNull);
    expect((await make().saved('zzzlocal'))!.miss, isTrue);

    answers = [(400, null)];
    await expectLater(make().refresh('bad'), throwsA(isA<LookupError>()));
  });
}
