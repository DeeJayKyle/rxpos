# RxPOS: connect the cloud to a Turso (libSQL) database.
# Run from the pharmapos folder:  powershell -ExecutionPolicy Bypass -File deploy\setup-turso.ps1
# You need: the database URL (libsql://....turso.io) and a database token from app.turso.tech.
# The token is sent straight to Cloudflare as a secret; it is not saved on this PC.

$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'RxPOS - Turso database setup' -ForegroundColor Cyan
Write-Host '1. Sign in at https://app.turso.tech (GitHub or Google works).'
Write-Host '2. Create a database (name: rxpos, location: closest to Uganda, e.g. Frankfurt or Johannesburg if offered).'
Write-Host '3. Open the database: copy its URL (starts with libsql://), then Create Token (Read & Write, never expires).'
Write-Host ''

$url = (Read-Host 'Paste the database URL').Trim()
if ($url -notmatch '^libsql://[a-z0-9.-]+$') { throw 'That does not look like a Turso URL (libsql://name-org.turso.io).' }
$sec = Read-Host 'Paste the database token (hidden)' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
if ($token.Length -lt 40) { throw 'That token looks too short.' }

$tmp = Join-Path $env:TEMP ('rxpos-turso-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  $json = '{"TURSO_URL":"' + $url + '","TURSO_AUTH_TOKEN":"' + $token + '"}'
  [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding($false)))
  npx wrangler secret bulk $tmp
  if ($LASTEXITCODE -ne 0) { throw 'Cloudflare did not accept the secrets.' }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  $token = $null
}
Write-Host ''
Write-Host 'Done. Turso is connected. Tell Claude "Turso is ready" to copy the data and switch over.' -ForegroundColor Green
