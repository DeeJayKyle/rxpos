// Drug quiz (src/pages/Quiz.jsx): offline questions from the medicine list, AI answers read safely, the team board.
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/product.dart';
import 'package:rxpos/features/quiz/domain/quiz.dart';

void main() {
  final meds = [
    const Product(id: 'a', name: 'Amoxil 500mg Caps', generic: 'Amoxicillin', form: 'Capsules'),
    const Product(id: 'b', name: 'Panadol 500mg Tabs', generic: 'Paracetamol', form: 'Tablets'),
    const Product(id: 'c', name: 'Brufen 400mg Tabs', generic: 'Ibuprofen', form: 'Tablets'),
    const Product(id: 'd', name: 'Flagyl Suspension', generic: 'Metronidazole', form: 'Suspension'),
    const Product(id: 'e', name: 'Zyrtec Syrup', generic: 'Cetirizine', form: 'Syrup'),
    const Product(id: 'f', name: 'Ventolin Inhaler', generic: 'Salbutamol', form: 'Inhaler'),
    const Product(id: 'g', name: 'Paracetamol', generic: 'Paracetamol', form: 'Tablets'), // same as its generic: no question
    const Product(id: 'h', name: 'Plain gauze'),
  ];

  test('offline questions: four options, one right answer, never about a medicine without a different generic', () {
    for (var seed = 0; seed < 30; seed++) {
      final qs = offlineQuiz(meds, meds, rnd: Random(seed));
      expect(qs, isNotEmpty);
      expect(qs.length, lessThanOrEqualTo(6));
      for (final q in qs) {
        expect(q.options, hasLength(4));
        expect(q.options.toSet(), hasLength(4), reason: 'no repeated option in "${q.q}"');
        expect(q.answer, inInclusiveRange(0, 3));
        expect(q.q, isNot(contains('Plain gauze')));
        expect(q.q, isNot(endsWith('of Paracetamol?')));
      }
      expect(qs.first.q, startsWith('What is the generic name'), reason: 'question 1 asks the generic');
    }
    final qs = offlineQuiz(meds, meds, rnd: Random(1));
    final generic = qs.firstWhere((q) => q.q.startsWith('What is the generic name'));
    final name = generic.q.replaceFirst('What is the generic name (active ingredient) of ', '').replaceFirst('?', '');
    expect(generic.options[generic.answer], meds.firstWhere((p) => p.name == name).generic);
    expect(offlineQuiz(const [Product(id: 'x', name: 'Gauze')], meds), isEmpty);
  });

  test('AI questions: the cloud shape is read, broken ones are dropped', () {
    final ok = QuizQuestion.fromJson({'q': 'Amoxicillin is a…', 'options': ['penicillin', 'macrolide', 'quinolone', 'azole'], 'answer': 0, 'explain': 'A beta-lactam.'});
    expect((ok!.q, ok.answer, ok.explain), ('Amoxicillin is a…', 0, 'A beta-lactam.'));
    expect(QuizQuestion.fromJson({'q': 'x', 'options': ['a', 'b'], 'answer': 0}), isNull);
    expect(QuizQuestion.fromJson({'q': 'x', 'options': ['a', 'b', 'c', 'd'], 'answer': 4}), isNull);
    expect(QuizQuestion.fromJson('nope'), isNull);
    final drugs = aiQuizDrugs(meds, rnd: Random(2));
    expect(drugs.toSet(), {'Amoxicillin', 'Paracetamol', 'Ibuprofen', 'Metronidazole', 'Cetirizine', 'Salbutamol'});
  });

  test('team board: this month only, best average first, then most quizzes', () {
    final now = DateTime(2026, 11, 20, 12);
    final board = teamBoard([
      {'userId': 'u1', 'userName': 'Ada', 'date': '2026-11-02T09:00:00', 'score': 6, 'total': 8},
      {'userId': 'u1', 'userName': 'Ada', 'date': '2026-11-03T09:00:00', 'score': 8, 'total': 8},
      {'userId': 'u2', 'userName': 'Ben', 'date': '2026-11-04T09:00:00', 'score': 7, 'total': 8},
      {'userId': 'u3', 'userName': 'Cy', 'date': '2026-11-04T09:00:00', 'score': 7, 'total': 8},
      {'userId': 'u3', 'userName': 'Cy', 'date': '2026-11-05T09:00:00', 'score': 7, 'total': 8},
      {'userId': 'u4', 'userName': 'Old', 'date': '2026-10-30T09:00:00', 'score': 8, 'total': 8},
      {'userId': 'u5', 'userName': 'Dee', 'date': '2026-11-06T09:00:00', 'score': 8, 'total': 8},
    ], now: now);
    expect([for (final b in board) (b.name, b.n, b.percent)], [('Dee', 1, 100), ('Ada', 2, 88), ('Cy', 2, 88), ('Ben', 1, 88)]);
  });
}
