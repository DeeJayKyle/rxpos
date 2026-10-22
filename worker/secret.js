// Secrets used to sign tokens and URLs. Signing must never "fail open": if the secret is missing or weak, the HMAC
// key would be a predictable string (e.g. "token:undefined") and anyone could forge a token. So we refuse to sign or
// verify without a strong secret. TOKEN_SECRET is preferred; the older SYNC_KEY is accepted so existing deployments and
// their issued tokens keep working until a dedicated TOKEN_SECRET is set.
export const MIN_SECRET_BYTES = 32;

/** The signing secret, or throw. `env` is the Worker environment. */
export function tokenSecret(env) {
  const s = (env && (env.TOKEN_SECRET || env.SYNC_KEY)) || '';
  if (typeof s !== 'string' || s.length < MIN_SECRET_BYTES) {
    throw new Error(`Server signing secret missing or too short (need TOKEN_SECRET or SYNC_KEY of at least ${MIN_SECRET_BYTES} characters).`);
  }
  return s;
}

/** A per-purpose label mixed into the signing input, so a token signature can't be replayed as a file or calendar URL. */
export function purposeLabel(purpose) {
  return (purpose || 'token') + ':';
}
