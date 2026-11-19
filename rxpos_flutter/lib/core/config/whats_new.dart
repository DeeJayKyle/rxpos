// What's new (UI batch 3, B8): the same list as src/whatsnew.js (tests/unit-whatsnew.mjs checks they match). Shown
// once on each device after an update, as a small card on the dashboard.
const whatsNewVersion = '1.14.0';
const whatsNewItems = <(String, String)>[
  ('Dates in your chosen format everywhere (This device → Date format), on every computer', '/device'),
  ('Warnings in real colours in every theme: OK green, low amber, expired and out of stock red', '/inventory'),
  ('Four dark themes: Midnight Blue, Dark Forest and Graphite Amber join Navy Teal', '/device'),
  ('A shorter menu: the medicine pages in two groups, Stock and Medicines', '/'),
  ('Clearer words and pages: nothing cut off on phones, empty pages say what to do next', '/'),
];

/// The list's release is newer than the one this device last saw. A device that never saw one shows it only if it
/// was already in use (sales before today).
bool whatsNewDue(String? lastSeen, {required bool usedBefore}) {
  if (lastSeen == whatsNewVersion) return false;
  if (lastSeen == null || lastSeen.isEmpty) return usedBefore;
  return true;
}
