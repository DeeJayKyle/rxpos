import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session_controller.dart';
import '../domain/session.dart';

/// Sign in with the pharmacy's RxPOS account (the same email and password as rxposug.com).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController(), _password = TextEditingController(), _code = TextEditingController();
  bool _busy = false, _needsCode = false;
  String? _error, _pharmacy;
  List<PharmacyChoice> _choices = const [];

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final out = await ref.read(sessionControllerProvider.notifier).signIn(
        email: _email.text, password: _password.text, pharmacy: _pharmacy, code: _needsCode ? _code.text : null);
    if (!mounted) return;
    setState(() {
      _busy = false;
      switch (out) {
        case SignedIn():
          break; // the router opens the till
        case ChoosePharmacy(:final choices):
          _choices = choices;
        case NeedsCode(:final message):
          _needsCode = true;
          _error = message;
        case SignInFailed(:final message):
          _error = message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.asset('assets/icon.png', width: 36, height: 36)),
                      const SizedBox(width: 10),
                      Text('RxPOS', style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    ]),
                    const SizedBox(height: 6),
                    Text('Sign in with your pharmacy account', style: t.textTheme.bodyMedium),
                    const SizedBox(height: 20),
                    TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email or username'),
                        keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], textInputAction: TextInputAction.next),
                    const SizedBox(height: 12),
                    TextField(controller: _password, decoration: const InputDecoration(labelText: 'Password'), obscureText: true,
                        autofillHints: const [AutofillHints.password], onSubmitted: (_) => _submit()),
                    if (_choices.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _pharmacy,
                        decoration: const InputDecoration(labelText: 'Pharmacy'),
                        items: [for (final c in _choices) DropdownMenuItem(value: c.code, child: Text('${c.name} · ${c.role}'))],
                        onChanged: (v) => setState(() => _pharmacy = v),
                      ),
                    ],
                    if (_needsCode) ...[
                      const SizedBox(height: 12),
                      TextField(controller: _code, autofocus: true, keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Code from your authenticator app'), onSubmitted: (_) => _submit()),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: t.colorScheme.error)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy || (_choices.isNotEmpty && _pharmacy == null) ? null : _submit,
                      child: Padding(padding: const EdgeInsets.all(12), child: Text(_busy ? 'Signing in…' : 'Sign in')),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
