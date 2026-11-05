// Small rules for the remaining screens: storage temperature limits (src/weather.js storageLimits), phone numbers and
// WhatsApp links (src/store.jsx normalizePhone, src/cloud.js whatsappLink), message templates (fillTemplate).
import '../../../core/entities/settings.dart';

({double roomMax, double roomMin, double fridgeMin, double fridgeMax}) storageLimits(PharmacySettings s) {
  double v(String k, double d) => ((s.raw[k] as num?)?.toDouble() ?? 0) == 0 ? d : (s.raw[k] as num).toDouble();
  return (roomMax: v('roomMax', 25), roomMin: v('roomMin', 15), fridgeMin: v('fridgeMin', 2), fridgeMax: v('fridgeMax', 8));
}

/// Is a reading within the limits for where it was taken (outside readings are never out of range)?
bool tempInRange(String place, double temp, PharmacySettings s) {
  final l = storageLimits(s);
  if (place == 'Outside') return true;
  if (place == 'Fridge') return temp >= l.fridgeMin && temp <= l.fridgeMax;
  return temp <= l.roomMax && temp >= l.roomMin - 5;
}

/// A phone number in international form without + (Uganda by default): 0772 123456 → 256772123456.
String normalizePhone(String phone, [String country = '256']) {
  var p = phone.replaceAll(RegExp(r'[^\d+]'), '');
  if (p.startsWith('+')) p = p.substring(1);
  if (p.startsWith('00')) p = p.substring(2);
  if (p.startsWith('0')) p = country + p.substring(1);
  if (p.length == 9) p = country + p;
  return p;
}

String whatsappLink(String phone, String text) => 'https://wa.me/${phone.replaceAll(RegExp(r'\D'), '')}?text=${Uri.encodeComponent(text)}';

/// Fill {name}-style placeholders; unknown ones are left as they are.
String fillTemplate(String template, Map<String, String> vars) => template.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => vars[m[1]] ?? m[0]!);

const defaultRefillMessage = 'Hello {name}, this is {pharmacy}. Your refill of {medicine} is due on {date}. Reply or visit us to collect. Get well soon!';
const defaultDebtMessage = 'Hello {name}, this is a friendly reminder from {pharmacy} that your balance of {amount} is due. Thank you.';
