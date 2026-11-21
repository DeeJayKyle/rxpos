// What's new (UI batch 3, B8): the same list as src/whatsnew.js (tests/unit-whatsnew.mjs checks they match). Shown
// once on each device after an update, as a small card on the dashboard.
const whatsNewVersion = '1.19.1';
const whatsNewItems = <(String, String)>[
  ('Scan invoices better: photos cleaned up, handwriting and abbreviations matched, lines to check first', '/add-stock'),
  ('Add Stock: start with the scan, details fold to one line, each line ticked “Checked”, the supplier’s pack and markup remembered', '/add-stock'),
  ('The same medicine under two names: merged when you approve (Medicine List → Tidy names)', '/medicines'),
  ('Tidy names: consistent medicine names suggested by AI; nothing changes until you approve', '/medicines'),
  ('Shifts: asked to start one when you sign in and to end it when you sign out; past sales turned into shifts once approved', '/shifts'),
  ('The till opens on medicines in stock, A–Z', '/pos'),
  ('Move dashboard cards by dragging, and resize them by their edge', '/'),
  ('Right-click (or press and hold) anywhere for the page’s options', '/'),
  ('Menu counts and the bell light up only for what is new; the theme panel folds', '/'),
];

/// The list's release is newer than the one this device last saw. A device that never saw one shows it only if it
/// was already in use (sales before today).
bool whatsNewDue(String? lastSeen, {required bool usedBefore}) {
  if (lastSeen == whatsNewVersion) return false;
  if (lastSeen == null || lastSeen.isEmpty) return usedBefore;
  return true;
}
