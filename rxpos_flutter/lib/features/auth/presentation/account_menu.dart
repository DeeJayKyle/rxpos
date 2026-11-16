// The signed-in person's menu in the top bar (src/App.jsx): change my password (asked at once after signing in with
// a temporary password), the quick PIN for this device, two-step sign-in (src/twostep.jsx) and log out. Signing out
// never deletes unsent work: it stays on this device and is sent when someone signs in again.

import 'package:barcode/barcode.dart';
import 'package:flutter/foundation.dart' show compute;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/pharmacy_providers.dart';
import '../../../core/data/record_store.dart';
import '../../../core/database/app_database.dart';
import '../../../core/network/cloud_api.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/rules/passwords.dart';
import '../application/session_controller.dart';
import '../data/auth_repository.dart';
import '../domain/device_unlock.dart';
import '../domain/offline_secrets.dart' show offlineDays;
import '../domain/session.dart';
import 'sign_in_screen.dart';

/// [makePassword] off the screen's thread (100,000 rounds take a moment on a phone).
/// (in the background on Windows and Android; in the page on the web, where there are no isolates)
Future<Map<String, Object?>> makePasswordAsync(String pw) => compute(makePassword, pw);

/// Ask for a secret twice (a password or a PIN); null when cancelled. [check] says what is wrong with the first one.
Future<String?> askTwice(BuildContext context, {required String title, required String message, required String again, required String save, String? Function(String)? check, bool digits = false}) async {
  for (;;) {
    final first = await _askSecret(context, title: title, message: message, action: 'Next', check: check, digits: digits);
    if (first == null || !context.mounted) return null;
    final second = await _askSecret(context, title: again, action: save, digits: digits);
    if (second == null || !context.mounted) return null;
    if (second == first) return first;
    say(context, digits ? 'The two PINs did not match. Try again.' : 'The two passwords did not match. Try again.', error: true);
    if (digits) return null;
  }
}

/// Ask for the current password before a change to how someone signs in (null when cancelled).
Future<String?> askCurrentPassword(BuildContext context, String why) => _askSecret(context, title: 'Confirm it is you', message: '$why\nType your current password.', action: 'Continue', current: true);

Future<String?> _askSecret(BuildContext context, {required String title, String? message, required String action, String? Function(String)? check, bool digits = false, bool current = false}) {
  final c = TextEditingController();
  String? error;
  return showAppDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(builder: (ctx, set) {
      void done() {
        final e = check?.call(c.text);
        if (e != null) return set(() => error = e);
        Navigator.pop(ctx, c.text);
      }

      return AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 400,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (message != null) Text(message),
            const SizedBox(height: 8),
            digits
                ? TextField(key: const Key('secret'), controller: c, autofocus: true, obscureText: true, keyboardType: TextInputType.number, maxLength: 8,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly], decoration: InputDecoration(errorText: error, counterText: ''), onSubmitted: (_) => done())
                : PasswordField(key: const Key('secret'), controller: c, label: current ? 'Current password' : 'Password', autofocus: true, hints: [current ? AutofillHints.password : AutofillHints.newPassword], onSubmitted: (_) => done()),
            if (!digits && error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error))),
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')), FilledButton(onPressed: done, child: Text(action))],
      );
    }),
  );
}

class AccountMenu extends ConsumerStatefulWidget {
  const AccountMenu({super.key, required this.session, this.showName = true});
  final Session session;
  final bool showName;
  @override
  ConsumerState<AccountMenu> createState() => _AccountMenuState();
}

class _AccountMenuState extends ConsumerState<AccountMenu> with _AccountActions<AccountMenu> {
  bool _asked = false;

  @override
  Session get s => widget.session;

  @override
  void initState() {
    super.initState();
    _loadPin();
  }

  @override
  Widget build(BuildContext context) {
    // staff brought over from another system set their own password on first sign-in
    final me = ref.watch(tableProvider('users')).value?.where((u) => u['id'] == s.userId).firstOrNull;
    if (me?['mustChangePassword'] == true && !_asked) {
      _asked = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) changePassword(forced: true);
      });
    }
    final twoFactor = me?['twoFactor'] == true;
    return PopupMenuButton<String>(
      key: const Key('account-menu'),
      tooltip: 'My account',
      onSelected: (v) => switch (v) {
        'password' => changePassword(),
        'pin' => _managePin(),
        'unlock' => _manageUnlock(),
        'twostep' => showAppDialog<void>(context: context, builder: (_) => TwoStepDialog(session: s)),
        'logout' => _signOut(),
        _ => null,
      },
      itemBuilder: (_) => [
        PopupMenuItem(enabled: false, child: Text('${s.userName} · ${s.role}')),
        const PopupMenuItem(value: 'password', child: ListTile(leading: Icon(Icons.key_outlined), title: Text('Change my password'))),
        PopupMenuItem(value: 'pin', child: ListTile(leading: Icon(_pin ? Icons.lock : Icons.lock_outline, color: _pin ? Colors.green : null), title: Text(_pin ? 'Quick PIN is set for this device' : 'Set a quick PIN for this device'))),
        // only what this device supports (Android fingerprint / face, Windows Hello; never on the web)
        if (_kind != UnlockKind.none || _unlock)
          PopupMenuItem(
              value: 'unlock',
              child: ListTile(
                  leading: Icon(_kind == UnlockKind.windowsHello ? Icons.face_retouching_natural : Icons.fingerprint, color: _unlock ? Colors.green : null),
                  title: Text(_unlock ? '${unlockName(_kind)[0].toUpperCase()}${unlockName(_kind).substring(1)} is on for this device' : 'Use ${unlockName(_kind)} on this device'))),
        if (s.token.startsWith('u.'))
          PopupMenuItem(value: 'twostep', child: ListTile(leading: Icon(Icons.verified_user_outlined, color: twoFactor ? Colors.green : null), title: Text(twoFactor ? 'Two-step sign-in is on' : 'Two-step sign-in'))),
        const PopupMenuItem(value: 'logout', child: ListTile(leading: Icon(Icons.logout), title: Text('Log out'))),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.account_circle_outlined),
          if (widget.showName) ...[const SizedBox(width: 6), Text(s.userName)],
        ]),
      ),
    );
  }
}

/// The account actions, shared by the account menu and the account card on This device: each asks for the current
/// password where it changes how someone signs in (auth_repository.dart).
mixin _AccountActions<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  bool _pin = false, _unlock = false;
  UnlockKind _kind = UnlockKind.none; // what this device's system offers (none on the web)

  Session get s;

  Future<void> _loadPin() async {
    final repo = ref.read(authRepositoryProvider);
    final v = await repo.secrets.hasPin(s.tenant, s.userId);
    final u = await repo.secrets.hasUnlock(s.tenant, s.userId);
    final k = await repo.check.kind();
    if (mounted) {
      setState(() {
        _pin = v;
        _unlock = u;
        _kind = k;
      });
    }
  }

  Future<void> changePassword({bool forced = false}) async {
    final first = s.userName.split(RegExp(r'\s+')).first;
    // a change asked for (not the first-sign-in one) needs the current password first
    if (!forced) {
      final now = await askCurrentPassword(context, 'You are about to change your password.');
      if (now == null || !mounted) return;
      if (!await ref.read(authRepositoryProvider).reauthenticate(s.tenant, s.userId, now)) {
        if (mounted) say(context, 'Wrong password. Your password was not changed.', error: true);
        return;
      }
      if (!mounted) return;
    }
    final pw = await askTwice(
      context,
      title: forced ? 'Welcome, $first. Set your own password' : 'Change my password',
      message: forced ? 'You signed in with a temporary password. Choose a new one (8+ characters) that only you know.' : 'New password (8+ characters)',
      again: 'Type the new password again',
      save: 'Save password',
      check: (v) => v.length < 8 ? 'Use a password of at least 8 characters.' : null,
    );
    if (pw == null) return;
    final fields = await makePasswordAsync(pw);
    final store = ref.read(recordStoreProvider);
    final me = await store.get('users', s.userId);
    final branch = (await ref.read(pharmacyProvider.future)).branch;
    await store.update((d) {
      if (me == null) return;
      d.put('users', {...me, ...fields}..remove('mustChangePassword'));
      d.audit(s.userName, 'Password changed', s.userName, branch);
    });
    await ref.read(authRepositoryProvider).secrets.remember(s.tenant, s.userId, pw);
    if (mounted) say(context, 'Password changed');
  }

  Future<void> _managePin() async {
    final repo = ref.read(authRepositoryProvider);
    if (await repo.secrets.hasPin(s.tenant, s.userId)) {
      if (!mounted) return;
      if (await confirmAction(context, 'Remove this device’s quick PIN?', 'You will sign in with your full password on this device. You can set a new PIN any time.', 'Remove PIN')) {
        if (!mounted) return;
        final pw = await askCurrentPassword(context, 'Removing the quick PIN changes how you sign in on this device.');
        if (pw == null) return;
        final err = await repo.clearPin(s.tenant, s.userId, password: pw);
        await _loadPin();
        if (mounted) say(context, err ?? 'PIN removed from this device', error: err != null);
      }
      return;
    }
    if (!mounted) return;
    final pw = await askCurrentPassword(context, 'A quick PIN lets you sign in on this device without your full password.');
    if (pw == null || !mounted) return;
    if (!await repo.reauthenticate(s.tenant, s.userId, pw)) {
      if (mounted) say(context, 'Wrong password. No PIN was set.', error: true);
      return;
    }
    if (!mounted) return;
    final pin = await askTwice(
      context,
      title: 'Set a quick PIN for this device',
      message: 'A 4–8 digit PIN signs you in on this device, even offline, without typing your full password. It is kept on this device only, never synced.',
      again: 'Type the PIN again',
      save: 'Save PIN',
      digits: true,
      check: (v) => RegExp(r'^\d{4,8}$').hasMatch(v) ? null : 'A PIN is 4 to 8 digits.',
    );
    if (pin == null) return;
    final err = await repo.setPin(s.tenant, s.userId, password: pw, pin: pin);
    await _loadPin();
    if (mounted) say(context, err ?? 'Quick PIN set for this device', error: err != null);
  }

  /// Fingerprint / face (Android) or Windows Hello: turned on or off only after the current password.
  Future<void> _manageUnlock() async {
    final repo = ref.read(authRepositoryProvider);
    final name = unlockName(_kind);
    if (_unlock) {
      if (!await confirmAction(context, 'Turn off $name?', 'You will sign in with your PIN or password on this device.', 'Turn off')) return;
      if (!mounted) return;
      final pw = await askCurrentPassword(context, 'Turning off $name changes how you sign in on this device.');
      if (pw == null) return;
      final err = await repo.disableUnlock(s.tenant, s.userId, password: pw);
      await _loadPin();
      if (mounted) say(context, err ?? '${name[0].toUpperCase()}${name.substring(1)} turned off on this device', error: err != null);
      return;
    }
    final ok = await confirmAction(
      context,
      'Use $name to sign in?',
      'Your ${_kind == UnlockKind.windowsHello ? 'Windows Hello face, fingerprint or PIN' : 'fingerprint or face'} is checked by '
          '${_kind == UnlockKind.windowsHello ? 'Windows' : 'Android'}; RxPOS never sees or keeps it. Only for a device that only you use: '
          'anyone whose fingerprint or face is set up on this device could open your account, so only one person per device can turn this on. '
          'Your password is still needed after $offlineDays days without signing in online, and when this is turned off.',
      'Continue',
    );
    if (!ok || !mounted) return;
    final pw = await askCurrentPassword(context, 'Turning on $name changes how you sign in on this device.');
    if (pw == null) return;
    final err = await repo.enableUnlock(s.tenant, s.userId, password: pw);
    await _loadPin();
    if (mounted) say(context, err ?? '${name[0].toUpperCase()}${name.substring(1)} is on for this device', error: err != null);
  }

  Future<void> _signOut() async {
    final messenger = ScaffoldMessenger.of(context);
    final repo = ref.read(authRepositoryProvider);
    final unsent = await repo.unsent();
    final mine = (await ref.read(recordStoreProvider).rows('drafts')).where((d) => d['userId'] == s.userId).length;
    await ref.read(sessionControllerProvider.notifier).signOut();
    final note = unsent > 0
        ? '$unsent change(s) are kept on this device and will be sent when someone signs in again.'
        : mine > 0
            ? 'Your $mine held sale${mine == 1 ? '' : 's'}/draft${mine == 1 ? '' : 's'} stay saved: continue ${mine == 1 ? 'it' : 'them'} after signing in, on any device.'
            : null;
    if (note != null) messenger.showSnackBar(SnackBar(content: Text(note)));
  }
}

/// Switch two-step sign-in on or off for yourself: scan a QR code with an authenticator app, confirm with a code.
class TwoStepDialog extends ConsumerStatefulWidget {
  const TwoStepDialog({super.key, required this.session});
  final Session session;
  @override
  ConsumerState<TwoStepDialog> createState() => _TwoStepDialogState();
}

class _TwoStepDialogState extends ConsumerState<TwoStepDialog> {
  String _stage = 'loading', _error = '', _uri = '', _secret = '';
  bool _busy = false;
  final _code = TextEditingController();

  @override
  void initState() {
    super.initState();
    ref.read(cloudApiProvider).get('/api/2fa').then((r) {
      if (mounted) setState(() => _stage = r['enabled'] == true ? 'on' : 'off');
    }, onError: (Object e) {
      if (mounted) {
        setState(() {
          _stage = 'error';
          _error = '$e'.replaceFirst('Exception: ', '');
        });
      }
    });
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _go(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
    } catch (e) {
      if (mounted) say(context, '$e'.replaceFirst('Exception: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, Object?>> _post(String path, Map<String, Object?> body) async {
    final r = await ref.read(cloudApiProvider).post('/api/2fa$path', body);
    if (r['error'] != null) throw Exception(r['error']);
    return r;
  }

  Widget _codeBox() => TextField(
        key: const Key('twostep-code'),
        controller: _code,
        autofocus: true,
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength: 6,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: const TextStyle(fontSize: 24, letterSpacing: 8),
        decoration: const InputDecoration(hintText: '000000', counterText: ''),
        onChanged: (_) => setState(() {}),
      );

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    final t = Theme.of(context);
    final actions = <Widget>[];
    Widget body;
    switch (_stage) {
      case 'loading':
        body = const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
      case 'error':
        body = Text(_error, style: TextStyle(color: t.colorScheme.error));
        actions.add(TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')));
      case 'off':
        body = const Text('Protect your account even if someone learns your password: signing in on a new device also asks for a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy…).');
        actions.addAll([
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
          FilledButton.icon(
            onPressed: _busy
                ? null
                : () => _go(() async {
                      final r = await _post('/setup', const {});
                      setState(() {
                        _stage = 'setup';
                        _uri = '${r['uri'] ?? ''}';
                        _secret = '${r['secret'] ?? ''}';
                      });
                      _code.clear();
                    }),
            icon: const Icon(Icons.verified_user_outlined),
            label: const Text('Set it up'),
          ),
        ]);
      case 'setup':
        body = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('1. In the authenticator app, add an account and scan this code:'),
          const SizedBox(height: 8),
          Center(child: Container(color: Colors.white, padding: const EdgeInsets.all(8), child: SizedBox.square(dimension: 180, child: CustomPaint(key: const Key('twostep-qr'), painter: QrPainter(_uri))))),
          const SizedBox(height: 6),
          TextButton(onPressed: () => launchUrl(Uri.parse(_uri)), child: const Text('On this phone? Open in the authenticator app')),
          SelectableText('Or type the key: ${_secret.replaceAllMapped(RegExp(r'.{4}'), (m) => '${m[0]} ').trim()}', textAlign: TextAlign.center, style: t.textTheme.bodySmall),
          const SizedBox(height: 8),
          const Text('2. Type the 6-digit code the app shows:'),
          _codeBox(),
        ]);
        actions.addAll([
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: _busy || _code.text.length != 6
                ? null
                : () => _go(() async {
                      await _post('/enable', {'code': _code.text});
                      await ref.read(recordStoreProvider).db.into(ref.read(recordStoreProvider).db.kv).insertOnConflictUpdate(
                            KvCompanion.insert(k: trustKey(s.tenant, s.userId), v: '1'),
                          );
                      setState(() => _stage = 'on');
                      _code.clear();
                      if (context.mounted) say(context, 'Two-step sign-in is on. Signing in on a new device will ask for a code.');
                    }),
            child: const Text('Switch on'),
          ),
        ]);
      default: // on
        body = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Row(children: [Icon(Icons.verified_user, color: Colors.green), SizedBox(width: 6), Expanded(child: Text('Two-step sign-in is on for your account.'))]),
          const SizedBox(height: 8),
          Text('To switch it off (or move it to a new phone), type a current code from the app:', style: t.textTheme.bodySmall),
          _codeBox(),
        ]);
        actions.addAll([
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: t.colorScheme.error),
            onPressed: _busy || _code.text.length != 6
                ? null
                : () => _go(() async {
                      await _post('/disable', {'code': _code.text});
                      setState(() => _stage = 'off');
                      _code.clear();
                      if (context.mounted) say(context, 'Two-step sign-in is off');
                    }),
            icon: const Icon(Icons.shield_outlined),
            label: const Text('Switch off'),
          ),
        ]);
    }
    return AlertDialog(
      title: const Row(children: [Icon(Icons.verified_user_outlined), SizedBox(width: 8), Text('Two-step sign-in')]),
      content: SizedBox(width: 420, child: SingleChildScrollView(child: body)),
      actions: actions,
    );
  }
}

/// A QR code (the barcode package), black on white.
class QrPainter extends CustomPainter {
  QrPainter(this.data);
  final String data;
  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;
    final paint = Paint()..color = Colors.black;
    try {
      for (final e in Barcode.qrCode().make(data, width: size.width, height: size.height)) {
        if (e is BarcodeBar && e.black) canvas.drawRect(Rect.fromLTWH(e.left, e.top, e.width, e.height), paint);
      }
    } catch (_) {
      // text the QR code can't hold
    }
  }

  @override
  bool shouldRepaint(QrPainter old) => old.data != data;
}

/// This device: who is signed in, how they sign in here (password, quick PIN, fingerprint / Windows Hello, two-step)
/// and a Log out row (the owner's reference, 2026-11-16). The same actions as the account menu.
class AccountCard extends ConsumerStatefulWidget {
  const AccountCard({super.key, required this.session});
  final Session session;
  @override
  ConsumerState<AccountCard> createState() => _AccountCardState();
}

class _AccountCardState extends ConsumerState<AccountCard> with _AccountActions<AccountCard> {
  @override
  Session get s => widget.session;

  @override
  void initState() {
    super.initState();
    _loadPin();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final me = ref.watch(tableProvider('users')).value?.where((u) => u['id'] == s.userId).firstOrNull;
    final initials = s.userName.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0].toUpperCase()).join();
    final name = unlockName(_kind);
    Widget action(Key key, IconData icon, String label, VoidCallback onTap, {bool on = false}) =>
        OutlinedButton.icon(key: key, onPressed: onTap, icon: Icon(icon, color: on ? Colors.green.shade700 : null), label: Text(label));
    return Card(
      key: const Key('account-card'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            CircleAvatar(radius: 26, backgroundColor: t.colorScheme.primaryContainer, child: Text(initials, style: TextStyle(fontWeight: FontWeight.w800, color: t.colorScheme.onPrimaryContainer))),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.userName, style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800), maxLines: 2, overflow: TextOverflow.ellipsis),
                Text([if (s.email.isNotEmpty) s.email, s.role].join(' · '), style: t.textTheme.bodySmall),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            action(const Key('card-password'), Icons.key_outlined, 'Change password', () => changePassword()),
            action(const Key('card-pin'), _pin ? Icons.lock : Icons.lock_outline, _pin ? 'Quick PIN is set' : 'Set a quick PIN', _managePin, on: _pin),
            if (_kind != UnlockKind.none || _unlock)
              action(const Key('card-unlock'), _kind == UnlockKind.windowsHello ? Icons.face_retouching_natural : Icons.fingerprint,
                  _unlock ? '${name[0].toUpperCase()}${name.substring(1)} is on' : 'Use $name', _manageUnlock, on: _unlock),
            if (s.token.startsWith('u.'))
              action(const Key('card-twostep'), Icons.verified_user_outlined, me?['twoFactor'] == true ? 'Two-step sign-in is on' : 'Two-step sign-in',
                  () => showAppDialog<void>(context: context, builder: (_) => TwoStepDialog(session: s)), on: me?['twoFactor'] == true),
          ]),
          const SizedBox(height: 12),
          Material(
            color: t.colorScheme.errorContainer.withValues(alpha: .55),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              key: const Key('card-logout'),
              borderRadius: BorderRadius.circular(12),
              onTap: _signOut,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(children: [
                  Icon(Icons.logout, color: t.colorScheme.error),
                  const SizedBox(width: 10),
                  Text('Log out', style: TextStyle(color: t.colorScheme.error, fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
