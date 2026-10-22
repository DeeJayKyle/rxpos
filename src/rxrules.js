// Pure rules for prescription refills and refill reminders (security review 0.8).
// refillsAllowed is the number of refills a prescription permits; an unset/0 value means NONE (not unlimited).

/** How many refills remain. Never negative. */
export function refillsLeft(r) {
  const allowed = Number(r?.refillsAllowed || 0);
  const used = Number(r?.refillsUsed || 0);
  return Math.max(0, allowed - used);
}

/** May another refill be recorded on this prescription? (0 allowed -> no refills.) */
export function canRecordRefill(r) {
  return refillsLeft(r) > 0;
}

/** Does this prescription still generate refill reminders? Skip ones that are cancelled, completed or not yet dispensed. */
export function reminderActive(r) {
  return !!r?.refillDays && !['Cancelled', 'Completed', 'Pending'].includes(r.status);
}
