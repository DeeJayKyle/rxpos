# RxPOS for Windows and Android (Flutter)

A native rebuild of the RxPOS apps for **Windows and Android**. The web version stays on the existing React app.

It talks to the **same RxPOS cloud and sync protocol 2** as the React apps (see `../docs/ARCHITECTURE.md`), so
pharmacies' data is never migrated: the Flutter and React apps can run side by side while screens move over.

## Architecture

- **Feature first**: `lib/features/<feature>/{data,domain,presentation}`; shared code in `lib/core/`.
- **State**: Riverpod with code generation (`@riverpod`). The pharmacy is one shared store with many derived values
  (stock from movements, balances, permissions), which suits providers better than many Blocs.
- **Device database**: Drift (SQLite). Records are kept as JSON documents keyed by table + id, the cloud's own shape,
  with the durable `outbox`, `tombstones`, refused changes and a `kv` table. A sale and its outbox entries are one
  transaction. Typed Freezed entities are decoded from the rows for the screens.
- **Network**: Dio with interceptors: the device token, retries with the shared backoff for calls that are safe to
  repeat (sync), and plain-language failures (offline, sign in again, refused, cloud problem).
- **Routing**: go_router, with the same paths as the React app.

```
lib/
  core/      config · database (Drift) · network (Dio) · router · theme · sync · utils
  features/  auth · sales_pos · stock · sync_status
```

## Working on it

```
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # after changing @riverpod, @freezed or Drift tables
flutter analyze && flutter test
flutter run -d windows        # on a Windows PC
flutter run -d <android-id>   # on an Android phone or tablet
```

The implementation plan, step by step, is in `PLAN.md`.
