// Collision-resistant id (review Phase 2.5): crypto.randomUUID where available (browsers, Electron, Node ≥ 16),
// with a fallback for very old runtimes. Pure, so it can be unit-tested on its own.
export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5));
