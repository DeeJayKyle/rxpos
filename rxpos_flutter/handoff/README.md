# Handoff: Flutter parity work in progress

This folder is temporary. Delete it once the items below are finished.

## Unfinished: Drug information (`lib/features/drug_info/`)
- The screen, the panel and the till's "Drug info" dialog are written, and `flutter analyze` is clean.
- **Bug to fix first:** `DrugLookup.refresh` in `lib/features/drug_info/domain/drug_label.dart` hangs.
  - It fetches twice (503 then 200), then never completes. The second answer was `{'results': []}` in a debug run.
  - Suspect the `_inflight[key] ??= ... .then(...).whenComplete(...)` chain, or the
    `await set(...).catchError(...)` inside `.then`.
  - Rewrite `refresh` as a plain `async` function that stores its Future in `_inflight` and removes it in `finally`.
- Then move `drug_label_test.dart.txt` back to `test/features/drug_label_test.dart`. It must pass.
- Then append `drug_info_widget_test.dart.txt` before the final `}` of `test/widgets/app_flow_test.dart`.
  - The fake `drugFetchProvider` override in `start()` is already committed.
  - This widget test has never been run.
