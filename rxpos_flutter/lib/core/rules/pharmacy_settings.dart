// The pharmacy's details (src/pharmacy-settings.js): shared defaults belong to the Owner console; a device may override
// them for itself only. Overrides are kept on the device and never enter the synced settings record or the outbox.
import 'dart:convert';

/// key, label, number?, fallback
const pharmacyFieldSpecs = <(String, String, bool, Object)>[
  ('name', 'Pharmacy name (shown on receipts)', false, 'My Pharmacy'),
  ('phone', 'Phone', false, ''),
  ('address', 'Address', false, ''),
  ('license', 'NDA licence / registration no.', false, ''),
  ('tin', 'TIN', false, ''),
  ('currency', 'Currency (e.g. UGX, KES, \$)', false, 'UGX'),
  ('decimals', 'Decimal places', true, 0),
  ('taxRate', 'Tax / VAT rate (%)', true, 0),
  ('retailMarkup', 'Default retail markup (%)', true, 50),
  ('wholesaleMarkup', 'Default wholesale markup (%)', true, 25),
  ('minMargin', 'Target margin (%): lower margins are flagged', true, 20),
  ('priceRound', 'Round worked-out prices', true, 0),
  ('nonCashBankId', 'Non-cash sales go to', false, 'cash-drawer'),
];

const overridesKey = 'pharmacy-overrides';

Map<String, Object?> pharmacyDefaults([Map<String, Object?> s = const {}]) => {for (final (k, _, _, d) in pharmacyFieldSpecs) k: s[k] ?? d};

bool _same(Object? a, Object? b) => jsonEncode(a is num ? a.toDouble() : a) == jsonEncode(b is num ? b.toDouble() : b);

/// The device's overrides after saving [next]: a field the person didn't change is never pinned, and a value equal
/// to the Owner's default is not an override.
Map<String, Object?> editOverrides(Map<String, Object?> shared, Map<String, Object?> current, Map<String, Object?> next, Map<String, Object?> existing) {
  final out = {...existing}, base = pharmacyDefaults(shared), prev = pharmacyDefaults(current), values = pharmacyDefaults(next);
  for (final (k, _, _, _) in pharmacyFieldSpecs) {
    if (_same(values[k], prev[k])) continue;
    if (_same(values[k], base[k])) {
      out.remove(k);
    } else {
      out[k] = values[k];
    }
  }
  return out;
}

Map<String, Object?> readOverrides(String? stored) {
  try {
    final v = (jsonDecode(stored ?? '{}') as Map).cast<String, Object?>();
    return {for (final (k, _, _, _) in pharmacyFieldSpecs) if (v.containsKey(k)) k: v[k]};
  } catch (_) {
    return {};
  }
}

/// Checked and tidied pharmacy details; throws on a bad value.
Map<String, Object?> validatePharmacyDefaults(Map<String, Object?> s) {
  final out = pharmacyDefaults(s);
  for (final (k, _, number, _) in pharmacyFieldSpecs) {
    if (number) {
      final n = out[k] is num ? (out[k] as num).toDouble() : double.tryParse('${out[k]}'.trim());
      if (n == null || !n.isFinite || n < 0 || (k == 'decimals' && (n != n.roundToDouble() || n > 6)) || ((k == 'taxRate' || k == 'minMargin') && n > 100)) {
        throw FormatException('Invalid $k');
      }
      out[k] = n == n.roundToDouble() ? n.toInt() : n;
    } else {
      final t = '${out[k]}'.trim();
      out[k] = t.length > (k == 'address' ? 500 : 100) ? t.substring(0, k == 'address' ? 500 : 100) : t;
    }
  }
  if ('${out['name']}'.isEmpty || '${out['currency']}'.isEmpty || !const [0, 10, 50, 100, 500].contains(out['priceRound'])) {
    throw const FormatException('Invalid pharmacy name, currency or rounding');
  }
  return out;
}

/// Factory defaults (src/store.jsx defaultSettings), for "Restore default settings".
Map<String, Object?> defaultSettings() => {
      'name': 'My Pharmacy', 'address': '', 'phone': '', 'license': '', 'currency': 'UGX', 'decimals': 0, 'taxRate': 0,
      'wholesaleMarkup': 25, 'retailMarkup': 50, 'priceRound': 0, 'minMargin': 20, 'expiryWarnDays': 90,
      'receiptFooter': 'Thank you for your purchase. Get well soon!', 'paperWidth': 80, 'autoPrint': false,
      'leadDays': 7, 'coverDays': 30, 'deadDays': 90,
      'smsRefill': 'Hello {name}, this is {pharmacy}. Your refill of {medicine} is due on {date}. Reply or visit us to collect. Get well soon!',
      'smsDebt': 'Hello {name}, this is a friendly reminder from {pharmacy} that your balance of {amount} is due. Thank you.',
      'paymentMethods': [
        {'id': 'cash', 'name': 'Cash', 'type': 'cash'}, {'id': 'momo', 'name': 'Mobile Money', 'type': 'momo'},
        {'id': 'card', 'name': 'Card', 'type': 'other'}, {'id': 'bank', 'name': 'Bank Transfer', 'type': 'other'},
        {'id': 'insurance', 'name': 'Insurance', 'type': 'other'}, {'id': 'credit', 'name': 'Credit', 'type': 'credit'},
      ],
      'clientCapture': 'optional', 'features': <String, Object?>{}, 'adminWhatsApp': '',
    };

/// "Restore default settings": everything back to factory defaults except the pharmacy's details.
Map<String, Object?> restoredSettings(Map<String, Object?> current) => {
      ...defaultSettings(),
      for (final k in [...pharmacyDefaults().keys, 'adminWhatsApp', 'weatherPlace'])
        if (current[k] != null) k: current[k],
    };
