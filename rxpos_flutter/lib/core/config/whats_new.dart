// What's new (UI batch 3, B8): the same list as src/whatsnew.js (tests/unit-whatsnew.mjs checks they match). Shown
// once on each device after an update, as a small card on the dashboard.
const whatsNewVersion = '1.13.0';
const whatsNewItems = <(String, String)>[
  ('Undo on the till: removed lines and cleared sales come back with one tap', '/pos'),
  ('Training mode on the till: practise sales that save nothing', '/pos'),
  ('A customer display for a second screen facing the client', '/pos'),
  ('Refunds over a set amount need a manager', '/sales'),
  ('Busy hours on the dashboard: when your pharmacy sells most', '/'),
];

/// The list's release is newer than the one this device last saw. A device that never saw one shows it only if it
/// was already in use (sales before today).
bool whatsNewDue(String? lastSeen, {required bool usedBefore}) {
  if (lastSeen == whatsNewVersion) return false;
  if (lastSeen == null || lastSeen.isEmpty) return usedBefore;
  return true;
}
