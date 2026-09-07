# Herstelscript voor de Wijnkelder-installatie van TJ-Strataig.
# Uitvoeren in de projectmap (waar api/ en web/ in staan):
#   Get-Content .\herstel.ps1 -Raw | iex
$ErrorActionPreference = 'Continue'
if (-not (Test-Path 'api/wrangler.toml')) { throw "Start dit script vanuit de projectmap 'wijnkelder'." }

$user = 'TJ-Strataig'
$repo = 'wijnkelder'
$host_ = 'tj-strataig.github.io'

Write-Host "1/4 Repository openbaar maken (nodig voor gratis GitHub Pages)..."
gh repo edit "$user/$repo" --visibility public --accept-visibility-change-consequences
Write-Host "    klaar"

Write-Host "2/4 GitHub Pages inschakelen op GitHub Actions..."
gh api -X POST "repos/$user/$repo/pages" -f build_type=workflow 2>&1 | Out-Null
gh api -X PUT  "repos/$user/$repo/pages" -f build_type=workflow 2>&1 | Out-Null
Write-Host "    klaar"

Write-Host "3/4 Kleine letters in api/wrangler.toml..."
$p = 'api/wrangler.toml'
$s = Get-Content $p -Raw
$s = [regex]::Replace($s, '(?m)^ORIGIN\s*=.*$', "ORIGIN = `"https://$host_`"")
$s = [regex]::Replace($s, '(?m)^RP_ID\s*=.*$',  "RP_ID = `"$host_`"")
Set-Content $p $s -NoNewline -Encoding UTF8
Write-Host "    ORIGIN = https://$host_"
Write-Host "    RP_ID  = $host_"

Write-Host "    Workflow bijwerken zodat Pages automatisch wordt ingeschakeld..."
$w = '.github/workflows/deploy-web.yml'
$y = Get-Content $w -Raw
if ($y -notmatch 'enablement') {
  $y = $y.Replace("      - uses: actions/configure-pages@v5`n", "      - uses: actions/configure-pages@v5`n        with:`n          enablement: true`n")
  $y = $y.Replace("      - uses: actions/configure-pages@v5`r`n", "      - uses: actions/configure-pages@v5`r`n        with:`r`n          enablement: true`r`n")
  Set-Content $w $y -NoNewline -Encoding UTF8
}

Write-Host "4/4 API opnieuw publiceren en code pushen..."
Push-Location api
npx --yes wrangler deploy 2>&1 | Select-String -Pattern 'workers.dev|ERROR'
Pop-Location
git add -A
git commit -qm "Pages inschakelen, kleine letters in configuratie" 2>&1 | Out-Null
git push -q origin main
Start-Sleep -Seconds 3
gh workflow run "Webapp naar GitHub Pages" --repo "$user/$repo" 2>&1 | Out-Null

Write-Host ""
Write-Host "Klaar. Controleer de workflow op:"
Write-Host "  https://github.com/$user/$repo/actions"
Write-Host "Na ongeveer een minuut opent de app op:"
Write-Host "  https://$host_/$repo/"
