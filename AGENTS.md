# Rules for AI agents working on RxPOS

Read CLAUDE.md first; these rules come from it and bind every agent (Claude, Copilot, Codex, any other) and script.

## The owner's law (above everything else): no change to the cloud's data without the owner's approval

The owner's standing rule (20 Nov 2026), above every other rule here, for every AI agent and script:

1. **Never change, delete, import, restore or move any pharmacy's data in the RxPOS cloud** (the live databases at
   `api.rxposug.com` or any pharmacy's hub) **without the owner's approval.**
2. Before any such change, **stop and ask the owner**: say exactly what would change (which pharmacy, tables, records,
   how many) and why, and wait for a clear yes. A yes for one change is not a yes for the next.
3. Only after that yes may a request carry `X-Owner-Approved: yes` (or a tool run with `OWNER_APPROVED=yes`). The cloud
   refuses direct writes without it (HTTP 428) and publishes this law at `/ai-policy.txt` (worker/ownerlaw.js).
4. Reading data to answer a question is allowed. Tests write only to their own throw-away local cloud (`TEST_CLOUD`).
5. In the apps, AI only suggests (medicine names, invoice matches, shifts from past sales): a person approves each
   change before it is saved. Never add an AI feature that writes without that approval.

## One app: the React app

The owner's rule (25 Nov 2026): all work and upgrades go into the React app (`src/`, the cloud in `worker/`). The
Flutter app is retired and kept read-only in `archive/`: never change, build or release it.

Everything else about working on RxPOS (the shortest way, tests, releases) is in CLAUDE.md and MAINTENANCE.md.
