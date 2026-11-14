// Notes & SOPs (src/pages/Notes.jsx): Notion-like pages for the pharmacy's procedures, checklists, handovers and
// meeting notes. Blocks are edited in place; "/" lists the block types, Markdown shortcuts ("# ", "[] ", "- ", "1. ",
// "> ") change a block's type, the handle drags a block and its ⋯ menu turns it into another type, copies, moves or
// deletes it. Pages nest (breadcrumbs), carry an emoji icon and a cover, can be starred on this device and start
// from templates. The same records as the React app (table `notes`).
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/presentation/widgets.dart';
import '../../auth/application/session_controller.dart';
import '../domain/notes.dart';

const _coverColors = {
  'teal': [Color(0xFF0D9488), Color(0xFF22D3EE)], 'sky': [Color(0xFF0284C7), Color(0xFF7DD3FC)], 'violet': [Color(0xFF7C3AED), Color(0xFFC4B5FD)],
  'rose': [Color(0xFFE11D48), Color(0xFFFDA4AF)], 'amber': [Color(0xFFD97706), Color(0xFFFDE68A)], 'lime': [Color(0xFF4D7C0F), Color(0xFFBEF264)],
  'slate': [Color(0xFF334155), Color(0xFF94A3B8)], 'gold': [Color(0xFF1A1406), Color(0xFFD4A64A)],
};

class NotesScreen extends ConsumerStatefulWidget {
  const NotesScreen({super.key, this.create = false, this.template = ''});
  /// opened from Ctrl+K: a new blank page, or a page from this template
  final bool create;
  final String template;
  @override
  ConsumerState<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends ConsumerState<NotesScreen> {
  String? _sel;
  String _q = '';
  final _open = <String>{};
  bool _started = false;

  Future<({String name, String id, String branch})> _who() async {
    final s = await ref.read(sessionControllerProvider.future);
    final branch = await ref.read(deviceBranchProvider.future);
    return (name: s?.userName ?? '', id: s?.userId ?? '', branch: branch);
  }

  Future<void> _create({String title = '', String icon = '📄', String? parentId, List<Rec>? blocks}) async {
    final w = await _who();
    final rec = newPage(title: title, icon: icon, parentId: parentId, blocks: blocks, by: w.name, byId: w.id);
    await ref.read(recordStoreProvider).update((x) {
      x.put('notes', rec);
      x.audit(w.name, 'Note page added', title.isEmpty ? 'Untitled' : title, w.branch);
    });
    if (!mounted) return;
    setState(() {
      if (parentId != null) _open.add(parentId);
      _sel = '${rec['id']}';
    });
  }

  Future<void> _fromTemplate(NoteTemplate t) => _create(title: t.title, icon: t.icon, blocks: t.blocks());

  Future<void> _delete(List<Rec> notes, Rec n) async {
    final ids = branchIds(notes, '${n['id']}');
    final ok = await confirmAction(context, 'Delete “${titleOf(n)}”?',
        ids.length > 1 ? 'This page and the ${ids.length - 1} page${ids.length == 2 ? '' : 's'} under it are deleted on every device.' : 'It is deleted on every device.', 'Delete');
    if (!ok) return;
    final w = await _who();
    await ref.read(recordStoreProvider).update((x) {
      for (final id in ids) {
        x.del('notes', id);
      }
      x.audit(w.name, 'Note page deleted', titleOf(n), w.branch);
    });
    if (!mounted) return;
    setState(() => _sel = n['parentId'] as String?);
    say(context, 'Page deleted');
  }

  Future<void> _save(Rec rec) async {
    final w = await _who();
    await ref.read(recordStoreProvider).update((x) => x.put('notes', {...rec, 'updatedBy': w.name, 'editedAt': DateTime.now().toUtc().toIso8601String()}));
  }

  @override
  Widget build(BuildContext context) {
    final notes = ref.watch(tableProvider('notes')).value;
    final session = ref.watch(sessionControllerProvider).value;
    final favKey = 'noteFavs:${session?.userId ?? ''}';
    final favs = [for (final x in (jsonDecode(ref.watch(deviceValueProvider(favKey)).value ?? '[]') as List)) '$x'];
    if (notes == null) return const Center(child: CircularProgressIndicator());
    if (!_started) {
      _started = true;
      if (widget.create) WidgetsBinding.instance.addPostFrameCallback((_) => _create());
      if (widget.template.isNotEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => _fromTemplate(noteTemplates.firstWhere((t) => t.id == widget.template, orElse: () => noteTemplates.first)));
    }
    final page = notes.where((n) => n['id'] == _sel).firstOrNull;
    final wide = MediaQuery.sizeOf(context).width >= 900;
    void toggleFav(String id) {
      final next = favs.contains(id) ? favs.where((x) => x != id).toList() : [...favs, id];
      ref.read(deviceValueProvider(favKey).notifier).set(jsonEncode(next));
    }

    Widget link(Rec n, {int depth = 0, bool tree = false}) {
      final id = '${n['id']}';
      final kids = tree && notes.any((x) => x['parentId'] == id);
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        ListTile(
          key: ValueKey('note-link-$id-${tree ? 't' : 'f'}'),
          dense: true,
          selected: id == _sel,
          contentPadding: EdgeInsets.only(left: 4.0 + depth * 14, right: 0),
          leading: SizedBox(
            width: 52,
            child: Row(children: [
              SizedBox(
                width: 24,
                child: kids
                    ? IconButton(padding: EdgeInsets.zero, iconSize: 16, tooltip: _open.contains(id) ? 'Fold' : 'Unfold',
                        onPressed: () => setState(() => _open.contains(id) ? _open.remove(id) : _open.add(id)), icon: Icon(_open.contains(id) ? Icons.expand_more : Icons.chevron_right))
                    : null,
              ),
              Text('${n['icon'] ?? '📄'}', style: const TextStyle(fontSize: 18)),
            ]),
          ),
          title: Text(titleOf(n), maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: tree ? IconButton(tooltip: 'Add a page inside', iconSize: 16, onPressed: () => _create(parentId: id), icon: const Icon(Icons.add)) : null,
          onTap: () => setState(() => _sel = id),
        ),
        if (kids && _open.contains(id)) for (final k in childrenOf(notes, id)) link(k, depth: depth + 1, tree: true),
      ]);
    }

    final found = _q.trim().isEmpty ? null : notes.where((n) => pageText(n).toLowerCase().contains(_q.trim().toLowerCase())).toList();
    final starred = [for (final id in favs) ...notes.where((n) => n['id'] == id)];
    final side = ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      SearchField(hint: 'Search pages', width: double.infinity, onChanged: (v) => setState(() => _q = v)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FilledButton.icon(key: const Key('note-new'), onPressed: () => _create(), icon: const Icon(Icons.note_add_outlined, size: 18), label: const Text('New page')),
        MenuAnchor(
          menuChildren: [for (final t in noteTemplates) MenuItemButton(key: Key('tpl-${t.id}'), onPressed: () => _fromTemplate(t), leadingIcon: Text(t.icon), child: Text(t.title))],
          builder: (_, c, _) => OutlinedButton.icon(key: const Key('note-templates'), onPressed: () => c.isOpen ? c.close() : c.open(), icon: const Icon(Icons.dashboard_customize_outlined, size: 18), label: const Text('Templates')),
        ),
      ]),
      if (found != null) ...[
        _Label('Found ${found.length}'),
        for (final n in found) link(n),
      ] else ...[
        if (starred.isNotEmpty) ...[const _Label('Starred'), for (final n in starred) link(n)],
        const _Label('Pages'),
        for (final n in childrenOf(notes)) link(n, tree: true),
        if (notes.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('No pages yet. Start a blank page or pick a template: an opening checklist, the cold chain SOP, a shift handover.')),
      ],
    ]);
    final editor = page == null
        ? EmptyState('Write it down once, for everyone: procedures, checklists and handover notes, on every device.', icon: Icons.edit_note)
        : NoteEditor(
            key: ValueKey('editor-${page['id']}'),
            page: page,
            notes: notes,
            onSave: _save,
            onOpen: (id) => setState(() => _sel = id),
            onBack: wide ? null : () => setState(() => _sel = null),
            fav: favs.contains(page['id']),
            onFav: () => toggleFav('${page['id']}'),
            onDelete: () => _delete(notes, page),
            onDuplicate: () => _create(title: '${titleOf(page)} (copy)', icon: '${page['icon'] ?? '📄'}', parentId: page['parentId'] as String?, blocks: [for (final b in blocksOf(page)) {...b, 'id': block()['id']}]),
            onSub: () => _create(parentId: '${page['id']}'),
          );
    return PageFrame(
      title: 'Notes & SOPs',
      subtitle: '${notes.length} page${notes.length == 1 ? '' : 's'} · procedures, checklists and handovers',
      child: wide
          ? Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [SizedBox(width: 280, child: side), const VerticalDivider(width: 24), Expanded(child: editor)])
          : (page == null ? side : editor),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(8, 14, 8, 4),
        child: Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: .8, fontWeight: FontWeight.w700)),
      );
}

/// One page, edited in place. Saves half a second after the last change (and when it closes).
class NoteEditor extends StatefulWidget {
  const NoteEditor({super.key, required this.page, required this.notes, required this.onSave, required this.onOpen, this.onBack, this.fav = false, this.onFav, this.onDelete, this.onDuplicate, this.onSub});
  final Rec page;
  final List<Rec> notes;
  final Future<void> Function(Rec) onSave;
  final void Function(String id) onOpen;
  final VoidCallback? onBack, onFav, onDelete, onDuplicate, onSub;
  final bool fav;
  @override
  State<NoteEditor> createState() => _NoteEditorState();
}

class _NoteEditorState extends State<NoteEditor> {
  late Rec _draft = widget.page;
  late List<Rec> _blocks = blocksOf(widget.page);
  late final _title = TextEditingController(text: '${widget.page['title'] ?? ''}');
  final _ctl = <String, TextEditingController>{};
  final _kids = <String, TextEditingController>{};
  final _focus = <String, FocusNode>{};
  bool _dirty = false;
  Timer? _timer;
  String? _slashFor;

  TextEditingController _c(Rec b) => _ctl.putIfAbsent('${b['id']}', () => TextEditingController(text: '${b['text'] ?? ''}'));
  FocusNode _f(Rec b) => _focus.putIfAbsent('${b['id']}', FocusNode.new);

  @override
  void didUpdateWidget(NoteEditor old) {
    super.didUpdateWidget(old);
    // another device changed this page while nothing is waiting to be saved here: show its version
    if (!_dirty && widget.page['updatedAt'] != _draft['updatedAt']) {
      setState(() {
        _draft = widget.page;
        _blocks = blocksOf(widget.page);
        _title.text = '${widget.page['title'] ?? ''}';
        for (final b in _blocks) {
          final c = _ctl['${b['id']}'];
          if (c != null && c.text != '${b['text'] ?? ''}') c.text = '${b['text'] ?? ''}';
        }
      });
    }
  }

  @override
  void dispose() {
    _flush();
    for (final c in [..._ctl.values, ..._kids.values, _title]) {
      c.dispose();
    }
    for (final f in _focus.values) {
      f.dispose();
    }
    super.dispose();
  }

  void _flush() {
    _timer?.cancel();
    if (!_dirty) return;
    _dirty = false;
    widget.onSave({..._draft, 'title': _title.text, 'blocks': _blocks});
  }

  void _changed() {
    _dirty = true;
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 500), _flush);
  }

  void _set(void Function() fn) {
    setState(fn);
    _changed();
  }

  void _patch(int i, Rec v) => _set(() => _blocks = [..._blocks]..[i] = {..._blocks[i], ...v});

  void _focusOn(String id, {bool end = true}) => WidgetsBinding.instance.addPostFrameCallback((_) {
        final f = _focus[id], c = _ctl[id];
        f?.requestFocus();
        if (c != null) c.selection = TextSelection.collapsed(offset: end ? c.text.length : 0);
      });

  void _insertAfter(int i, Rec b) {
    _set(() => _blocks = [..._blocks]..insert(i + 1, b));
    _focusOn('${b['id']}', end: false);
  }

  void _remove(int i) {
    if (_blocks.length == 1) {
      _c(_blocks[0]).text = '';
      _patch(0, {'type': 'text', 'text': ''});
      return;
    }
    final prev = _blocks[i == 0 ? 1 : i - 1];
    _set(() => _blocks = [..._blocks]..removeAt(i));
    _focusOn('${prev['id']}');
  }

  void _turnInto(int i, String type) {
    _c(_blocks[i]).text = (_blocks[i]['text'] as String? ?? '').startsWith('/') ? '' : '${_blocks[i]['text'] ?? ''}';
    _patch(i, {'type': type, 'text': _c(_blocks[i]).text, if (type == 'todo') 'checked': false});
    setState(() => _slashFor = null);
    if (type == 'divider') {
      _insertAfter(i, block());
    } else {
      _focusOn('${_blocks[i]['id']}');
    }
  }

  void _onText(int i, String text) {
    final b = _blocks[i];
    // Enter: the line splits into a new block (a list carries on; Enter on an empty list line ends the list)
    final nl = text.indexOf('\n');
    if (nl >= 0) {
      final before = text.substring(0, nl), rest = text.substring(nl + 1);
      final list = ['todo', 'bullet', 'number'].contains(b['type']);
      if (list && before.isEmpty && rest.isEmpty) {
        _c(b).text = '';
        _patch(i, {'type': 'text', 'text': ''});
        return;
      }
      _c(b).text = before;
      _patch(i, {'text': before});
      final nb = block(list ? '${b['type']}' : 'text', rest);
      _ctl['${nb['id']}'] = TextEditingController(text: rest);
      _insertAfter(i, nb);
      setState(() => _slashFor = null);
      return;
    }
    final t = const {'text', 'number', 'bullet'}.contains(b['type']) ? shortcut(text) : null;
    if (t != null) {
      _c(b).text = '';
      _patch(i, {'type': t, 'text': '', if (t == 'todo') 'checked': false});
      if (t == 'divider') _insertAfter(i, block());
      return;
    }
    _patch(i, {'text': text});
    setState(() => _slashFor = text.startsWith('/') ? '${b['id']}' : null);
  }

  Widget _prefix(BuildContext context, Rec b, int i) {
    final t = Theme.of(context);
    return switch (b['type']) {
      'todo' => Checkbox(key: ValueKey('check-${b['id']}'), value: b['checked'] == true, onChanged: (v) => _patch(i, {'checked': v == true})),
      'bullet' => const Padding(padding: EdgeInsets.fromLTRB(10, 10, 8, 0), child: Text('•', style: TextStyle(fontSize: 18))),
      'number' => Padding(padding: const EdgeInsets.fromLTRB(6, 12, 6, 0), child: Text('${numberOf(_blocks, i)}.', style: t.textTheme.bodyLarge?.copyWith(color: t.colorScheme.onSurfaceVariant))),
      'toggle' => IconButton(tooltip: b['open'] == true ? 'Fold' : 'Unfold', onPressed: () => _patch(i, {'open': b['open'] != true}), icon: Icon(b['open'] == true ? Icons.expand_more : Icons.chevron_right)),
      'callout' => const Padding(padding: EdgeInsets.fromLTRB(8, 10, 6, 0), child: Text('💡', style: TextStyle(fontSize: 18))),
      _ => const SizedBox(width: 4),
    };
  }

  TextStyle? _style(BuildContext context, Rec b) {
    final t = Theme.of(context).textTheme;
    return switch (b['type']) {
      'h1' => t.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      'h2' => t.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      'h3' => t.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      'quote' => t.bodyLarge?.copyWith(fontStyle: FontStyle.italic),
      _ => t.bodyLarge?.copyWith(decoration: b['checked'] == true ? TextDecoration.lineThrough : null),
    };
  }

  Widget _block(BuildContext context, int i) {
    final b = _blocks[i];
    final t = Theme.of(context);
    final id = '${b['id']}';
    final menu = PopupMenuButton<String>(
      key: ValueKey('block-menu-$id'),
      tooltip: 'Block actions',
      icon: const Icon(Icons.more_horiz, size: 18),
      onSelected: (v) {
        if (v.startsWith('turn:')) return _turnInto(i, v.substring(5));
        switch (v) {
          case 'copy':
            final nb = {...b, 'id': block()['id']};
            _ctl['${nb['id']}'] = TextEditingController(text: '${b['text'] ?? ''}');
            _insertAfter(i, nb);
          case 'up':
            if (i > 0) _set(() => _blocks = [..._blocks]..removeAt(i)..insert(i - 1, b));
          case 'down':
            if (i < _blocks.length - 1) _set(() => _blocks = [..._blocks]..removeAt(i)..insert(i + 1, b));
          case 'delete':
            _remove(i);
        }
      },
      itemBuilder: (_) => [
        for (final bt in blockTypes) PopupMenuItem(value: 'turn:${bt.$1}', child: Text('Turn into ${bt.$2}${bt.$1 == b['type'] ? ' ✓' : ''}')),
        const PopupMenuDivider(),
        const PopupMenuItem(value: 'copy', child: Text('Duplicate')),
        PopupMenuItem(value: 'up', enabled: i > 0, child: const Text('Move up')),
        PopupMenuItem(value: 'down', enabled: i < _blocks.length - 1, child: const Text('Move down')),
        const PopupMenuItem(value: 'delete', child: Text('Delete')),
      ],
    );
    Widget body;
    if (b['type'] == 'divider') {
      body = const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Divider(height: 1));
    } else {
      final field = TextField(
        key: ValueKey('block-$id'),
        controller: _c(b),
        focusNode: _f(b),
        maxLines: null,
        keyboardType: TextInputType.multiline,
        style: _style(context, b),
        decoration: InputDecoration(
          isDense: true,
          border: InputBorder.none,
          hintText: i == 0 && _blocks.length == 1 && (b['text'] ?? '') == '' ? 'Write, or type / for blocks' : (b['type'] == 'text' ? null : blockName('${b['type']}')),
        ),
        onChanged: (v) => _onText(i, v),
      );
      body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        field,
        if (b['type'] == 'toggle' && b['open'] == true)
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: TextField(
              controller: _kids.putIfAbsent(id, () => TextEditingController(text: '${b['children'] ?? ''}')),
              maxLines: null,
              decoration: const InputDecoration(isDense: true, border: InputBorder.none, hintText: 'What is inside'),
              onChanged: (v) => _patch(i, {'children': v}),
            ),
          ),
        if (_slashFor == id)
          Wrap(key: ValueKey('slash-$id'), spacing: 6, runSpacing: 6, children: [
            for (final bt in slashMatches('${b['text'] ?? ''}'.substring(1)))
              ActionChip(key: ValueKey('slash-${bt.$1}'), label: Text(bt.$2), tooltip: bt.$3, onPressed: () => _turnInto(i, bt.$1)),
            if (slashMatches('${b['text'] ?? ''}'.substring(1)).isEmpty) Text('No block called “${'${b['text']}'.substring(1)}”'),
          ]),
      ]);
    }
    Widget row = Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ReorderableDragStartListener(index: i, child: Padding(padding: const EdgeInsets.only(top: 10), child: Icon(Icons.drag_indicator, size: 18, color: t.disabledColor))),
      if (b['type'] != 'divider') _prefix(context, b, i),
      Expanded(child: body),
      menu,
    ]);
    if (b['type'] == 'callout') {
      row = DecoratedBox(decoration: BoxDecoration(color: Colors.amber.withValues(alpha: .10), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.amber.withValues(alpha: .3))), child: row);
    }
    if (b['type'] == 'quote') {
      row = DecoratedBox(decoration: BoxDecoration(border: Border(left: BorderSide(color: t.colorScheme.onSurface, width: 3))), child: row);
    }
    return Padding(key: ValueKey('row-$id'), padding: const EdgeInsets.symmetric(vertical: 1), child: row);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final crumbs = pathTo(widget.notes, '${widget.page['id']}');
    final pr = progress({'blocks': _blocks});
    final kids = childrenOf(widget.notes, '${widget.page['id']}');
    final cover = '${_draft['cover'] ?? ''}';
    final head = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_coverColors[cover] != null)
        Container(height: 90, margin: const EdgeInsets.only(bottom: 8), decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), gradient: LinearGradient(colors: _coverColors[cover]!))),
      Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 4, children: [
        if (widget.onBack != null) IconButton(tooltip: 'All pages', onPressed: () { _flush(); widget.onBack!(); }, icon: const Icon(Icons.arrow_back)),
        Text('Notes', style: t.textTheme.bodySmall),
        for (final c in crumbs) ...[
          Text(' / ', style: t.textTheme.bodySmall),
          c['id'] == widget.page['id']
              ? Text('${c['icon'] ?? ''} ${_title.text.isEmpty ? 'Untitled' : _title.text}', style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700))
              : TextButton(onPressed: () { _flush(); widget.onOpen('${c['id']}'); }, child: Text('${c['icon'] ?? ''} ${titleOf(c)}')),
        ],
      ]),
      Row(children: [
        PopupMenuButton<String>(
          tooltip: 'Change the icon',
          onSelected: (ic) => _set(() => _draft = {..._draft, 'icon': ic}),
          itemBuilder: (_) => [for (final ic in pageIcons) PopupMenuItem(value: ic, child: Text(ic, style: const TextStyle(fontSize: 20)))],
          child: Padding(padding: const EdgeInsets.all(4), child: Text('${_draft['icon'] ?? '📄'}', style: const TextStyle(fontSize: 40))),
        ),
        const Spacer(),
        if (widget.onFav != null) IconButton(key: const Key('note-star'), tooltip: widget.fav ? 'Unstar' : 'Star this page', onPressed: widget.onFav, icon: Icon(widget.fav ? Icons.star : Icons.star_border)),
        PopupMenuButton<String>(
          key: const Key('note-page-menu'),
          tooltip: 'Page actions',
          onSelected: (v) {
            if (v.startsWith('cover:')) return _set(() => _draft = {..._draft, 'cover': v.substring(6)});
            switch (v) {
              case 'sub':
                _flush();
                widget.onSub?.call();
              case 'copy':
                _flush();
                widget.onDuplicate?.call();
              case 'untick':
                _set(() => _blocks = [for (final b in _blocks) b['type'] == 'todo' ? {...b, 'checked': false} : b]);
              case 'delete':
                widget.onDelete?.call();
            }
          },
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'sub', child: Text('Add a page inside')),
            const PopupMenuItem(value: 'copy', child: Text('Duplicate')),
            for (final c in covers) PopupMenuItem(value: 'cover:$c', child: Text(c.isEmpty ? 'No cover' : 'Cover: $c')),
            if (pr.total > 0) const PopupMenuItem(value: 'untick', child: Text('Untick every to-do')),
            const PopupMenuItem(value: 'delete', child: Text('Delete page')),
          ],
        ),
      ]),
      TextField(
        key: const Key('note-title'),
        controller: _title,
        style: t.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
        decoration: const InputDecoration(border: InputBorder.none, hintText: 'Untitled'),
        onChanged: (_) => _set(() {}),
      ),
      Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        if ('${_draft['createdBy'] ?? ''}'.isNotEmpty) Text('By ${_draft['createdBy']}', style: t.textTheme.bodySmall),
        if ('${_draft['updatedBy'] ?? ''}'.isNotEmpty) Text('· edited by ${_draft['updatedBy']}', style: t.textTheme.bodySmall),
        if (pr.total > 0) Chip(key: const Key('note-progress'), visualDensity: VisualDensity.compact, label: Text('${pr.done}/${pr.total} done')),
      ]),
      const SizedBox(height: 8),
    ]);
    return ReorderableListView.builder(
      buildDefaultDragHandles: false,
      padding: const EdgeInsets.only(bottom: 32),
      header: head,
      footer: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(alignment: Alignment.centerLeft, child: TextButton.icon(key: const Key('note-add-block'), onPressed: () => _insertAfter(_blocks.length - 1, block()), icon: const Icon(Icons.add), label: const Text('Add a block'))),
        if (kids.isNotEmpty) ...[
          const Divider(height: 24),
          Text('PAGES INSIDE', style: t.textTheme.labelSmall),
          for (final k in kids) ListTile(dense: true, leading: Text('${k['icon'] ?? '📄'}'), title: Text(titleOf(k)), trailing: const Icon(Icons.chevron_right), onTap: () { _flush(); widget.onOpen('${k['id']}'); }),
        ],
      ]),
      itemCount: _blocks.length,
      onReorderItem: (from, to) => _set(() {
        final list = [..._blocks];
        list.insert(to, list.removeAt(from));
        _blocks = list;
      }),
      itemBuilder: (context, i) => _block(context, i),
    );
  }
}
