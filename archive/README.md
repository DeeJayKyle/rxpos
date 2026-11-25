# Archive: the retired Flutter app

The owner's decision (25 Nov 2026): **RxPOS is one app, the React app** (`src/`, with the cloud in `worker/`). The
Flutter app (Android, Windows and web) is retired. Everything that belonged only to it is kept here, unchanged, for
reference:

| Here | Was |
|---|---|
| `rxpos_flutter/` | the Flutter app's source and tests |
| `workflows/flutter-apps.yml`, `flutter-offer.yml`, `flutter-release.yml` | its build, update offer and release (they no longer run from here) |
| `scripts/publish-flutter-update.sh` | publishing a build as the update the installed apps take |
| `tools/flutter-palettes.mjs` | copying the React app's themes into the Flutter app |

Nothing here is built, tested, linted or released. Don't change it, and don't add features to it.

What is still live: the last published Flutter builds keep working against the same cloud (installed Android and
Windows apps, and the browser app the website serves from the `flutter-pilot` release, `scripts/site-with-app.sh`).
They get no further updates. Moving the website and every pharmacy onto the React app is a separate step the owner
decides (it changes what each pharmacy sees).
