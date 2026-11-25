// Notes & SOP pages (src/notes.js, tests/unit-notes.mjs): the "/" menu, Markdown shortcuts, the page tree and
// breadcrumbs, to-do progress, numbered lists, templates; and the editor: typing blocks with "/" and shortcuts,
// Enter, ticking to-dos, and saving after a pause. Fictional pages.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/features/notes/domain/notes.dart';
import 'package:rxpos/features/notes/presentation/notes_screen.dart';

void main() {
  test('the "/" menu and Markdown shortcuts', () {
    expect(slashMatches(''), hasLength(blockTypes.length));
    expect(slashMatches('todo').first.$1, 'todo');
    expect(slashMatches('check').map((b) => b.$1), contains('todo'));
    expect(slashMatches('h2').first.$1, 'h2');
    expect(slashMatches('warning').map((b) => b.$1), contains('callout'));
    expect(slashMatches('zzqx'), isEmpty);
    expect([for (final t in ['# ', '## ', '[] ', '- ', '1. ', '> ', '---']) shortcut(t)], ['h1', 'h2', 'todo', 'bullet', 'number', 'quote', 'divider']);
    expect(shortcut('Hello'), isNull);
    expect(shortcut('#hashtag'), isNull);
  });

  test('the page tree, deleting a branch, breadcrumbs', () {
    final top = newPage(title: 'SOPs', by: 'Test Pharmacist');
    final child = newPage(title: 'Cold chain', parentId: '${top['id']}');
    final grand = newPage(title: 'Fridge log', parentId: '${child['id']}');
    final other = newPage(title: 'Agenda');
    final all = [grand, other, child, top];
    expect(blocksOf(top), hasLength(1));
    expect(top['createdBy'], 'Test Pharmacist');
    expect(childrenOf(all).map(titleOf), ['Agenda', 'SOPs']);
    expect(childrenOf(all, '${top['id']}').map(titleOf), ['Cold chain']);
    expect(branchIds(all, '${top['id']}').toSet(), {top['id'], child['id'], grand['id']});
    expect(pathTo(all, '${grand['id']}').map(titleOf).join(' / '), 'SOPs / Cold chain / Fridge log');
  });

  test('progress, numbered lists, templates', () {
    expect(progress({'blocks': [block('todo', 'a', {'checked': true}), block('todo', 'b'), block('text', 'x')]}), (done: 1, total: 2));
    final nums = [block('number', 'a'), block('number', 'b'), block('text', '-'), block('number', 'c')];
    expect([for (final i in [0, 1, 3]) numberOf(nums, i)], [1, 2, 1]);
    for (final t in noteTemplates) {
      final a = t.blocks(), b = t.blocks();
      expect(a.length, greaterThan(2));
      expect(a.first['id'], isNot(b.first['id']));
    }
  });

  testWidgets('typing blocks: "/", shortcuts, Enter, to-dos; saved after a pause', (tester) async {
    final saved = <Map<String, Object?>>[];
    final page = newPage(title: 'Fridge procedure', by: 'Test Pharmacist');
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: NoteEditor(page: page, notes: [page], onSave: (r) async => saved.add(r), onOpen: (_) {}))));
    final first = find.byKey(ValueKey('block-${blocksOf(page).first['id']}'));
    await tester.enterText(first, '/head');
    await tester.pump();
    expect(find.byKey(const ValueKey('slash-h1')), findsOneWidget, reason: '"/" lists the matching blocks');
    // (the text field's selection handle sits over the chip in a test: press it directly)
    tester.widget<ActionChip>(find.byKey(const ValueKey('slash-h1'))).onPressed!();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(blocksOf(saved.last).first['type'], 'h1', reason: 'the block became a heading');
    await tester.enterText(first, 'Morning checks');
    await tester.enterText(first, 'Morning checks\n');
    await tester.pump();
    // the new block has the focus; a shortcut makes it a to-do
    Finder nth(int i) => find.byType(TextField).at(i + 1); // the title is the first field
    await tester.enterText(nth(1), '[] ');
    await tester.pump();
    await tester.enterText(nth(1), 'Read the thermometer');
    await tester.enterText(nth(1), 'Read the thermometer\n');
    await tester.pump();
    await tester.enterText(nth(2), 'Write it in Storage');
    await tester.pump();
    final checks = find.byType(Checkbox);
    expect(checks, findsNWidgets(2), reason: 'Enter on a to-do starts another to-do');
    await tester.tap(checks.first);
    await tester.pump();
    expect(find.text('1/2 done'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 600));
    final last = saved.last;
    expect([for (final b in blocksOf(last)) (b['type'], b['text'])], [('h1', 'Morning checks'), ('todo', 'Read the thermometer'), ('todo', 'Write it in Storage')]);
    expect(blocksOf(last)[1]['checked'], isTrue);
    expect(last['title'], 'Fridge procedure');
  });
}
