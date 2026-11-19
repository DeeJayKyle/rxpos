// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too. The Flutter app keeps the same list in rxpos_flutter/lib/core/config/whats_new.dart
// (tests/unit-whatsnew.mjs checks they match).
export const WHATS_NEW = {
  version: '1.14.0',
  items: [
    { text: 'Dates in your chosen format everywhere (This device → Date format), on every computer', to: '/device' },
    { text: 'Warnings in real colours in every theme: OK green, low amber, expired and out of stock red', to: '/inventory' },
    { text: 'Four dark themes: Midnight Blue, Dark Forest and Graphite Amber join Navy Teal', to: '/device' },
    { text: 'A shorter menu: the medicine pages in two groups, Stock and Medicines', to: '/' },
    { text: 'Clearer words and pages: nothing cut off on phones, empty pages say what to do next', to: '/' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
