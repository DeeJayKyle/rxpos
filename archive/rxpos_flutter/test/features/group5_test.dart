import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/entities/settings.dart';
import 'package:rxpos/features/extras/domain/extras.dart';

void main() {
  test('storage temperature limits, with the pharmacy\'s own', () {
    const s = PharmacySettings();
    expect((tempInRange('Fridge', 5, s), tempInRange('Fridge', 9, s), tempInRange('Room', 26, s), tempInRange('Room', 12, s), tempInRange('Outside', 40, s)), (true, false, false, true, true));
    expect(tempInRange('Fridge', 9, PharmacySettings.fromRecord({'fridgeMax': 10})), isTrue);
  });
  test('phone numbers and WhatsApp links like the React app', () {
    expect(normalizePhone('0772 123 456'), '256772123456');
    expect(normalizePhone('+256 772 123456'), '256772123456');
    expect(normalizePhone('772123456'), '256772123456');
    expect(whatsappLink('256772123456', 'Hi & bye'), 'https://wa.me/256772123456?text=Hi%20%26%20bye');
  });
  test('message templates', () {
    expect(fillTemplate('Hello {name}, {unknown}', {'name': 'Grace'}), 'Hello Grace, {unknown}');
  });
}
