#!/usr/bin/env bash
# Puts the website together (deployed to Cloudflare Pages as rxposug.com):
#   scripts/build-web-site.sh <classic dist> <app build/web> <out dir> <build number> <label>
#   /            the RxPOS app (Flutter) for the home page and the app's pages (functions/_middleware.js)
#   /app/        the app's files; app/version.json { build, label } is what the web app checks for updates
#   /classic/    the classic app (React), the fallback, and where its unsent work in a browser is sent from
#   the root     the classic app's files as before: the installed classic apps update from them (version.json, its
#                files, updates/), and a pharmacy's own address (rxposug.com/<pharmacy>) still opens it
set -euo pipefail
dist=$1 app=$2 out=$3 build=$4 label=$5
[ -f "$dist/index.html" ] && [ -f "$dist/version.json" ] || { echo "no classic build in $dist" >&2; exit 1; }
[ -f "$app/main.dart.js" ] || [ -f "$app/main.dart.wasm" ] || { echo "no app build in $app" >&2; exit 1; }
rm -rf "$out"
mkdir -p "$out/classic" "$out/app"
cp -r "$dist"/. "$out"/
# the classic copy without the installed apps' update archives (large, and only needed at the root)
(cd "$dist" && tar cf - --exclude=./updates --exclude=./_headers .) | (cd "$out/classic" && tar xf -)
cp -r "$app"/. "$out/app"/
# the app's page loads its files from /app/
sed -i -e 's#src="flutter_bootstrap.js"#src="/app/flutter_bootstrap.js"#' -e 's#href="icons/#href="/app/icons/#g' -e 's#src="icons/#src="/app/icons/#g' \
  -e 's#href="manifest.json"#href="/app/manifest.json"#' -e 's#href="favicon.png"#href="/app/favicon.png"#' -e 's#src="rx_boot.js"#src="/app/rx_boot.js"#' "$out/app/index.html"
grep -q 'src="/app/flutter_bootstrap.js"' "$out/app/index.html" || { echo "the app page was not rewritten" >&2; exit 1; }
printf '{"build":%s,"label":"%s"}\n' "$build" "$label" > "$out/app/version.json"
echo "Site in $out: app build $build ($label), classic $(node -e "console.log(require('$dist/version.json').label)" 2>/dev/null || echo '?')"
