// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too.
export const WHATS_NEW = {
  version: '1.26.0',
  items: [
    { text: 'Rest the mouse on any button, tab, list or field to see what it does', to: '/inventory' },
    { text: 'Table headings say how to sort, move and resize them', to: '/sales' },
    { text: 'The menu groups say which pages they hold', to: '/' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
