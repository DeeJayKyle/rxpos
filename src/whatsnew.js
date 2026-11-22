// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too. The Flutter app keeps the same list in rxpos_flutter/lib/core/config/whats_new.dart
// (tests/unit-whatsnew.mjs checks they match).
export const WHATS_NEW = {
  version: '1.20.0',
  items: [
    { text: "Add Stock: a review before Receive stock lists anything to check: an old date, the same invoice twice, a total that doesn’t match, cost jumps, very large quantities, short expiry", to: '/add-stock' },
    { text: "Add Stock: an Invoice total box compared with the lines, and “Use today” when the date isn’t today", to: '/add-stock' },
    { text: "Scan invoices better: photos cleaned up, handwriting and abbreviations matched, lines to check first", to: '/add-stock' },
    { text: "Add Stock: start with the scan, details fold to one line, each line ticked “Checked”, the supplier’s pack and markup remembered", to: '/add-stock' },
    { text: "The same medicine under two names: merged when you approve (Medicine List → Tidy names)", to: '/medicines' },
    { text: "Tidy names: consistent medicine names suggested by AI; nothing changes until you approve", to: '/medicines' },
    { text: "Shifts: asked to start one when you sign in and to end it when you sign out; past sales turned into shifts once approved", to: '/shifts' },
    { text: "The till opens on medicines in stock, A–Z", to: '/pos' },
    { text: "Move dashboard cards by dragging, and resize them by their edge", to: '/' },
    { text: "Right-click (or press and hold) anywhere for the page’s options", to: '/' },
    { text: "Menu counts and the bell light up only for what is new; the theme panel folds", to: '/' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
