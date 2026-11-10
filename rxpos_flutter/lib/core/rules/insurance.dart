// Insurance (workplan step 22), the same rules as src/insurance.js and checked against the same cases
// (tests/insurance-cases.json). An insurer has schemes; a scheme says what the patient pays at the till (the co-pay: a
// percentage of the sale or a fixed amount, whichever is more) and may cap what the insurer covers per sale. The sale
// keeps the split in insurance.share (what the insurer owes) and paid (what the patient paid now). The insurer's share
// is owed like credit: not the client's debt, and not money in the drawer until the insurer pays.

double _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

/// Split a sale between the patient and the insurer.
({double copay, double insurer}) copayOf(Map<String, Object?>? scheme, num total, {int decimals = 0}) {
  final f = decimals > 0 ? _pow10(decimals) : 1.0;
  double r(double x) => (x * f).round() / f;
  final t = r(total.toDouble()).clamp(0, double.infinity).toDouble();
  final pct = _n(scheme?['copayPct']).clamp(0, 100).toDouble();
  var copay = _max(_n(scheme?['copayFixed']), r(t * pct / 100));
  copay = r(copay).clamp(0, t).toDouble();
  var insurer = r(t - copay);
  final limit = _n(scheme?['limit']);
  if (limit > 0 && insurer > limit) {
    insurer = r(limit);
    copay = r(t - insurer);
  }
  return (copay: copay, insurer: insurer);
}

double _pow10(int n) {
  var x = 1.0;
  for (var i = 0; i < n; i++) {
    x *= 10;
  }
  return x;
}

double _max(double a, double b) => a > b ? a : b;

/// What the insurer owes on this sale (0 for an uninsured or refunded sale).
double insurerShare(Map<String, Object?> s) {
  final ins = s['insurance'];
  if (s['status'] == 'refunded' || ins is! Map) return 0;
  final v = _n(ins['share']);
  return v > 0 ? v : 0;
}

/// What the client still owes on this sale: the total less what they paid and less the insurer's share.
double clientOwes(Map<String, Object?> s) => s['status'] == 'refunded' ? 0 : _n(s['total']) - _n(s['paid'] ?? s['total']) - insurerShare(s);

/// What an insurer owes: its share of the sales not refunded, less its payments (kind 'insurer').
double insurerBalance(Iterable<Map<String, Object?>> sales, Iterable<Map<String, Object?>> payments, String insurerId) {
  final owed = sales.where((s) => (s['insurance'] as Map?)?['insurerId'] == insurerId).fold(0.0, (a, s) => a + insurerShare(s));
  final paid = payments.where((p) => p['kind'] == 'insurer' && p['partyId'] == insurerId).fold(0.0, (a, p) => a + _n(p['amount']));
  return owed - paid;
}

/// One scheme of one insurer, as a choice at the till.
typedef SchemeChoice = ({String key, Map<String, Object?> insurer, Map<String, Object?> scheme});

/// The schemes of all insurers (archived insurers left out).
List<SchemeChoice> schemeChoices(Iterable<Map<String, Object?>> insurers) => [
      for (final i in insurers.where((i) => i['archived'] != true))
        for (final s in ((i['schemes'] as List?) ?? const []).whereType<Map>()) (key: '${i['id']}|${s['id']}', insurer: i, scheme: s.cast<String, Object?>()),
    ];
