#!/usr/bin/env bash
# The website for a deploy of the classic app (build.yml, deploy-cloud.yml): the classic build in <dist> together with
# the newest tested RxPOS app for the browser (RxPOS-web.zip on the flutter-pilot release, built by flutter-apps.yml),
# so a classic deploy never takes the app off rxposug.com.
#   scripts/site-with-app.sh <classic dist> <out dir>      (needs GH_TOKEN and GITHUB_REPOSITORY)
set -euo pipefail
dist=$1 out=$2
tmp=$(mktemp -d)
if gh release download flutter-pilot --repo "$GITHUB_REPOSITORY" --pattern RxPOS-web.zip --dir "$tmp" 2>/dev/null; then
  mkdir -p "$tmp/app" && unzip -q "$tmp/RxPOS-web.zip" -d "$tmp/app"
  build=$(node -p "require('$tmp/app/rxpos-web.json').build") label=$(node -p "require('$tmp/app/rxpos-web.json').label")
  rm -f "$tmp/app/rxpos-web.json"
  scripts/build-web-site.sh "$dist" "$tmp/app" "$out" "$build" "$label"
else
  echo "::warning::No RxPOS app build for the browser was found on the flutter-pilot release: the website is the classic app only."
  rm -rf "$out" && cp -r "$dist" "$out"
fi
