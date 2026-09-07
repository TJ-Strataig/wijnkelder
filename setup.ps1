# =============================================================================
#  Wijnkelder - installatiescript (Windows PowerShell 5.1+ / PowerShell 7)
#  Doet de hele terminal-kant in een keer: GitHub-repo, GitHub Pages,
#  Cloudflare database + fotobucket + geheimen, configuratie invullen, publiceren.
#  Je hoeft alleen in te loggen als het script daarom vraagt (browser opent).
#
#  Gebruik (in VS Code-terminal, in de projectmap):   .\setup.ps1
#  Mag je geen scripts uitvoeren (beheerde laptop, 'execution policy')? Gebruik dan:
#      Get-Content .\setup.ps1 -Raw | Invoke-Expression
#  Opnieuw draaien is veilig: bestaande onderdelen worden overgeslagen.
# =============================================================================
# 'Continue': externe programma's (gh, npm, wrangler) schrijven meldingen naar stderr; die mogen het script niet afbreken.
# Fouten worden per stap gecontroleerd via $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
if ($PSScriptRoot) { Set-Location $PSScriptRoot }
if (-not (Test-Path 'api/wrangler.toml') -or -not (Test-Path 'web/config.js')) {
  throw "Start dit script vanuit de projectmap 'wijnkelder' (waar api/ en web/ in staan). Huidige map: $(Get-Location)"
}
$Root = Get-Location

function Bold($t) { Write-Host $t -ForegroundColor White }
function Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Info($t) { Write-Host "  -> $t" -ForegroundColor Cyan }
function Warn($t) { Write-Host "  ! $t" -ForegroundColor Yellow }
function Die($t)  { Write-Host "`n[X] $t" -ForegroundColor Red; throw "Installatie gestopt." }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Set-Toml($path, $key, $value) {
  $s = Get-Content $path -Raw
  $pattern = "(?m)^\s*#?\s*$([regex]::Escape($key))\s*=.*$"
  $line = "$key = `"$value`""
  $rx = [regex]$pattern
  if ($rx.IsMatch($s)) { $s = $rx.Replace($s, $line, 1) } else { $s += "`n$line`n" }
  Set-Content $path $s -NoNewline -Encoding UTF8
}

function Random-Token($bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('=')
}

Bold "Wijnkelder - installatie"; ""

# -----------------------------------------------------------------------------
Bold "1/8 Benodigde programma's"
if (-not (Has git))  { Die "git ontbreekt. Installeer via https://git-scm.com of 'winget install Git.Git'." }
if (-not (Has node)) { Die "Node.js ontbreekt. Installeer Node 20+ via https://nodejs.org of 'winget install OpenJS.NodeJS.LTS'." }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Die "Node.js $nodeMajor is te oud; 20 of hoger is nodig." }
Ok "git, node $(node -v)"

if (-not (Has gh)) {
  Warn "GitHub CLI (gh) ontbreekt."
  if (Has winget) { Info "Installeren via winget..."; winget install --id GitHub.cli -e --silent | Out-Null; $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User') }
  if (-not (Has gh)) { Die "Installeer GitHub CLI via https://cli.github.com en open daarna een nieuwe terminal." }
}
Ok "GitHub CLI $((gh --version | Select-Object -First 1) -replace 'gh version ','')"

Info "Node-pakketten voor de API installeren..."
Push-Location api; npm install --silent --no-fund --no-audit | Out-Null; $npmOk = ($LASTEXITCODE -eq 0); Pop-Location
if (-not $npmOk) { Die "npm install is mislukt. Controleer je internetverbinding en probeer opnieuw." }
Ok "wrangler geinstalleerd"

# -----------------------------------------------------------------------------
""; Bold "2/8 Inloggen"
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Info "Er opent een browser om in te loggen bij GitHub..."; gh auth login --web --git-protocol https }
$GhUser = gh api user -q .login
Ok "GitHub: ingelogd als $GhUser"

Push-Location api
# Let op: wrangler kan op Windows (Node 24) crashen bij het AFSLUITEN ("Assertion failed ... async.c") en geeft dan een
# foutcode terwijl het commando geslaagd is. Daarom controleren we resultaten, niet de foutcode van wrangler.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
function Test-CloudflareToken($tok) {
  if ($env:WIJNKELDER_SKIP_VERIFY -eq '1') { Warn "Tokencontrole overgeslagen (WIJNKELDER_SKIP_VERIFY=1)."; return $true }
  try {
    $r = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 20
    if ($r.success -and $r.result.status -eq 'active') { return $true }
    Warn "Cloudflare antwoordt: status=$($r.result.status) $($r.errors | ConvertTo-Json -Compress)"
    return $false
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match '400|401|403') { Warn "Cloudflare wijst het token af: $msg"; return $false }
    Warn "Kon de tokencontrole niet uitvoeren (netwerk/proxy): $msg"
    Warn "Als je zeker weet dat het token klopt, zet dan  `$env:WIJNKELDER_SKIP_VERIFY = '1'  en start opnieuw."
    return $false
  }
}
function Test-Cloudflare {
  if ($env:CLOUDFLARE_API_TOKEN) { return (Test-CloudflareToken $env:CLOUDFLARE_API_TOKEN) }
  $out = (npx --yes wrangler whoami 2>&1 | Out-String)
  return ($out -match 'Account ID' -and $out -notmatch 'not authenticated')
}
if (-not (Test-Cloudflare)) {
  $env:CLOUDFLARE_API_TOKEN = $null
  ""
  Info "Cloudflare heeft een API-token nodig (betrouwbaarder dan de browser-login op Windows)."
  "  Zo maak je die in 1 minuut:"
  "   1. Open https://dash.cloudflare.com/profile/api-tokens en klik 'Create Token'."
  "   2. Kies het sjabloon 'Edit Cloudflare Workers' -> 'Use template'."
  "   3. Voeg onder 'Permissions' twee regels toe met '+ Add more':"
  "        Account | D1                  | Edit"
  "        Account | Workers R2 Storage  | Edit"
  "   4. 'Continue to summary' -> 'Create Token' -> kopieer het token (wordt 1x getoond)."
  ""
  $tokenSecure = Read-Host "  Plak het Cloudflare API-token" -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure))
  if ([string]::IsNullOrWhiteSpace($token)) { Pop-Location; Die "Geen token ingevoerd." }
  $token = ($token -replace '\s', '')
  if (-not (Test-CloudflareToken $token)) { Pop-Location; Die "Cloudflare meldt dat dit token niet geldig/actief is. Controleer of je het volledige token hebt geplakt (tip: zet het vooraf met  `$env:CLOUDFLARE_API_TOKEN = 'token'  en start het script opnieuw)." }
  $env:CLOUDFLARE_API_TOKEN = $token
  Info "Het token geldt voor deze terminalsessie. Open je later een nieuwe terminal, zet het dan opnieuw met:  `$env:CLOUDFLARE_API_TOKEN = '...'"
}
Pop-Location
Ok "Cloudflare: ingelogd"

# -----------------------------------------------------------------------------
""; Bold "3/8 GitHub-repository"
$RepoName = Read-Host "  Naam van de repository [wijnkelder]"
if ([string]::IsNullOrWhiteSpace($RepoName)) { $RepoName = 'wijnkelder' }
$PagesOrigin = "https://$GhUser.github.io"
$PagesUrl = "$PagesOrigin/$RepoName/"

if (-not (Test-Path .git)) { git init -q -b main }
git remote get-url origin 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gh repo view "$GhUser/$RepoName" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { git remote add origin "https://github.com/$GhUser/$RepoName.git"; Ok "Bestaande repository gekoppeld: $GhUser/$RepoName" }
  else { gh repo create $RepoName --private --source=. --remote=origin | Out-Null; Ok "Prive-repository aangemaakt: $GhUser/$RepoName" }
} else { Ok "Repository al gekoppeld: $(git remote get-url origin)" }

# -----------------------------------------------------------------------------
""; Bold "4/8 Cloudflare: database en fotobucket"
Push-Location api
function Get-Db {
  $raw = (npx --yes wrangler d1 list --json 2>$null | Out-String)
  $m = [regex]::Match($raw, '(?s)\[.*\]')
  if (-not $m.Success) { return $null }
  try { $list = $m.Value | ConvertFrom-Json } catch { return $null }
  return $list | Where-Object { $_.name -eq 'wijnkelder' } | Select-Object -First 1
}
$db = Get-Db
if (-not $db) {
  Info "Database aanmaken..."
  npx --yes wrangler d1 create wijnkelder 2>&1 | Out-Null
  $db = Get-Db
}
if (-not $db -or -not $db.uuid) { Pop-Location; Die "Kon de database 'wijnkelder' niet terugvinden bij Cloudflare. Controleer of het API-token het recht 'D1: Edit' heeft." }
Set-Toml wrangler.toml 'database_id' $db.uuid
Ok "D1-database 'wijnkelder' ($($db.uuid))"

$buckets = npx --yes wrangler r2 bucket list 2>$null
if (-not ($buckets -match 'wijnkelder-fotos')) {
  Info "Fotobucket aanmaken..."; npx --yes wrangler r2 bucket create wijnkelder-fotos 2>&1 | Out-Null
  $buckets = npx --yes wrangler r2 bucket list 2>$null
  if (-not ($buckets -match 'wijnkelder-fotos')) { Pop-Location; Die "Fotobucket aanmaken mislukt. Twee mogelijke oorzaken: (1) R2 is nog niet geactiveerd: ga in het Cloudflare-dashboard naar R2 Object Storage en doorloop de gratis activering; (2) het API-token mist het recht 'Workers R2 Storage: Edit'. Los het op en start het script opnieuw." }
}
Ok "R2-bucket 'wijnkelder-fotos'"

Info "Tabellen aanmaken..."
$schemaOut = (npx --yes wrangler d1 execute wijnkelder --remote --file=./schema.sql -y 2>&1 | Out-String)
if ($schemaOut -match '\[ERROR\]') { Write-Host $schemaOut; Pop-Location; Die "Databaseschema toepassen mislukt." }
Ok "Databaseschema toegepast"

# -----------------------------------------------------------------------------
""; Bold "5/8 Configuratie"
Set-Toml wrangler.toml 'ORIGIN' $PagesOrigin
Set-Toml wrangler.toml 'RP_ID' "$GhUser.github.io"
Ok "wrangler.toml: ORIGIN=$PagesOrigin, RP_ID=$GhUser.github.io"

# -----------------------------------------------------------------------------
""; Bold "6/8 API publiceren naar Cloudflare"
$deployOut = (npx --yes wrangler deploy 2>&1 | Out-String)
$m = [regex]::Match($deployOut, 'https://[a-zA-Z0-9.-]+\.workers\.dev')
if (-not $m.Success -or $deployOut -match '\[ERROR\]') { Write-Host $deployOut; Pop-Location; Die "Publiceren van de API mislukt (zie melding hierboven)." }
$WorkerUrl = $m.Value
Ok "API draait op $WorkerUrl"
# -----------------------------------------------------------------------------
""; Bold "7/8 Geheimen"
function Has-Secret($name) { $l = (npx --yes wrangler secret list 2>$null | Out-String); return ($l -match ('"name":\s*"' + $name + '"')) }
$Bootstrap = $null
if (Has-Secret 'SESSION_SECRET') { Ok "SESSION_SECRET bestaat al" }
else {
  (Random-Token 48) | npx --yes wrangler secret put SESSION_SECRET 2>&1 | Out-Null
  if (-not (Has-Secret 'SESSION_SECRET')) { Pop-Location; Die "SESSION_SECRET instellen mislukt." }
  Ok "SESSION_SECRET aangemaakt (willekeurig, 64 tekens)"
}

if (Has-Secret 'BOOTSTRAP_SECRET') { Ok "BOOTSTRAP_SECRET bestaat al" }
else {
  $Bootstrap = Random-Token 9
  $Bootstrap | npx --yes wrangler secret put BOOTSTRAP_SECRET 2>&1 | Out-Null
  if (-not (Has-Secret 'BOOTSTRAP_SECRET')) { Pop-Location; Die "BOOTSTRAP_SECRET instellen mislukt." }
  Ok "BOOTSTRAP_SECRET aangemaakt"
  ""
  Write-Host "  +--------------------------------------------------------------+" -ForegroundColor Yellow
  Write-Host "  |  OPSTARTWACHTWOORD (eenmalig nodig bij de eerste login):    |" -ForegroundColor Yellow
  Write-Host ("  |  {0,-59} |" -f $Bootstrap) -ForegroundColor Yellow
  Write-Host "  +--------------------------------------------------------------+" -ForegroundColor Yellow
  "  Bewaar dit even; je vult het in bij 'Eerste keer instellen' in de app."
}
Info "De AI-sleutel (Anthropic/OpenAI) stel je straks in de app in onder Instellingen -> AI-sommelier."

Pop-Location

$cfg = Get-Content web/config.js -Raw
$cfg = [regex]::Replace($cfg, "export const API_BASE = '[^']*';", "export const API_BASE = '$WorkerUrl';")
Set-Content web/config.js $cfg -NoNewline -Encoding UTF8
Ok "web/config.js: API_BASE=$WorkerUrl"

# -----------------------------------------------------------------------------
""; Bold "8/8 Webapp publiceren naar GitHub Pages"
git add -A
git -c user.name="Wijnkelder setup" -c user.email="setup@wijnkelder.local" commit -qm "Wijnkelder: installatie en configuratie" 2>$null | Out-Null
git push -qu origin main
if ($LASTEXITCODE -ne 0) { Die "Pushen naar GitHub mislukt. Controleer 'gh auth status' en probeer opnieuw." }
Ok "Code gepusht"

gh api -X POST "repos/$GhUser/$RepoName/pages" -f build_type=workflow 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { gh api -X PUT "repos/$GhUser/$RepoName/pages" -f build_type=workflow 2>$null | Out-Null }
Ok "GitHub Pages ingesteld op GitHub Actions"

Info "Wachten tot de Pages-workflow klaar is (ca. 1 minuut)..."
Start-Sleep -Seconds 8
$runId = gh run list --repo "$GhUser/$RepoName" --workflow 'Webapp naar GitHub Pages' --limit 1 --json databaseId -q '.[0].databaseId' 2>$null
if ($runId) { gh run watch --exit-status --repo "$GhUser/$RepoName" $runId 2>$null | Out-Null }
if ($LASTEXITCODE -eq 0 -and $runId) { Ok "Webapp gepubliceerd" } else { Warn "Kon de workflow niet volgen; controleer op https://github.com/$GhUser/$RepoName/actions" }

# -----------------------------------------------------------------------------
""
Bold "Klaar!"
""
"  Open de app:            $PagesUrl"
"  API:                    $WorkerUrl"
""
"  Volgende stappen in de app:"
"   1. 'Eerste keer instellen' -> je naam + het opstartwachtwoord hierboven -> passkey aanmaken."
"   2. Instellingen -> AI-sommelier -> Anthropic (Claude) kiezen, model kiezen, API-sleutel plakken, 'Verbinding testen'."
"   3. Beheer -> Lid uitnodigen -> link naar Angela sturen."
""
"  Later iets aanpassen? Wijzig de code, commit en push: GitHub Actions publiceert de webapp automatisch."
"  De API opnieuw publiceren: cd api; npm run deploy"
"  Opstartwachtwoord kwijt? cd api; npx wrangler secret put BOOTSTRAP_SECRET  (alleen nodig zolang er nog geen beheerder is)"
