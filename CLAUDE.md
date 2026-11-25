# Working on RxPOS

## The owner's law: no change to the cloud's data without the owner's approval

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

## The law: always take the shortest way

The owner's standing rule (16 Nov 2026): **always do the shortest way.** Of the ways that reach the same result safely,
choose the one that finishes soonest, without being asked, and say in one line which way you took.

What that means here:

- **Don't redo what is already done.** Code that already passed the full suite is not tested again (`full-tests.yml`
  reuses a pass by git tree). Don't re-run a suite, re-build or re-read what you already have.
- **Run things side by side.** Independent work (test groups, builds, lookups, tool calls) runs in parallel, never one
  after the other. New test suites go into `tests/run-all.mjs`, which `RXPOS_SHARD` splits across machines; add a new suite's time to `tests/suite-times.json`.
- **Test only what you touched while working:** `npm test -- v82` (one suite) or `npm test -- v49,v82`. The full
  `npm test` is for the end, and CI runs it in parallel groups anyway.
- **Release in one step:** Actions → *Build RxPOS* → Run workflow on `main` with *release* `vX.Y.Z` and *deploy* on
  *with release* (MAINTENANCE.md §5). Don't deploy the cloud and the website by hand when the workflow does both.
- **One app: the React app.** The owner's rule (25 Nov 2026): all work and upgrades go into the React app (`src/`,
  with the cloud in `worker/`). The Flutter app is retired and kept read-only in `archive/` (archive/README.md):
  don't change, build, test or release it, and don't port features to it or keep "both apps" in step.
- **Pick the recommended option** when the owner hasn't decided, and say so, rather than stopping to ask.
- **Fix the cause once** rather than retrying or working around it.

The shortest way is never a weaker way. It does **not** allow:
- skipping, disabling or quarantining a test;
- releasing or deploying code that hasn't passed the full suite;
- leaving out a check that protects stock, money or patients' data.

If the fast way and the safe way differ, take the safe way and say why.
