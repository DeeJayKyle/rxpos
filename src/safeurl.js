// A file link is only safe to render if it resolves to an http(s) URL. This blocks javascript:, data:, blob: and other
// schemes that a crafted chat message could smuggle into an attachment path (stored-XSS defence, pairs with the
// worker's file-serving headers).
export function safeFileUrl(base, path) {
  try {
    const fallback = typeof location !== 'undefined' ? location.href : 'https://rxpos.invalid/';
    const u = new URL(path, base || fallback);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
