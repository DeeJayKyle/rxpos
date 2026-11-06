#!/usr/bin/env bash
# Publishes one Flutter app build as the update the installed new RxPOS apps take (rxpos_flutter/lib/core/update):
#   scripts/publish-flutter-update.sh <windows|android> <installer file> <build number> <label>
# Uploads the installer to the R2 bucket rxpos-apps as RxPOS-New-<build>.<ext> (an internal name the apps check, kept
# so copies installed before the rename to "RxPOS" still update), then flutter-<platform>.json
# ({ build, label, file, size, sha256 }), then removes the installer the previous version file named. The apps read
# both through the cloud at https://api.rxposug.com/api/app/<file> (worker/index.js appFile).
# Needs CLOUDFLARE_API_TOKEN (with R2 edit) and CLOUDFLARE_ACCOUNT_ID; without them it says so and does nothing.
set -euo pipefail
platform=$1 file=$2 build=$3 label=$4
bucket=rxpos-apps
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "::warning::Cloudflare credentials are not set: the installed apps were not offered this build."
  exit 0
fi
case "$platform" in windows | android) ;; *) echo "unknown platform $platform" >&2; exit 1 ;; esac
w() { npx --yes wrangler@4.142.0 "$@"; }
w r2 bucket info "$bucket" > /dev/null 2>&1 || w r2 bucket create "$bucket"

ext=${file##*.}
name="RxPOS-New-$build.$ext"
size=$(wc -c < "$file" | tr -d ' ')
sha=$(sha256sum "$file" | cut -d' ' -f1)
tmp=$(mktemp -d)
old=""
if w r2 object get "$bucket/flutter-$platform.json" --remote --file "$tmp/old.json" > /dev/null 2>&1; then
  old=$(node -e "try{const f=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).file;if(/^RxPOS-New-[0-9]+\.(exe|apk)$/.test(f))console.log(f)}catch{}" "$tmp/old.json")
fi

# the installer first, so a version file never names a file that isn't there yet
w r2 object put "$bucket/$name" --remote --file "$file" --content-type application/octet-stream
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({ build: +process.argv[2], label: process.argv[3], file: process.argv[4], size: +process.argv[5], sha256: process.argv[6] }))" \
  "$tmp/new.json" "$build" "$label" "$name" "$size" "$sha"
w r2 object put "$bucket/flutter-$platform.json" --remote --file "$tmp/new.json" --content-type application/json
if [ -n "$old" ] && [ "$old" != "$name" ]; then w r2 object delete "$bucket/$old" --remote || true; fi
echo "Offered build $build to the installed $platform apps: $name ($size bytes, sha256 $sha)"
