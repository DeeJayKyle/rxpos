// Drug quiz (src/pages/Quiz.jsx): a quick quiz made offline from the medicine list, or the AI quiz (uses, side
// effects, counselling) when the pharmacy has AI; one question at a time, the score saved to quizResults, and the
// team board for this month.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/ids.dart';
import '../../auth/application/session_controller.dart';
import '../domain/quiz.dart';

class _Quiz {
  _Quiz(this.questions, this.source);
  final List<QuizQuestion> questions;
  final String source;
  final picked = <int, int>{};
  int i = 0;
  int? score;
}

class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});
  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  _Quiz? _quiz;
  bool _busy = false;

  Future<void> _start(bool useAi) async {
    setState(() => _busy = true);
    try {
      final d = await ref.read(pharmacyProvider.future);
      final stock = d.products.where((p) => d.stockOf(p.id) > 0).toList();
      final base = stock.length >= 8 ? stock : d.products;
      List<QuizQuestion> questions;
      var source = 'Your medicine list';
      if (useAi) {
        final j = await ref.read(cloudApiProvider).post('/api/ai/quiz', {'drugs': aiQuizDrugs(base), 'count': 8}, timeout: const Duration(seconds: 90));
        if (j['error'] != null) throw Exception(j['error']);
        questions = [for (final q in (j['questions'] as List?) ?? const []) ?QuizQuestion.fromJson(q)];
        source = 'AI about medicines in your stock';
      } else {
        questions = offlineQuiz(base, d.products);
      }
      if (questions.isEmpty) throw Exception('Not enough medicines with generic names to make a quiz yet.');
      if (mounted) setState(() => _quiz = _Quiz(questions, source));
    } catch (e) {
      final msg = '$e'.replaceFirst('Exception: ', '');
      if (!mounted) return;
      say(context, msg + (useAi ? ' Using the offline quiz instead.' : ''), error: true);
      if (useAi) {
        setState(() => _busy = false);
        return _start(false);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _answer(int k) {
    final q = _quiz!;
    if (q.picked.containsKey(q.i)) return;
    setState(() => q.picked[q.i] = k);
  }

  Future<void> _next() async {
    final q = _quiz!;
    if (q.i + 1 < q.questions.length) return setState(() => q.i++);
    final score = [for (var i = 0; i < q.questions.length; i++) if (q.picked[i] == q.questions[i].answer) i].length;
    final s = await ref.read(sessionControllerProvider.future);
    await ref.read(recordStoreProvider).update((x) => x.put('quizResults', {
          'id': uid(), 'date': x.now, 'userId': s?.userId ?? '', 'userName': s?.userName ?? '', 'score': score, 'total': q.questions.length, 'source': q.source,
        }));
    if (mounted) setState(() => q.score = score);
  }

  Widget _startCard(bool ai) => Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.school_outlined, size: 48),
        const SizedBox(height: 8),
        const Text('8 questions · about 3 minutes'),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
          if (ai)
            FilledButton.icon(
              key: const Key('quiz-ai'),
              onPressed: _busy ? null : () => _start(true),
              icon: _busy ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
              label: const Text('AI quiz: uses, side effects, counselling'),
            ),
          OutlinedButton.icon(key: const Key('quiz-offline'), onPressed: _busy ? null : () => _start(false), icon: const Icon(Icons.wifi_off), label: const Text('Quick quiz (works offline)')),
        ]),
      ]);

  Widget _question(BuildContext context, _Quiz quiz) {
    final t = Theme.of(context);
    final q = quiz.questions[quiz.i];
    final picked = quiz.picked[quiz.i];
    final right = Colors.green.shade700, wrong = t.colorScheme.error;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Row(children: [
        Text('Question ${quiz.i + 1} of ${quiz.questions.length}', style: t.textTheme.bodySmall),
        const Spacer(),
        Flexible(child: Text(quiz.source, style: t.textTheme.bodySmall, overflow: TextOverflow.ellipsis)),
      ]),
      const SizedBox(height: 6),
      LinearProgressIndicator(value: quiz.i / quiz.questions.length),
      const SizedBox(height: 12),
      Text(q.q, style: t.textTheme.titleLarge),
      const SizedBox(height: 12),
      for (final (k, o) in q.options.indexed)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: OutlinedButton(
            key: Key('quiz-opt-$k'),
            style: OutlinedButton.styleFrom(
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.all(12),
              foregroundColor: picked == null ? null : k == q.answer ? right : k == picked ? wrong : t.disabledColor,
              side: picked != null && (k == q.answer || k == picked) ? BorderSide(color: k == q.answer ? right : wrong, width: 2) : null,
            ),
            onPressed: () => _answer(k),
            child: Row(children: [
              Text('ABCD'[k], style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(width: 10),
              Expanded(child: Text(o)),
              if (picked != null && k == q.answer) Icon(Icons.check_circle, color: right, size: 18),
              if (picked == k && k != q.answer) Icon(Icons.cancel, color: wrong, size: 18),
            ]),
          ),
        ),
      if (picked != null)
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: (picked == q.answer ? right : wrong).withValues(alpha: .1), borderRadius: BorderRadius.circular(8)),
          child: Text('${picked == q.answer ? 'Correct! ' : 'The right answer is ${'ABCD'[q.answer]}: ${q.options[q.answer]}. '}${q.explain}'),
        ),
      const SizedBox(height: 12),
      Align(
        alignment: Alignment.centerRight,
        child: FilledButton(key: const Key('quiz-next'), onPressed: picked == null ? null : _next, child: Text(quiz.i + 1 < quiz.questions.length ? 'Next question' : 'See my score')),
      ),
    ]);
  }

  Widget _result(BuildContext context, _Quiz quiz) {
    final t = Theme.of(context);
    final n = quiz.questions.length, s = quiz.score!;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.emoji_events_outlined, size: 36),
      Text('$s / $n', textAlign: TextAlign.center, style: t.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
      Text(s == n ? 'Perfect!' : s >= n * 0.7 ? 'Well done!' : 'Keep learning. Review the answers below.', textAlign: TextAlign.center),
      const SizedBox(height: 12),
      Text('Answers', style: t.textTheme.titleMedium),
      for (final (i, x) in quiz.questions.indexed)
        Container(
          margin: const EdgeInsets.only(top: 6),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(border: Border(left: BorderSide(width: 3, color: quiz.picked[i] == x.answer ? Colors.green : t.colorScheme.error))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${i + 1}. ${x.q}', style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('Right answer: ${x.options[x.answer]}${quiz.picked[i] != x.answer && quiz.picked[i] != null ? ' · you chose ${x.options[quiz.picked[i]!]}' : ''}'),
            if (x.explain.isNotEmpty) Text(x.explain, style: t.textTheme.bodySmall),
          ]),
        ),
      const SizedBox(height: 12),
      FilledButton.icon(onPressed: () => setState(() => _quiz = null), icon: const Icon(Icons.replay), label: const Text('Another quiz')),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(pharmacyProvider).value;
    final results = ref.watch(tableProvider('quizResults')).value;
    if (d == null || results == null) return const Center(child: CircularProgressIndicator());
    final quiz = _quiz;
    final t = Theme.of(context);
    final board = teamBoard(results);
    final main = Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          if (quiz == null) _startCard(d.features['ai'] != false) else if (quiz.score == null) _question(context, quiz) else _result(context, quiz),
          const SizedBox(height: 12),
          Text('Questions are for learning. Always confirm clinical details in Drug Information or the BNF / WHO references.', style: t.textTheme.bodySmall),
        ]),
      ),
    );
    final boardCard = Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text('Team board · this month', style: t.textTheme.titleMedium),
          const SizedBox(height: 8),
          if (board.isEmpty)
            const Padding(padding: EdgeInsets.all(12), child: Text('No quizzes yet this month', textAlign: TextAlign.center))
          else
            Table(columnWidths: const {0: FixedColumnWidth(32), 2: IntrinsicColumnWidth(), 3: IntrinsicColumnWidth()}, children: [
              const TableRow(children: [Text('#'), Text('Name'), Text('Quizzes  '), Text('Score', textAlign: TextAlign.right)]),
              for (final (i, b) in board.indexed)
                TableRow(children: [Text('${i + 1}'), Text(b.name), Text('${b.n}  ', textAlign: TextAlign.right), Text('${b.percent}%', textAlign: TextAlign.right)]),
            ]),
        ]),
      ),
    );
    return PageFrame(
      title: 'Drug quiz',
      subtitle: 'Quick quizzes on the medicines you stock. Learn the right answers and see who tops the team board.',
      child: LayoutBuilder(
        builder: (context, c) => SingleChildScrollView(
          child: c.maxWidth >= 900
              ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: main), Expanded(flex: 2, child: boardCard)])
              : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [main, boardCard]),
        ),
      ),
    );
  }
}
