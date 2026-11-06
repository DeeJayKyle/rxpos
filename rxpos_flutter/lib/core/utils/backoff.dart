import 'dart:math';

/// Retry delay after [failures] failures: min(60 s, 1 s · 2ⁿ) × a random 0.5–1.5 (the same rule as src/sync.js, so
/// many devices coming back online at once do not all retry together).
Duration backoff(int failures, {Random? random}) {
  final base = min(60000, 1000 * pow(2, max(0, failures)).toInt());
  final jitter = 0.5 + (random ?? Random()).nextDouble();
  return Duration(milliseconds: (base * jitter).round());
}
