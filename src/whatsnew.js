// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too.
export const WHATS_NEW = {
  version: '1.25.0',
  items: [
    { text: 'Stock controls on the dashboard: shrinkage this month, why and by whom, and reminders for deliveries, orders and expiry', to: '/' },
    { text: 'Taking stock off needs a reason, and a manager\'s approval above the limit', to: '/stock-card' },
    { text: 'New report: Stock losses, with the reason and who approved each change', to: '/reports' },
    { text: 'Sell these first: the batches that expire soonest, with their shelf', to: '/expiry' },
    { text: 'Every cost price change is kept in the audit log', to: '/quick-edit' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
