// RxPOS 1.6 data contracts: device storage (src/storage.js), the sync protocol (src/sync.js ↔ worker/index.js
// /api/sync) and business operations. Checked with `npm run typecheck` (TypeScript, JSDoc in the .js modules).

/** Every stored record: an id and the time it was last changed (ISO, device clock; the cloud clamps it) */
export interface Rec { id: string; updatedAt?: string; [field: string]: unknown }

/** A change waiting for the cloud. Written in the same transaction as the change itself. */
export interface OutboxOp {
  /** unique per change; the cloud remembers it, so a resend after a lost reply is applied once */
  op: string;
  /** every op written by one action (a sale, a delivery…) shares a txn and is sent in one request */
  txn: string;
  t: string;
  id: string;
  deleted?: boolean;
  at: string;
}
export interface OutboxEntry extends OutboxOp { key?: number }

/** One atomic write to the device */
export interface Commit {
  puts: { t: string; rec: Rec }[];
  dels: { t: string; id: string }[];
  ops: OutboxOp[];
  settings?: Record<string, unknown>;
  tomb?: { t: string; id: string; at: string }[];
  /** replace every record (migration, switching pharmacy) */
  reset?: boolean;
  clearOutbox?: boolean;
  version?: number;
  kv?: Record<string, unknown>;
}

export interface Loaded { tables: Record<string, Rec[]>; settings?: Record<string, unknown>; tomb: { t: string; id: string; at: string }[] }

// ---- /api/sync (protocol 2; protocol 1 clients send no `op` / `v` and are still accepted) ----
export interface Change { t: string; id: string; rec?: Rec | Record<string, unknown> | null; deleted?: boolean; at: string; op?: string }
export interface SyncRequest { deviceId: string; since: number; changes: Change[]; v?: 2 }
export interface SyncResponse {
  changes: Change[];
  /** server-issued position: the next request asks for changes after it */
  cursor: number;
  more: boolean;
  applied: number;
  refused: number;
  /** protocol 2: "<table>|<id>" of each refused change, so the device can keep it for review */
  refusedKeys?: string[];
  /** protocol 2: changes whose op the cloud had already applied (a resend) */
  dupes?: number;
  /** changes when the cloud is restored from a backup: the device then pulls everything again */
  epoch: string;
  tenant: string;
  protocol?: number;
}

export type SyncState = 'off' | 'offline' | 'syncing' | 'ok' | 'error';
export interface SyncStatus {
  state: SyncState;
  pending?: number;
  rejected?: number;
  lastSync?: string;
  error?: string;
  expired?: boolean;
  progress?: string;
  first?: boolean;
  retryAt?: number;
}

// The native bridges the apps add to the page (Capacitor on Android, the Electron preload on Windows)
declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; [k: string]: unknown };
    rxposShell?: Record<string, (...a: unknown[]) => unknown>;
  }
}
