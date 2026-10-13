# PharmaPOS - connect MTN MoMo / Airtel Money / SMS to your Cloudflare cloud.
# Run from the pharmapos folder:   powershell -ExecutionPolicy Bypass -File deploy\setup-mobile-money.ps1
# Keys are typed here (hidden) and stored only as encrypted Cloudflare secrets. Nothing is saved on this PC.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-Secret($prompt) {
  $s = Read-Host $prompt -AsSecureString
  $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  if (-not $v.Trim()) { throw "$prompt is required." }
  return $v.Trim()
}
function Save-Secrets($map) {
  $tmp = Join-Path $env:TEMP ("pp-" + [guid]::NewGuid() + ".json")
  try {
    [IO.File]::WriteAllText($tmp, ($map | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
    npx wrangler secret bulk $tmp
    if ($LASTEXITCODE -ne 0) { throw 'Saving to Cloudflare failed (run "npx wrangler login" first).' }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

Write-Host "`n  PharmaPOS - Mobile Money & SMS setup`n" -ForegroundColor Cyan
Write-Host '  1) MTN MoMo - SANDBOX (testing, free, no real money)'
Write-Host '  2) MTN MoMo - LIVE (after MTN Uganda approves your business)'
Write-Host '  3) Airtel Money'
Write-Host "  4) SMS (Africa's Talking)`n"
$choice = Read-Host 'Choose 1-4'

switch ($choice) {
  '1' {
    Write-Host "`nOn momodeveloper.mtn.com: Products -> Collections -> Subscribe, then Profile -> copy the Collections PRIMARY KEY." -ForegroundColor Yellow
    $sub = Read-Secret 'Paste the Collections primary key'
    $base = 'https://sandbox.momodeveloper.mtn.com'
    $user = [guid]::NewGuid().ToString()
    Write-Host 'Creating your sandbox API user...'
    Invoke-RestMethod "$base/v1_0/apiuser" -Method Post -ContentType 'application/json' `
      -Headers @{ 'X-Reference-Id' = $user; 'Ocp-Apim-Subscription-Key' = $sub } `
      -Body '{"providerCallbackHost":"pharmapos.pharmapos.workers.dev"}' | Out-Null
    $apiKey = (Invoke-RestMethod "$base/v1_0/apiuser/$user/apikey" -Method Post -Headers @{ 'Ocp-Apim-Subscription-Key' = $sub }).apiKey
    Write-Host 'Checking the credentials work...'
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${user}:${apiKey}"))
    $tok = Invoke-RestMethod "$base/collection/token/" -Method Post -Headers @{ Authorization = "Basic $basic"; 'Ocp-Apim-Subscription-Key' = $sub }
    if (-not $tok.access_token) { throw 'MTN did not return a token. Check the key is the COLLECTIONS primary key.' }
    Save-Secrets @{ MTN_SUBSCRIPTION_KEY = $sub; MTN_API_USER = $user; MTN_API_KEY = $apiKey; MTN_ENV = 'sandbox' }
    Write-Host "`nMTN MoMo SANDBOX is connected." -ForegroundColor Green
    Write-Host 'Sandbox uses test money (EUR) and no real phone gets a prompt; payments are approved automatically.'
  }
  '2' {
    Write-Host "`nFrom the MTN MoMo partner portal (after go-live approval) copy: Collections subscription key, API user and API key." -ForegroundColor Yellow
    $sub = Read-Secret 'Collections subscription key (production)'
    $user = Read-Secret 'API user (a UUID)'
    $apiKey = Read-Secret 'API key'
    $target = Read-Host 'Target environment [mtnuganda]'; if (-not $target) { $target = 'mtnuganda' }
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${user}:${apiKey}"))
    $tok = Invoke-RestMethod 'https://proxy.momoapi.mtn.com/collection/token/' -Method Post -Headers @{ Authorization = "Basic $basic"; 'Ocp-Apim-Subscription-Key' = $sub }
    if (-not $tok.access_token) { throw 'MTN did not accept these production credentials.' }
    Save-Secrets @{ MTN_SUBSCRIPTION_KEY = $sub; MTN_API_USER = $user; MTN_API_KEY = $apiKey; MTN_ENV = 'production'; MTN_TARGET = $target; MTN_CURRENCY = 'UGX' }
    Write-Host "`nMTN MoMo LIVE is connected. Customers will get a real PIN prompt." -ForegroundColor Green
  }
  '3' {
    Write-Host "`nOn developers.airtel.africa: My Apps -> your app (with the Collection product) -> copy Client ID and Client Secret." -ForegroundColor Yellow
    $id = Read-Secret 'Client ID'
    $secret = Read-Secret 'Client Secret'
    $envName = Read-Host 'Environment: uat (testing) or production [uat]'; if (-not $envName) { $envName = 'uat' }
    $base = if ($envName -eq 'production') { 'https://openapi.airtel.africa' } else { 'https://openapiuat.airtel.africa' }
    $tok = Invoke-RestMethod "$base/auth/oauth2/token" -Method Post -ContentType 'application/json' -Body (@{ client_id = $id; client_secret = $secret; grant_type = 'client_credentials' } | ConvertTo-Json)
    if (-not $tok.access_token) { throw 'Airtel did not accept these credentials.' }
    Save-Secrets @{ AIRTEL_CLIENT_ID = $id; AIRTEL_CLIENT_SECRET = $secret; AIRTEL_ENV = $envName; AIRTEL_COUNTRY = 'UG'; AIRTEL_CURRENCY = 'UGX' }
    Write-Host "`nAirtel Money ($envName) is connected." -ForegroundColor Green
  }
  '4' {
    Write-Host "`nOn africastalking.com: Settings -> API Key. Username is 'sandbox' for testing or your app username for live." -ForegroundColor Yellow
    $u = Read-Host 'Username'
    $k = Read-Secret 'API key'
    $sender = Read-Host 'Sender ID (optional, press Enter to skip)'
    $map = @{ AT_USERNAME = $u; AT_API_KEY = $k }; if ($sender) { $map.AT_SENDER_ID = $sender }
    Save-Secrets $map
    Write-Host "`nSMS is connected." -ForegroundColor Green
  }
  default { Write-Host 'Nothing changed.' }
}
Write-Host "`nIn PharmaPOS: Settings -> Online & payments shows a green tick for each connected service.`n"
