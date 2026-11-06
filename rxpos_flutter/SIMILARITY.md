# Similarity index: React app ↔ Flutter app

Measured on 2026-11-06, at the end of the migration. It compares what the React app (`src/`) has with what the Flutter app (`rxpos_flutter/lib/`) has, in 13 areas, and counts how much of React's side Flutter covers. The gaps it found were then fixed and measured again.

**Index: 87.2% before the fixes → 100% after** (the average of the 13 areas, each weighted equally).

This is a structural index: it checks that every screen, cloud call, synced table and field, form field, delete, setting, permission, export, button, shortcut and rule is there. Whether those behave the same is checked by the test suites (`flutter test`: 323 tests, plus `test/cloud` against the real cloud code run locally, and the React unit tests).

| # | Area | How it was measured | Before | After |
|---|------|---------------------|-------:|------:|
| 1 | Screens | React routes (`src/App.jsx`) vs Flutter screens (`screens.dart`); the 8 finance pages are tabs of Finance, Transfers is in Branches & Transfers | 47/47 | 47/47 |
| 2 | Cloud calls | `/api/...` paths each app calls (8 React-only paths are by design, see below) | 24/24 | 24/24 |
| 3 | Synced tables | `TABLES` in `src/store.jsx` vs `record_store.dart` | 36/36 | 36/36 |
| 4 | Record fields | Fields React writes (puts, form fields, defaults) that Flutter never names (`tool/similarity/fields.py`) | 202/205 | 205/205 |
| 5 | Form fields | React form fields per table vs the Flutter form for that table (`tool/similarity/forms.py`) | 66/74 | 74/74 |
| 6 | Deletes | Tables React can delete from vs Flutter | 12/17 | 17/17 |
| 7 | Settings | Keys on the Settings page (24) and settings React reads (25) | 49/49 | 49/49 |
| 8 | Permissions & license features | `src/access.js` (32 permissions, 20 features) | 52/52 | 52/52 |
| 9 | Exports | CSV / ICS / JSON files React downloads | 16/16 | 16/16 |
| 10 | Buttons and controls | Every React button, by label, tooltip or aria-label, checked feature by feature (`tool/similarity/actions.py`; 240 of 318 match word for word, the rest are worded differently) | 316/317 | 317/317 |
| 11 | Till keyboard | POS keys: F8, F9 / Ctrl+Enter, F10, Alt+H, Alt+←/→, Alt+↑/↓, + / −, Delete, Alt+1…9, Alt+C, Alt+D, Alt+R, ? | 6/13 | 13/13 |
| 12 | First-visit tips | POS, Add Stock, Reports | 1/3 | 3/3 |
| 13 | Rule tests | Topics of React's app-side unit tests (`tests/unit-*.mjs`) with a Flutter test on the same rule | 22/23 | 23/23 |

The reverse check matters for sync: every field Flutter writes into a record is one the React app or the cloud already knows (0 unknown fields). Records keep the shape the React app uses.

## Gaps found and fixed

1. **Medicines couldn't be deleted.** Deleting a standard-catalogue medicine now also writes `catalogHidden`, as `src/store.jsx` `del` does, so every device hides it. That rule sits in `RecordStore.del`, so it applies to every caller.
2. **Formulations, prescriptions, expense categories and loans couldn't be deleted.** The edit dialog now has a Delete button, with "Delete this …?" confirmation. Finance deletes are noted in the audit log.
3. **Clients lacked 7 of React's fields:** email, address (shown under "Bill to" on the invoice), date of birth, type, insurance / HMO, policy number, credit limit.
4. **Suppliers lacked the TIN.**
5. **Till keyboard:** the line choice was missing (Alt+↑/↓, and the chosen line is highlighted), and so were + / − on that line, Delete, Alt+1…9 for the payment method, F10 for a proforma, Alt+D for the discount, and Alt+R for the last receipt. The shortcuts list had already promised + / − and Delete.
6. **First-visit tips** on the POS and Add Stock, dismissed with "Got it" and remembered on the device.
7. **A test for safe file links.** The rule was already there (`safeFileUrl`: http(s) only), but nothing tested it.

Tests: `test/data/record_store_test.dart` (catalogHidden), `test/features/safe_url_test.dart`, and the "parity with the React app (from the similarity index)" group in `test/widgets/app_flow_test.dart`.

## Differences by design (not counted as gaps)

- **Overselling:** a sale beyond the stock this device knows is refused (the owner's choice); the React app still allows it.
- **Owner console:** stays on the web (`/api/owner`, `/api/owner-auth/*`).
- **Web-only calls:** the web-address pharmacy lookup (`/api/pharmacy/<slug>`, for rxposug.com/<pharmacy>); "Reset with Google" opens the web page (`/api/password/google`).
- **Updates:** the apps update from `/api/app/` (the R2 bucket); React's `/api/version` and web updates don't apply. On Android the system installer asks to confirm.
- **"Restore the copy from before the upgrade":** this button is for React's own 1.6 storage upgrade and has no Flutter counterpart.
- **Lists scroll** instead of React's Previous / Next pages.

## Re-running it

```bash
python3 rxpos_flutter/tool/similarity/fields.py .
python3 rxpos_flutter/tool/similarity/forms.py .
python3 rxpos_flutter/tool/similarity/actions.py .
```

Run them from the repository root. Each prints JSON: what React has, and what wasn't found in Flutter.
