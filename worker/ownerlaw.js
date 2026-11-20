// The owner's law (2026-11-20), kept by the cloud itself:
//   NO ONE, and above all no AI agent or automated script, changes a pharmacy's data in the cloud without the owner's
//   approval. An agent that wants to must stop, say exactly what it would change and why, and wait for the owner's yes.
// The cloud enforces it where data can be written around the apps (the owner API's direct record writes, restore and
// database moves): those calls are refused (428) unless they carry `X-Owner-Approved: yes`, which the owner's own
// console sends when the owner clicks, and which a script or agent may send ONLY after the owner has approved that
// change. The law is published at /ai-policy.txt and /.well-known/ai-policy.txt for any agent that looks.
// Staff working in the apps are not affected: their changes are their own work, under their roles' permissions.
export const OWNER_LAW = `RxPOS: the owner's law for AI agents and scripts (2026-11-20)

1. Never change, delete, import, restore or move any pharmacy's data in the RxPOS cloud without the owner's approval.
2. Before any such change, stop and ask the owner: say exactly what would change (tables, records, how many) and why.
3. Only after the owner approves that change may the request carry the header "X-Owner-Approved: yes".
4. Reading data to answer a question is allowed; writing is not, until approved.
5. Data changes proposed by the apps' AI features (names, matches, shifts from past sales) are only suggestions: a
   person approves each one in the app before anything is saved.

The cloud refuses direct writes without the approval header (HTTP 428).
`;

export const APPROVAL_HEADER = 'X-Owner-Approved';

/** Does this owner-API call write a pharmacy's data around the apps? (/api/owner/<parts>) */
export function writesData(parts, method) {
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return false;
  return parts[0] === 'restore' || parts[0] === 'move-to-turso' || (parts[0] === 'tenants' && parts[2] === 'records');
}

/** Approved by the owner? (the header, or a local throw-away test cloud started by tests/run-all.mjs) */
export const ownerApproved = (req, env) => req.headers.get(APPROVAL_HEADER) === 'yes' || env.TEST_CLOUD === '1';
