/// A failed cloud call, in words a pharmacist can act on.
class ApiFailure implements Exception {
  const ApiFailure(this.kind, this.message, {this.status});

  final ApiFailureKind kind;
  final String message;
  final int? status;

  @override
  String toString() => message;
}

enum ApiFailureKind { offline, signInAgain, refused, server }
