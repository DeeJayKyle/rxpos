// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too. The Flutter app keeps the same list in rxpos_flutter/lib/core/config/whats_new.dart
// (tests/unit-whatsnew.mjs checks they match).
export const WHATS_NEW = {
  version: '1.13.0',
  items: [
    { text: 'Undo on the till: removed lines and cleared sales come back with one tap', to: '/pos' },
    { text: 'Training mode on the till: practise sales that save nothing', to: '/pos' },
    { text: 'A customer display for a second screen facing the client', to: '/pos' },
    { text: 'Refunds over a set amount need a manager', to: '/sales' },
    { text: 'Busy hours on the dashboard: when your pharmacy sells most', to: '/' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
