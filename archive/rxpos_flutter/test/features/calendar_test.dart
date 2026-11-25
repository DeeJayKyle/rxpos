// Calendar rules (src/pages/Calendar.jsx): repeating events, the month grid, Google link, .ics file, refills and expiries.
import 'package:flutter_test/flutter_test.dart';
import 'package:rxpos/core/rules/fefo.dart';
import 'package:rxpos/features/calendar/domain/calendar.dart';

void main() {
  test('repeats: daily, weekly, monthly, yearly, until', () {
    final e = {'date': '2026-11-05', 'repeat': 'weekly'};
    expect([for (final d in ['2026-11-04', '2026-11-05', '2026-11-12', '2026-11-13', '2027-03-04']) occurs(e, d)], [false, true, true, false, true]);
    expect(occurs({'date': '2026-01-31', 'repeat': 'monthly'}, '2026-03-31'), isTrue);
    expect(occurs({'date': '2026-01-31', 'repeat': 'monthly'}, '2026-02-28'), isFalse, reason: 'like JavaScript: the same day of the month');
    expect(occurs({'date': '2024-02-29', 'repeat': 'yearly'}, '2028-02-29'), isTrue);
    expect(occurs({'date': '2026-11-05', 'repeat': 'daily', 'until': '2026-11-07'}, '2026-11-08'), isFalse);
    expect(occurs({'date': '2026-11-05'}, '2026-11-05'), isTrue);
    expect(occurs({'date': '2026-11-05', 'repeat': 'none'}, '2026-11-06'), isFalse);
  });

  test('the month grid starts on Monday, six weeks', () {
    final c = monthCells('2026-11');
    expect((c.length, c.first, c.last), (42, '2026-10-26', '2026-12-06'));
    expect(addMonths('2026-12', 1), '2027-01');
    expect(addMonths('2026-01', -1), '2025-12');
  });

  test('Google Calendar link and the .ics file', () {
    final e = {'id': 'e1', 'title': 'NDA, inspection', 'date': '2026-11-05', 'time': '09:30', 'endTime': '10:30', 'repeat': 'weekly', 'notes': 'Bring; licences'};
    expect(googleLink(e), 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=NDA%2C%20inspection&dates=20261105T093000/20261105T103000&details=Bring%3B%20licences&recur=RRULE:FREQ=WEEKLY');
    expect(googleLink({'title': 'All day', 'date': '2026-12-31'}), contains('dates=20261231/20270101'));
    final ics = icsFile([e, {'id': 'e2', 'title': 'Old note', 'date': '2026-11-06', 'note': 'kept'}], 'Sample Pharmacy · RxPOS', now: DateTime.utc(2026, 11, 5, 8, 1, 2, 345));
    expect(ics.split('\r\n'), containsAllInOrder([
      'BEGIN:VCALENDAR', 'X-WR-CALNAME:Sample Pharmacy · RxPOS', 'BEGIN:VEVENT', 'UID:e1@rxpos', 'DTSTAMP:20261105T080102Z', 'DTSTART:20261105T093000', 'DTEND:20261105T103000',
      'RRULE:FREQ=WEEKLY', r'SUMMARY:NDA\, inspection', r'DESCRIPTION:Bring\; licences', 'END:VEVENT',
      'DTSTART;VALUE=DATE:20261106', 'DTEND;VALUE=DATE:20261107', 'DESCRIPTION:kept', 'END:VCALENDAR',
    ]));
  });

  test('refills due and stock expiring within 400 days; a day by time', () {
    final auto = autoEvents(
      prescriptions: [
        {'id': 'r1', 'status': 'Dispensed', 'dispensedOn': '2026-11-01', 'refillDays': 30, 'customerId': 'c1', 'medications': 'Metformin'},
        {'id': 'r2', 'status': 'Pending', 'date': '2026-11-01', 'refillDays': 30},
        {'id': 'r3', 'status': 'Dispensed', 'date': '2026-11-02T10:00:00Z', 'refillDays': '7'},
      ],
      customerNames: {'c1': 'Amina Test'},
      products: [(id: 'p1', name: 'Calmex', stock: 12), (id: 'p2', name: 'Empty', stock: 0)],
      batchesOf: (id) => [
        const BatchStock(id: 'b1', qty: 12, batch: 'A', expiry: '2027-01-31'),
        const BatchStock(id: 'b2', qty: 3, batch: 'B', expiry: '2029-01-31'),
        const BatchStock(id: 'b3', qty: 0, batch: 'C', expiry: '2026-12-01'),
      ],
      today: '2026-11-05',
    );
    expect([for (final a in auto) (a['id'], a['date'], a['title'])], [
      ('rx-r1', '2026-12-01', 'Refill due: Amina Test'),
      ('rx-r3', '2026-11-09', 'Refill due: patient'),
      ('exp-b1', '2027-01-31', 'Expires: Calmex (12 left, batch A)'),
    ]);
    final day = onDay([
      {'id': 'e1', 'title': 'Late', 'date': '2026-12-01', 'time': '15:00'},
      {'id': 'e2', 'title': 'Early', 'date': '2026-12-01', 'time': '08:00'},
    ], auto, '2026-12-01');
    expect([for (final x in day) x['title']], ['Refill due: Amina Test', 'Early', 'Late'], reason: 'no time first, then by time');
    expect(day[1]['kind'], 'event');
  });
}
