// What's new (UI batch 3, B8): the highlights of the latest release, shown once on each device after an update as a
// small card on the dashboard. Kept next to the release notes (docs/RELEASE-NOTES.md): when a release is written up,
// its highlights go here too.
export const WHATS_NEW = {
  version: '1.23.0',
  items: [
    { text: 'Split pay: one sale paid part in cash, card, Mobile Money, bank or credit', to: '/pos' },
    { text: 'Return part of a sale with a credit note (Sales History → Refund or return)', to: '/sales' },
    { text: 'Receipts print to the thermal printer and the cash drawer opens: set it up, then press Test print', to: '/device' },
    { text: 'Pay cash in or out at Shifts; the drawer counts all its cash', to: '/shifts' },
    { text: '17 themes in four groups: Light, Dark, High contrast and Colourful', to: '/device' },
  ],
};

/** Whether to show the card: the list's release is newer than the one this device last saw. A device that never saw
 *  one shows it only if it was already in use (sales before today): a new pharmacy has nothing "new" to be told. */
export function whatsNewDue(lastSeen, { usedBefore }) {
  if (lastSeen === WHATS_NEW.version) return false;
  if (!lastSeen) return !!usedBefore;
  return true;
}
