// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too.
export const WHATS_NEW = {
  version: '1.24.0',
  items: [
    { text: 'Every table works like Add Stock: drag headings to move them, drag their edge to resize, click to sort', to: '/sales' },
    { text: 'Quick Edit shows every medicine, 100 at a time, with an In stock filter', to: '/quick-edit' },
    { text: 'Tabs move and hide: drag a tab, or right-click it', to: '/reorder' },
    { text: 'Your columns and tabs follow you to every device you sign in on', to: '/inventory' },
    { text: 'Stock counts, transfers and returns keep stock right', to: '/stock-count' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
