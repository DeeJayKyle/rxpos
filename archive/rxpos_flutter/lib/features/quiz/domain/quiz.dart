// Drug quiz (src/pages/Quiz.jsx): offline questions made from the pharmacy's own medicine list (brand ↔ generic,
// formulation), the AI quiz's answers in the same shape, and the team board for the month.
import 'dart:math';

import '../../../core/entities/product.dart';
import '../../../core/rules/dates.dart';

class QuizQuestion {
  const QuizQuestion({required this.q, required this.options, required this.answer, this.explain = ''});
  final String q;
  final List<String> options;
  final int answer;
  final String explain;

  /// A question as the cloud's AI quiz sends it: {q, options[4], answer 0-3, explain}.
  static QuizQuestion? fromJson(Object? j) {
    if (j is! Map) return null;
    final opts = [for (final o in (j['options'] as List?) ?? const []) '$o'];
    final a = (j['answer'] as num?)?.toInt() ?? -1;
    final q = '${j['q'] ?? j['question'] ?? ''}'.trim();
    if (q.isEmpty || opts.length != 4 || a < 0 || a > 3) return null;
    return QuizQuestion(q: q, options: opts, answer: a, explain: '${j['explain'] ?? ''}');
  }
}

String _generic(Product p) => p.generic.trim();

List<T> _shuffle<T>(Iterable<T> a, Random r) => a.toList()..shuffle(r);

/// [stock]: the medicines the questions are about; [all]: every medicine (wrong answers come from here).
List<QuizQuestion> offlineQuiz(List<Product> stock, List<Product> all, {int n = 8, Random? rnd}) {
  final r = rnd ?? Random();
  final withGeneric = stock.where((p) => _generic(p).isNotEmpty && _generic(p).toLowerCase() != p.name.toLowerCase());
  final pool = _shuffle(withGeneric, r).take(n).toList();
  final otherGenerics = {for (final p in all) if (_generic(p).isNotEmpty) _generic(p)}.toList();
  final otherForms = {for (final p in all) if (p.form.isNotEmpty) p.form}.toList();
  final out = <QuizQuestion>[];
  for (var i = 0; i < pool.length; i++) {
    final p = pool[i], g = _generic(p);
    final kind = i % 3;
    QuizQuestion? q;
    if (kind == 1 && p.form.isNotEmpty) {
      final opts = _shuffle([p.form, ..._shuffle(otherForms.where((f) => f != p.form), r).take(3)], r);
      q = QuizQuestion(q: 'What formulation is ${p.name}?', options: opts, answer: opts.indexOf(p.form), explain: '${p.name} is ${p.form.toLowerCase()} ($g).');
    } else if (kind == 2) {
      final brands = _shuffle(stock.where((x) => _generic(x).isNotEmpty && _generic(x) != g), r).take(3).map((x) => x.name).toList();
      if (brands.length == 3) {
        final opts = _shuffle([p.name, ...brands], r);
        q = QuizQuestion(q: 'Which of these contains $g?', options: opts, answer: opts.indexOf(p.name), explain: '${p.name} contains $g.');
      }
    }
    if (q == null) {
      final opts = _shuffle([g, ..._shuffle(otherGenerics.where((x) => x.toLowerCase() != g.toLowerCase()), r).take(3)], r);
      q = QuizQuestion(q: 'What is the generic name (active ingredient) of ${p.name}?', options: opts, answer: opts.indexOf(g), explain: '${p.name} = $g.');
    }
    if (q.answer >= 0 && q.options.length == 4) out.add(q);
  }
  return out;
}

/// The generics sent to the AI quiz: up to 8 different ones, longer than 3 letters.
List<String> aiQuizDrugs(List<Product> base, {Random? rnd}) =>
    {for (final p in _shuffle(base, rnd ?? Random())) if (_generic(p).length > 3) _generic(p)}.take(8).toList();

class BoardRow {
  BoardRow(this.name);
  final String name;
  int score = 0, total = 0, n = 0;
  int get percent => total == 0 ? 0 : (score / total * 100).round();
}

/// This month's results per person, best average first, then most quizzes.
List<BoardRow> teamBoard(List<Map<String, Object?>> results, {DateTime? now}) {
  final month = today(now).substring(0, 7);
  final m = <String, BoardRow>{};
  for (final r in results) {
    if (!dayOf('${r['date'] ?? ''}').startsWith(month)) continue;
    final e = m.putIfAbsent('${r['userId']}', () => BoardRow('${r['userName'] ?? ''}'));
    e.score += (r['score'] as num?)?.toInt() ?? 0;
    e.total += (r['total'] as num?)?.toInt() ?? 0;
    e.n++;
  }
  double ratio(BoardRow b) => b.total == 0 ? 0 : b.score / b.total;
  // ties keep the order people first appear in, as JavaScript's stable sort does
  final order = m.values.toList();
  final at = {for (final (i, b) in order.indexed) b: i};
  return order
    ..sort((a, b) {
      final r = ratio(b).compareTo(ratio(a));
      if (r != 0) return r;
      final n = b.n.compareTo(a.n);
      return n != 0 ? n : at[a]!.compareTo(at[b]!);
    });
}
