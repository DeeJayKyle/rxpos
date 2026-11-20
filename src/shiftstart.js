// Starting a shift and finding one's open shift: the Shifts page and the questions on signing in and out (App.jsx).
import { uid, now, put, audit, MAIN_BRANCH } from './store.jsx';

/** Start a shift for this person at this branch with an opening float (the Shifts page and the sign-in question) */
export function startShift(update, user, branchId, float, fmt) {
  const f = Number(float) || 0;
  update((d) => {
    put(d, 'shifts', { id: uid(), userId: user.id, user: user.name, branchId, openedAt: now(), float: f, date: now() });
    audit(d, user, 'Shift opened', `Float ${fmt(f)}`, branchId);
  });
}
/** This person's open shift at this branch (or undefined) */
export const openShiftOf = (db, user, branchId) => (db.shifts || []).find((s) => s.userId === user?.id && !s.closedAt && (s.branchId || MAIN_BRANCH) === branchId);


/** Ask the shift questions on signing in and out? Always for people; a test robot (navigator.webdriver) only when a
 *  test asks for them (localStorage rxpos-shift-questions = 1), so the other suites aren't stopped by the question */
export function shiftQuestions() {
  try { if (localStorage.getItem('rxpos-shift-questions') === '1') return true; } catch { /* blocked */ }
  return !(typeof navigator !== 'undefined' && navigator.webdriver);
}
