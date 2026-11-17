// Crash reports (src/crash.js, Flutter crash_reports.dart) are scrubbed on the device; the cloud scrubs them again
// (audit 2026-11-17, 2nd pass), so a device on an older build, or a hand-made request, cannot store an email address,
// a phone number or other long numbers in the owner console, and a page never carries its query (receipt numbers, ids).
export const scrubText = (s, n) => String(s ?? '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
  .replace(/\d[\d\s-]{7,}\d/g, '[n]')
  .replace(/\b\d{6,}\b/g, '[n]')
  .slice(0, n);
export const scrubPage = (p) => scrubText(String(p ?? '').split('?')[0], 80);
