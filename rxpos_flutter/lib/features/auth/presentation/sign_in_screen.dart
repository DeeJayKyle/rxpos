// Sign in (src/pages/Auth.jsx): email or username and password, the pharmacy's code when needed, "Remember me for
// 30 days", offline with this device's own verifier, the quick PIN for this device, two-step sign-in, a choice when
// one email works at several pharmacies, a question before switching this device to another pharmacy, and the
// forgotten password (a code by email or SMS, Google on the web page, or the administrator on WhatsApp).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/data/device_settings.dart';
import '../../../core/data/record_store.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/presentation/widgets.dart';
import '../../../core/sync/sync_engine.dart';
import '../../extras/domain/extras.dart';
import '../application/session_controller.dart';
import '../data/auth_repository.dart' show classicChoice, ownerChoice;
import '../domain/session.dart';

const lastEmailKey = 'last-email', rememberChoiceKey = 'remember-choice';

/// A password box with a show / hide eye (src/password.jsx).
class PasswordField extends StatefulWidget {
  const PasswordField({super.key, required this.controller, this.label = 'Password', this.onSubmitted, this.autofocus = false, this.hints = const [AutofillHints.password]});
  final TextEditingController controller;
  final String label;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final List<String> hints;
  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _show = false;
  @override
  Widget build(BuildContext context) => TextField(
        controller: widget.controller,
        obscureText: !_show,
        autofocus: widget.autofocus,
        autofillHints: widget.hints,
        onSubmitted: widget.onSubmitted,
        decoration: InputDecoration(
          labelText: widget.label,
          suffixIcon: IconButton(tooltip: _show ? 'Hide password' : 'Show password', icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined), onPressed: () => setState(() => _show = !_show)),
        ),
      );
}

enum _Stage { main, choose, twoStep, forgotAsk, forgotCode, pin }

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController(), _password = TextEditingController(), _code = TextEditingController();
  final _totp = TextEditingController(), _otp = TextEditingController(), _newPassword = TextEditingController(), _pin = TextEditingController();
  _Stage _stage = _Stage.main;
  bool _busy = false, _needsCode = false, _remember = false, _google = false;
  String? _error, _pharmacy, _held, _channel, _forgotNote;
  String _adminPhone = '', _pharmacyName = '';
  Map<String, Object?>? _pinUser;
  List<PharmacyChoice> _choices = const [];

  @override
  void initState() {
    super.initState();
    _email.addListener(_findPin);
    Future(() async {
      final repo = ref.read(authRepositoryProvider);
      final link = await repo.link();
      final email = await ref.read(deviceValueProvider(lastEmailKey).future);
      final remember = await ref.read(deviceValueProvider(rememberChoiceKey).future);
      final st = await ref.read(recordStoreProvider).settingsRecord();
      if (!mounted) return;
      setState(() {
        _held = link == null ? null : '${link['pharmacy'] ?? link['slug'] ?? ''}';
        _remember = remember == '1';
        _pharmacyName = '${st['name'] ?? ''}';
        _adminPhone = normalizePhone('${st['adminWhatsApp'] ?? st['phone'] ?? ''}');
        if (email != null && _email.text.isEmpty) _email.text = email;
      });
    });
  }

  @override
  void dispose() {
    for (final c in [_email, _password, _code, _totp, _otp, _newPassword, _pin]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _findPin() async {
    final u = await ref.read(authRepositoryProvider).pinUser(_email.text);
    if (mounted && u?['id'] != _pinUser?['id']) setState(() => _pinUser = u);
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await fn();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _keepRemember(bool v) async {
    setState(() => _remember = v);
    await ref.read(deviceValueProvider(rememberChoiceKey).notifier).set(v ? '1' : '0');
  }

  Future<void> _submit({bool allowSwitch = false}) => _run(() async {
        final email = _email.text.trim().toLowerCase();
        await ref.read(deviceValueProvider(lastEmailKey).notifier).set(email);
        final out = await ref.read(sessionControllerProvider.notifier).signIn(
              email: email,
              password: _password.text,
              pharmacy: _pharmacy ?? (_code.text.trim().isEmpty ? null : _code.text),
              code: _stage == _Stage.twoStep ? _totp.text : null,
              remember: _remember,
              allowSwitch: allowSwitch,
            );
        if (!mounted) return;
        switch (out) {
          case SignedIn():
            break; // the router opens the app
          case ChoosePharmacy(:final choices):
            setState(() {
              _choices = choices;
              _stage = _Stage.choose;
            });
          case NeedsCode(:final message):
            setState(() {
              if (_stage != _Stage.twoStep) _totp.clear();
              _stage = _Stage.twoStep;
              _error = message;
            });
          case NeedsPharmacyCode(:final message):
            setState(() {
              _needsCode = true;
              _error = message;
            });
          case ConfirmSwitch(:final pharmacy, :final current):
            final yes = await confirmAction(
              context,
              'Switch this device to $pharmacy?',
              'This device holds $current. Signing in to $pharmacy downloads that pharmacy instead (it needs the internet). '
                  '$current stays safe in the cloud. Changes it has not sent yet must reach the cloud first. Its staff sign in again to switch back.',
              'Switch to $pharmacy',
            );
            if (yes) await _submit(allowSwitch: true);
          case SignInFailed(:final message):
            setState(() => _error = message);
        }
      });

  Future<void> _signInPin() => _run(() async {
        final out = await ref.read(sessionControllerProvider.notifier).signInWithPin(_email.text, _pin.text, remember: _remember);
        if (out is SignInFailed && mounted) {
          setState(() => _error = out.message);
          _pin.clear();
          await _findPin();
        }
      });

  Future<void> _sendCode(String channel) => _run(() async {
        if (_email.text.trim().isEmpty) throw 'Enter your email first.';
        final r = await ref.read(authRepositoryProvider).forgotPassword(email: _email.text, pharmacy: _code.text, channel: channel);
        if (!mounted) return;
        setState(() {
          _channel = channel;
          _forgotNote = '${r['message'] ?? 'We sent you a code.'}${r['hint'] != null ? ' (${r['hint']})' : ''}';
          _stage = _Stage.forgotCode;
          _otp.clear();
          _newPassword.clear();
        });
      });

  Future<void> _confirmReset() => _run(() async {
        if (_newPassword.text.length < 8) throw 'Use a password of at least 8 characters.';
        await ref.read(authRepositoryProvider).resetPassword(email: _email.text, pharmacy: _code.text, code: _otp.text, password: _newPassword.text, channel: _channel ?? 'email');
        if (!mounted) return;
        say(context, 'Password changed. Sign in with it now.');
        setState(() {
          _stage = _Stage.main;
          _password.clear();
        });
      });

  Future<void> _openForgot() async {
    setState(() {
      _stage = _Stage.forgotAsk;
      _error = null;
    });
    final g = await ref.read(authRepositoryProvider).googleReset();
    if (mounted) setState(() => _google = g);
  }

  /// A full-width button whose label wraps on a narrow phone instead of running off the card.
  Widget _option(IconData icon, String label, VoidCallback? onTap) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: OutlinedButton(
          onPressed: onTap,
          child: Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Row(children: [Icon(icon, size: 18), const SizedBox(width: 10), Expanded(child: Text(label))])),
        ),
      );

  Widget _back(String label, VoidCallback onTap) => Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: _busy ? null : onTap, icon: const Icon(Icons.arrow_back, size: 16), label: Text(label)));

  Widget _errorText(ThemeData t) => _error == null
      ? const SizedBox.shrink()
      : Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, key: const Key('sign-in-error'), style: TextStyle(color: t.colorScheme.error)));

  Widget _codeField() => TextField(
        controller: _code,
        decoration: const InputDecoration(labelText: 'Pharmacy web address or code', hintText: 'e.g. citycare-ntinda'),
        autocorrect: false,
      );

  Widget _otpBox(TextEditingController c, String hint, String label, {required VoidCallback onDone, int max = 6}) => TextField(
        controller: c,
        key: Key('otp-$label'),
        autofocus: true,
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength: max,
        obscureText: label == 'pin',
        style: const TextStyle(fontSize: 24, letterSpacing: 8),
        decoration: InputDecoration(hintText: hint, counterText: ''),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => onDone(),
      );

  List<Widget> _main(ThemeData t) {
    final isUsername = _email.text.trim().isNotEmpty && !_email.text.contains('@');
    return [
      Text(_held?.isNotEmpty == true ? 'Sign in · this device: $_held' : 'Sign in with your pharmacy account', style: t.textTheme.bodyMedium),
      const SizedBox(height: 20),
      TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email or username'), keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.username], textInputAction: TextInputAction.next, autocorrect: false, onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      PasswordField(controller: _password, onSubmitted: (_) => _submit()),
      if (_needsCode || (isUsername && _held == null)) ...[const SizedBox(height: 12), _codeField()],
      const SizedBox(height: 8),
      Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Row(mainAxisSize: MainAxisSize.min, children: [
          Checkbox(key: const Key('remember-me'), value: _remember, onChanged: (v) => _keepRemember(v ?? false)),
          Flexible(child: GestureDetector(onTap: () => _keepRemember(!_remember), child: const Text('Remember me for 30 days'))),
        ]),
        TextButton(onPressed: _openForgot, child: const Text('Forgot password?')),
      ]),
      if (_remember) Text('Stays signed in on this device. Leave it off on a shared computer.', style: t.textTheme.bodySmall),
      _errorText(t),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: _busy ? null : _submit,
        child: Padding(padding: const EdgeInsets.all(12), child: Text(_busy ? 'Signing in…' : 'Sign in')),
      ),
      if (_pinUser != null) ...[
        const SizedBox(height: 8),
        _option(Icons.lock_outline, 'Use the PIN for this device', () => setState(() {
              _stage = _Stage.pin;
              _error = null;
              _pin.clear();
            })),
      ],
    ];
  }

  /// The owner's places (the owner console, pharmacies, the classic app), not just pharmacies.
  bool get _ownerPlaces => _choices.any((c) => c.code == ownerChoice);

  List<Widget> _choose(ThemeData t) => [
        _back('Back', () => setState(() => _stage = _Stage.main)),
        Text(_ownerPlaces ? 'Where to?' : 'Which pharmacy?', textAlign: TextAlign.center, style: t.textTheme.titleMedium),
        Text(_ownerPlaces ? 'Signed in as the RxPOS owner (${_email.text})' : '${_email.text} works at ${_choices.length} pharmacies',
            textAlign: TextAlign.center, style: t.textTheme.bodySmall),
        const SizedBox(height: 12),
        for (final c in _choices)
          Card(
            child: ListTile(
              key: Key('choose-${c.code}'),
              leading: Icon(c.code == ownerChoice ? Icons.admin_panel_settings_outlined : c.code == classicChoice ? Icons.history : Icons.business_outlined),
              title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(c.code == ownerChoice || c.code == classicChoice
                  ? c.role
                  : [c.code, if (c.role.isNotEmpty) c.role, if (c.code == _held) 'this device', if (_ownerPlaces) 'the new app'].join(' · ')),
              trailing: const Icon(Icons.login),
              onTap: _busy
                  ? null
                  : () {
                      _pharmacy = c.code;
                      _submit();
                    },
            ),
          ),
        _errorText(t),
        if (_busy) const Padding(padding: EdgeInsets.all(8), child: Text('Signing in…', textAlign: TextAlign.center)),
      ];

  List<Widget> _twoStep(ThemeData t) => [
        _back('Back', () => setState(() => _stage = _Stage.main)),
        const Icon(Icons.verified_user_outlined, size: 28),
        Text('Two-step sign-in', textAlign: TextAlign.center, style: t.textTheme.titleMedium),
        Text('Type the 6-digit code from the authenticator app on your phone', textAlign: TextAlign.center, style: t.textTheme.bodySmall),
        const SizedBox(height: 12),
        _otpBox(_totp, '000000', 'totp', onDone: () => _totp.text.length == 6 ? _submit() : null),
        _errorText(t),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy || _totp.text.length != 6 ? null : _submit, child: Padding(padding: const EdgeInsets.all(12), child: Text(_busy ? 'Checking…' : 'Sign in'))),
        const SizedBox(height: 8),
        Text('Lost your phone? Your administrator can switch two-step sign-in off for you (Users & Roles).', textAlign: TextAlign.center, style: t.textTheme.bodySmall),
      ];

  List<Widget> _pinStage(ThemeData t) => [
        _back('Use password instead', () => setState(() => _stage = _Stage.main)),
        const Icon(Icons.lock_outline, size: 28),
        Text('Quick PIN', textAlign: TextAlign.center, style: t.textTheme.titleMedium),
        Text('Enter the PIN set on this device${_pinUser?['name'] != null ? ' for ${_pinUser!['name']}' : ''}', textAlign: TextAlign.center, style: t.textTheme.bodySmall),
        const SizedBox(height: 12),
        _otpBox(_pin, 'PIN', 'pin', max: 8, onDone: () => _pin.text.length >= 4 ? _signInPin() : null),
        _errorText(t),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy || _pin.text.length < 4 ? null : _signInPin, child: Padding(padding: const EdgeInsets.all(12), child: Text(_busy ? 'Checking…' : 'Sign in'))),
      ];

  List<Widget> _forgotAsk(ThemeData t) {
    final cloud = syncBase(ref.read(appConfigProvider).cloudUrl);
    return [
      _back('Back to sign in', () => setState(() {
            _stage = _Stage.main;
            _error = null;
          })),
      Text("We'll send a 6-digit code to the email or phone saved on your account.", textAlign: TextAlign.center, style: t.textTheme.bodyMedium),
      const SizedBox(height: 12),
      TextField(controller: _email, autofocus: true, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Your email')),
      if (_needsCode || _held == null) ...[const SizedBox(height: 12), _codeField()],
      _errorText(t),
      const SizedBox(height: 12),
      if (_google)
        _option(Icons.g_mobiledata, 'Reset with Google (opens the web page)', () => launchUrl(Uri.parse('$cloud/${_code.text.trim()}#/forgot'), mode: LaunchMode.externalApplication)),
      _option(Icons.mail_outline, 'Email me a code', _busy ? null : () => _sendCode('email')),
      _option(Icons.sms_outlined, 'Send a code by SMS', _busy ? null : () => _sendCode('sms')),
      _option(
        Icons.chat_outlined,
        'Ask my administrator on WhatsApp',
        _adminPhone.length < 12
            ? null
            : () => launchUrl(
                  Uri.parse(whatsappLink(_adminPhone, 'Hello, this is ${_email.text.isEmpty ? '(my email)' : _email.text}. I forgot my RxPOS password at $_pharmacyName. Please reset it for me.')),
                  mode: LaunchMode.externalApplication,
                ),
      ),
    ];
  }

  List<Widget> _forgotCode(ThemeData t) => [
        _back('Back to sign in', () => setState(() => _stage = _Stage.main)),
        Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: t.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(8)), child: Text(_forgotNote ?? '')),
        const SizedBox(height: 12),
        TextField(key: const Key('reset-code'), controller: _otp, autofocus: true, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: '6-digit code', counterText: '')),
        PasswordField(controller: _newPassword, label: 'New password (8+ characters)', hints: const [AutofillHints.newPassword], onSubmitted: (_) => _confirmReset()),
        _errorText(t),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _confirmReset, child: Padding(padding: const EdgeInsets.all(12), child: Text(_busy ? 'Saving…' : 'Set new password'))),
        TextButton(onPressed: () => setState(() => _stage = _Stage.forgotAsk), child: const Text("Didn't get it? Try again")),
      ];

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final wide = MediaQuery.sizeOf(context).width >= 980;
    final card = ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: AutofillGroup(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.asset('assets/icon.png', width: 36, height: 36)),
                const SizedBox(width: 10),
                Text('RxPOS', style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(height: 6),
              ...switch (_stage) {
                _Stage.main => _main(t),
                _Stage.choose => _choose(t),
                _Stage.twoStep => _twoStep(t),
                _Stage.pin => _pinStage(t),
                _Stage.forgotAsk => _forgotAsk(t),
                _Stage.forgotCode => _forgotCode(t),
              },
            ]),
          ),
        ),
      ),
    );
    Widget point(IconData i, String s) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(children: [Icon(i, color: Colors.white70), const SizedBox(width: 12), Expanded(child: Text(s, style: const TextStyle(color: Colors.white, fontSize: 16)))]),
        );
    final hero = Container(
      color: const Color(0xFF0B3B3C),
      padding: const EdgeInsets.all(48),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        const Text('RxPOS', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Run your pharmacy anywhere, even offline.', style: TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800)),
          const SizedBox(height: 24),
          point(Icons.bolt, 'Lightning-fast checkout, barcode scanning and Mobile Money'),
          point(Icons.wifi_off, 'Keeps selling when the internet is down, then syncs automatically'),
          point(Icons.devices, 'One system on Windows PCs, Android phones and the web, across all your branches'),
          point(Icons.verified_user_outlined, 'Batch & expiry tracking, drug information, audit trail, finance and reports built in'),
        ]),
        Text('© ${DateTime.now().year} RxPOS', style: const TextStyle(color: Colors.white54)),
      ]),
    );
    final side = Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: card));
    return Scaffold(body: wide ? Row(children: [Expanded(child: hero), Expanded(child: side)]) : side);
  }
}
