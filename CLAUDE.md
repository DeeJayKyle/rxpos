# Working on RxPOS

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
- **Pick the recommended option** when the owner hasn't decided, and say so, rather than stopping to ask.
- **Fix the cause once** rather than retrying or working around it.

The shortest way is never a weaker way. It does **not** allow:
- skipping, disabling or quarantining a test;
- releasing or deploying code that hasn't passed the full suite;
- leaving out a check that protects stock, money or patients' data.

If the fast way and the safe way differ, take the safe way and say why.
