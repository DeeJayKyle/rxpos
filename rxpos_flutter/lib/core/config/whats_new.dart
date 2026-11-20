// What's new (UI batch 3, B8): the same list as src/whatsnew.js (tests/unit-whatsnew.mjs checks they match). Shown
// once on each device after an update, as a small card on the dashboard.
const whatsNewVersion = '1.17.0';
const whatsNewItems = <(String, String)>[
  ('Gradients: a soft or bold background, gradient accents, and six presets for the menu (theme menu → Gradient)', '/device'),
  ('Dark keeps your theme: every theme has its own dark twin', '/device'),
  ('New styles: GNOME, KDE Plasma, elementary OS, Ubuntu, iOS and Liquid Glass (theme menu → Style)', '/device'),
  ('Fewer, clearer themes: look-alikes merged into 31 in seven sets, plus Terminal and Ubuntu Yaru', '/device'),
  ('A tidier screen: one menu group open at a time, rarely used pages under More, no Premium switch', '/'),
  ('Notices never cover a page: they show on the dashboard (and in the bell), never on phones', '/'),
  ('One period picker on the dashboard, one date button on every list, CSV and PDF under Export', '/sales'),
  ('Click a row to open it; the till’s options in one ⚙ menu', '/pos'),
  ('41 themes: new palettes in every colour set, and the glossy Pharmacy themes', '/device'),
  ('A Multi-colour set: Cool & Crisp, Vibrant Neon and Neon Indigo, with five-colour charts', '/device'),
  ('Whole amounts on the dashboard, or short ones (UGX 152K) in This device → Amounts', '/device'),
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
