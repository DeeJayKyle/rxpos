// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too.
export const WHATS_NEW = {
  version: '1.27.0',
  items: [
    { text: 'Hold a sale and print a slip: any till charges it by its code', to: '/pos' },
    { text: 'A pharmacist\'s order now goes to the manager to approve', to: '/reorder' },
    { text: 'Note when a customer asks for something you don\'t have: Reorder counts it', to: '/reorder' },
    { text: 'Sales and commission for each staff member', to: '/reports' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
