// Sign-in slowdown per account (review 1.5, workplan step 6).
//
// The older lock counts wrong passwords per IP address and account, so someone switching addresses gets 5 guesses per
// address, forever. This counts per account across every address, and slows it down instead of locking it (the
// owner's choice): a lock per account could be used to keep a real person out on purpose. After 10 wrong passwords
// within an hour the account allows one try a minute, after 20 one every 5 minutes. A real person waits minutes at
// most, or uses "Forgot password" (which clears it); guessing at that pace is useless. Pure: the caller stores the row.
export const WINDOW_MS = 60 * 60000; // an hour without a wrong password starts the count again
export const STEPS = [[20, 5 * 60000], [10, 60000]]; // [wrong passwords so far, time between tries], highest first

const fresh = (row, now) => !row || !(now - Number(row.last_at) <= WINDOW_MS);
const gapFor = (n) => (STEPS.find(([k]) => n >= k) || [0, 0])[1];

/** How long (ms) this account must wait before its next try; 0 = now. row: { n, last_at } or null */
export function waitFor(row, now = Date.now()) {
  if (fresh(row, now)) return 0;
  return Math.max(0, Number(row.last_at) + gapFor(Number(row.n) || 0) - now);
}

/** The row after one more wrong password */
export function afterFail(row, now = Date.now()) {
  return { n: (fresh(row, now) ? 0 : Number(row.n) || 0) + 1, last_at: now };
}

/** "1 minute", "45 seconds" */
export function waitText(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}
