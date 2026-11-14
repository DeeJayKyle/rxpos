// Notes & SOP pages (src/notes.js): pages made of blocks (headings, text, to-dos, lists, toggles, callouts, quotes,
// dividers), nested under each other, with an emoji icon and a cover. The same records as the React app (table
// `notes`), so a page written on one app opens on the other.
import '../../../core/rules/ids.dart';

typedef Rec = Map<String, Object?>;

/// Block types, in the order the "/" menu lists them: (type, name, what it is, words that find it)
const blockTypes = <(String, String, String, String)>[
  ('text', 'Text', 'Plain writing', 'paragraph plain'),
  ('h1', 'Heading 1', 'Big section title', 'title heading h1'),
  ('h2', 'Heading 2', 'Medium section title', 'subtitle heading h2'),
  ('h3', 'Heading 3', 'Small section title', 'heading h3'),
  ('todo', 'To-do', 'A box to tick', 'checkbox task check todo'),
  ('bullet', 'Bulleted list', 'A simple list', 'list bullet ul'),
  ('number', 'Numbered list', 'Steps in order', 'list numbered ol steps'),
  ('toggle', 'Toggle', 'Hide the detail under a line', 'collapse expand toggle'),
  ('callout', 'Callout', 'Make a warning or tip stand out', 'warning note tip info callout'),
  ('quote', 'Quote', 'Quoted words', 'quote citation'),
  ('divider', 'Divider', 'A line between sections', 'line rule separator divider hr'),
];
String blockName(String type) => blockTypes.firstWhere((b) => b.$1 == type, orElse: () => blockTypes.first).$2;
const covers = ['', 'teal', 'sky', 'violet', 'rose', 'amber', 'lime', 'slate', 'gold'];
const pageIcons = ['📄', '📋', '✅', '💊', '❄️', '🌅', '🔁', '🗓️', '⚠️', '📦', '💰', '🧾', '🩺', '🧪', '📞', '⭐', '📌', '🧹'];

Rec block([String type = 'text', String text = '', Rec extra = const {}]) => {'id': uid(), 'type': type, 'text': text, if (type == 'todo') 'checked': false, ...extra};

/// The "/" menu's choices for what was typed after the slash
List<(String, String, String, String)> slashMatches(String q) {
  final s = q.trim().toLowerCase();
  if (s.isEmpty) return blockTypes;
  return blockTypes.where((b) => '${b.$1} ${b.$2} ${b.$4}'.toLowerCase().contains(s)).toList();
}

/// Markdown-style shortcuts typed at the start of a block ("# ", "[] ", "- ", "1. ", "> ", "---")
String? shortcut(String text) {
  const rules = [(r'^# $', 'h1'), (r'^## $', 'h2'), (r'^### $', 'h3'), (r'^\[\]\s$|^\[ \]\s$', 'todo'), (r'^[-*] $', 'bullet'), (r'^1[.)] $', 'number'), (r'^> $', 'quote'), (r'^>> $', 'toggle'), (r'^! $', 'callout'), (r'^---$', 'divider')];
  for (final (re, type) in rules) {
    if (RegExp(re).hasMatch(text)) return type;
  }
  return null;
}

Rec newPage({String title = '', String icon = '📄', String? parentId, List<Rec>? blocks, String by = '', String byId = ''}) =>
    {'id': uid(), 'title': title, 'icon': icon, 'cover': '', 'parentId': parentId, 'blocks': (blocks?.isNotEmpty ?? false) ? blocks : [block()], 'createdBy': by, 'createdById': byId};

List<Rec> blocksOf(Rec n) => [for (final b in (n['blocks'] as List? ?? const [])) if (b is Map) b.cast<String, Object?>()];
String titleOf(Rec n) => '${n['title'] ?? ''}'.isEmpty ? 'Untitled' : '${n['title']}';

class NoteTemplate {
  const NoteTemplate(this.id, this.title, this.icon, this.blocks);
  final String id, title, icon;
  final List<Rec> Function() blocks;
}

final noteTemplates = <NoteTemplate>[
  NoteTemplate('opening', 'Opening checklist', '🌅', () => [
        block('callout', 'Do these before the first customer. Tick each one; untick them all at closing.'),
        block('todo', 'Switch on the till and check it says Synced'), block('todo', 'Read the fridge thermometer and log it (Storage)'),
        block('todo', 'Count the opening float and open the shift'), block('todo', 'Check expiring stock on the Dashboard'),
        block('todo', 'Clean the counter and dispensing area'), block('todo', 'Read the handover notes from yesterday'),
      ]),
  NoteTemplate('cold-chain', 'Cold chain SOP', '❄️', () => [
        block('h2', 'Purpose'), block('text', 'Keep vaccines, insulin and other fridge items between 2 °C and 8 °C from delivery to sale.'),
        block('h2', 'Steps'), block('number', 'Put fridge items away first, within 15 minutes of delivery.'),
        block('number', 'Record the fridge temperature twice a day in Storage.'), block('number', 'Keep the door shut; do not store food or drinks in it.'),
        block('callout', 'Out of range? Move the stock to the backup cooler, note the time and the reading, and call the supervisor.'),
        block('toggle', 'Who to call', {'children': "Supervisor, then the supplier's cold-chain line."}),
      ]),
  NoteTemplate('handover', 'Shift handover', '🔁', () => [
        block('h2', 'Today'), block('bullet', 'Cash-up done and banked: '), block('bullet', 'Items out of stock: '), block('bullet', 'Customers waiting for an order: '),
        block('h2', 'For the next shift'), block('todo'),
      ]),
  NoteTemplate('dispensing', 'Dispensing SOP', '💊', () => [
        block('h2', 'Before handing over'), block('number', 'Check the prescription: patient, medicine, strength, dose, duration.'),
        block('number', "Check allergies and other medicines on the customer's record."), block('number', 'Pick from the batch that expires first.'),
        block('number', 'Label with the dose and counsel the patient.'), block('quote', 'Right patient, right medicine, right dose, right route, right time.'),
      ]),
  NoteTemplate('meeting', 'Staff meeting', '🗓️', () => [
        block('h2', 'Agenda'), block('bullet'), block('h2', 'Decisions'), block('bullet'), block('h2', 'Actions'), block('todo'),
      ]),
];

/// Pages directly under [parentId] (null: the top), A to Z
List<Rec> childrenOf(List<Rec> notes, [String? parentId]) =>
    notes.where((n) => ((n['parentId'] as String?)?.isEmpty ?? true ? null : n['parentId']) == parentId).toList()..sort((a, b) => titleOf(a).compareTo(titleOf(b)));

/// A page and every page under it
List<String> branchIds(List<Rec> notes, String id) {
  final out = [id];
  for (var i = 0; i < out.length; i++) {
    for (final n in notes) {
      if (n['parentId'] == out[i] && !out.contains(n['id'])) out.add('${n['id']}');
    }
  }
  return out;
}

/// The path from the top to a page, for breadcrumbs
List<Rec> pathTo(List<Rec> notes, String id) {
  final byId = {for (final n in notes) '${n['id']}': n};
  final out = <Rec>[];
  var n = byId[id];
  for (var guard = 0; n != null && guard < 50; guard++) {
    out.insert(0, n);
    n = byId['${n['parentId']}'];
  }
  return out;
}

String pageText(Rec n) => [n['title'] ?? '', for (final b in blocksOf(n)) '${b['text'] ?? ''} ${b['children'] ?? ''}'].join(' ');

({int done, int total}) progress(Rec n) {
  final todos = blocksOf(n).where((b) => b['type'] == 'todo');
  return (done: todos.where((b) => b['checked'] == true).length, total: todos.length);
}

int numberOf(List<Rec> blocks, int i) {
  var n = 0;
  for (var j = i; j >= 0 && blocks[j]['type'] == 'number'; j--) {
    n++;
  }
  return n;
}
