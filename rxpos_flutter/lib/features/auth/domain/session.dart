/// Who is signed in on this device, and to which pharmacy (POST /api/login's reply, kept in the device database).
class Session {
  const Session({required this.token, required this.tenant, required this.slug, required this.pharmacy, required this.userId,
      required this.userName, required this.email, required this.role, required this.signedInAt});

  factory Session.fromLogin(Map<String, Object?> j) {
    final u = (j['user'] as Map?)?.cast<String, Object?>() ?? const {};
    return Session(
      token: j['token'] as String, tenant: '${j['tenant']}', slug: '${j['slug'] ?? j['tenant']}', pharmacy: '${j['pharmacy'] ?? ''}',
      userId: '${u['id'] ?? ''}', userName: '${u['name'] ?? ''}', email: '${u['email'] ?? ''}', role: '${u['role'] ?? 'cashier'}',
      signedInAt: DateTime.now().toUtc().toIso8601String(),
    );
  }

  factory Session.fromJson(Map<String, Object?> j) => Session(
      token: j['token'] as String, tenant: j['tenant'] as String, slug: j['slug'] as String, pharmacy: j['pharmacy'] as String,
      userId: j['userId'] as String, userName: j['userName'] as String, email: j['email'] as String, role: j['role'] as String,
      signedInAt: j['signedInAt'] as String);

  final String token, tenant, slug, pharmacy, userId, userName, email, role, signedInAt;

  Map<String, Object?> toJson() => {'token': token, 'tenant': tenant, 'slug': slug, 'pharmacy': pharmacy, 'userId': userId,
    'userName': userName, 'email': email, 'role': role, 'signedInAt': signedInAt};
}

/// A pharmacy to choose when one email works at several.
class PharmacyChoice {
  const PharmacyChoice({required this.code, required this.name, required this.role});
  final String code, name, role;
}

/// How a sign-in attempt ended.
sealed class SignInOutcome {
  const SignInOutcome();
}

class SignedIn extends SignInOutcome {
  const SignedIn(this.session);
  final Session session;
}

class ChoosePharmacy extends SignInOutcome {
  const ChoosePharmacy(this.choices);
  final List<PharmacyChoice> choices;
}

/// Two-step sign-in: type the code from the authenticator app ([message] when the last code was wrong).
class NeedsCode extends SignInOutcome {
  const NeedsCode([this.message]);
  final String? message;
}

class SignInFailed extends SignInOutcome {
  const SignInFailed(this.message);
  final String message;
}
