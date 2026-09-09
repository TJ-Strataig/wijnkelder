#!/usr/bin/env bash
# =============================================================================
#  Wijnkelder — installatiescript (macOS / Linux / WSL)
#  Doet de hele terminal-kant in één keer: GitHub-repo, GitHub Pages,
#  Cloudflare database + fotobucket + geheimen, configuratie invullen, publiceren.
#  Je hoeft alleen in te loggen als het script daarom vraagt (browser opent).
#
#  Gebruik:   bash setup.sh
#  Opnieuw draaien is veilig: bestaande onderdelen worden overgeslagen.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
info() { printf '  \033[36m→\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✘ %s\033[0m\n' "$*"; exit 1; }
ask()  { local v; read -r -p "  $1 " v; echo "$v"; }

# Vervangt in een bestand een regel die met KEY begint (werkt op macOS en Linux zonder sed -i-verschillen).
set_toml() { # bestand sleutel waarde
  python3 - "$1" "$2" "$3" <<'PY'
import re, sys
path, key, value = sys.argv[1:4]
s = open(path).read()
pattern = re.compile(rf'^(\s*#?\s*{re.escape(key)}\s*=\s*).*$', re.M)
line = f'{key} = "{value}"'
s, n = pattern.subn(line, s, count=1)
if n == 0: s += f'\n{line}\n'
open(path, 'w').write(s)
PY
}

bold "🍷 Wijnkelder — installatie"
echo

# -----------------------------------------------------------------------------
bold "1/8 Benodigde programma's"
command -v git  >/dev/null || die "git ontbreekt. Installeer git en draai het script opnieuw."
command -v node >/dev/null || die "Node.js ontbreekt. Installeer Node 20+ via https://nodejs.org en draai het script opnieuw."
command -v python3 >/dev/null || die "python3 ontbreekt (wordt gebruikt om configuratiebestanden aan te passen)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js $NODE_MAJOR is te oud; 20 of hoger is nodig."
ok "git, node $(node -v), python3"

if ! command -v gh >/dev/null; then
  warn "GitHub CLI (gh) ontbreekt."
  if command -v brew >/dev/null; then
    info "Installeren via Homebrew…"; brew install gh
  else
    die "Installeer GitHub CLI: https://cli.github.com (Ubuntu: sudo apt install gh) en draai het script opnieuw."
  fi
fi
ok "GitHub CLI $(gh --version | head -1 | awk '{print $3}')"

info "Node-pakketten voor de API installeren…"
(cd api && npm install --silent --no-fund --no-audit)
WRANGLER="npx --yes wrangler"
ok "wrangler $(cd api && $WRANGLER --version 2>/dev/null | tail -1)"

# -----------------------------------------------------------------------------
echo; bold "2/8 Inloggen"
if ! gh auth status >/dev/null 2>&1; then
  info "Er opent een browser om in te loggen bij GitHub…"
  gh auth login --web --git-protocol https
fi
GH_USER="$(gh api user -q .login)"
GH_HOST="$(echo "${GH_USER}.github.io" | tr "[:upper:]" "[:lower:]")"  # webadressen zijn altijd kleine letters
ok "GitHub: ingelogd als $GH_USER"

cf_token_ok() { curl -fsS -m 20 -H "Authorization: Bearer $1" https://api.cloudflare.com/client/v4/user/tokens/verify 2>/dev/null | grep -q '"status": *"active"'; }
cf_ok() { if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then cf_token_ok "$CLOUDFLARE_API_TOKEN"; else (cd api && $WRANGLER whoami 2>&1 | grep -q 'Account ID'); fi; }
if ! cf_ok; then
  info "Er opent een browser om in te loggen bij Cloudflare…"
  (cd api && $WRANGLER login) || true
fi
if ! cf_ok; then
  echo
  info "De browser-login is niet gelukt. Gebruik een API-token (1 minuut):"
  echo "   1. Open https://dash.cloudflare.com/profile/api-tokens → 'Create Token'."
  echo "   2. Sjabloon 'Edit Cloudflare Workers' → 'Use template'."
  echo "   3. Voeg onder Permissions toe:  Account | D1 | Edit   en   Account | Workers R2 Storage | Edit"
  echo "   4. 'Continue to summary' → 'Create Token' → kopieer het token."
  read -r -s -p "  Plak het Cloudflare API-token: " CF_TOKEN; echo
  CF_TOKEN="$(echo "$CF_TOKEN" | tr -d '[:space:]')"
  cf_token_ok "$CF_TOKEN" || die "Cloudflare meldt dat dit token niet geldig/actief is. Controleer of je het volledige token hebt geplakt."
  export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
fi
ok "Cloudflare: ingelogd"

# -----------------------------------------------------------------------------
echo; bold "3/8 GitHub-repository"
REPO_NAME="$(ask "Naam van de repository [wijnkelder]:")"; REPO_NAME="${REPO_NAME:-wijnkelder}"
PAGES_ORIGIN="https://${GH_HOST}"
PAGES_URL="${PAGES_ORIGIN}/$(echo "$REPO_NAME" | tr "[:upper:]" "[:lower:]")/"

if [ ! -d .git ]; then git init -q -b main; fi
if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "${GH_USER}/${REPO_NAME}" >/dev/null 2>&1; then
    git remote add origin "https://github.com/${GH_USER}/${REPO_NAME}.git"
    ok "Bestaande repository gekoppeld: ${GH_USER}/${REPO_NAME}"
  else
    # GitHub Pages is op een gratis account alleen beschikbaar voor OPENBARE repositories.
    # De code bevat geen geheimen (die staan in Cloudflare); de app zelf is beveiligd met passkeys.
    gh repo create "${REPO_NAME}" --public --source=. --remote=origin >/dev/null
    ok "Openbare repository aangemaakt: ${GH_USER}/${REPO_NAME} (nodig voor gratis GitHub Pages; bevat geen geheimen)"
  fi
else
  ok "Repository al gekoppeld: $(git remote get-url origin)"
fi

# -----------------------------------------------------------------------------
echo; bold "4/8 Cloudflare: database en fotobucket"
cd api
DB_ID="$($WRANGLER d1 list --json 2>/dev/null | python3 -c 'import json,sys; print(next((d["uuid"] for d in json.load(sys.stdin) if d["name"]=="wijnkelder"), ""))' || true)"
if [ -z "$DB_ID" ]; then
  info "Database aanmaken…"
  $WRANGLER d1 create wijnkelder >/dev/null 2>&1 || true
  DB_ID="$($WRANGLER d1 list --json 2>/dev/null | python3 -c 'import json,sys; print(next((d["uuid"] for d in json.load(sys.stdin) if d["name"]=="wijnkelder"), ""))' || true)"
fi
[ -n "$DB_ID" ] || die "Kon de database niet terugvinden. Heeft het token het recht 'D1: Edit'?"
set_toml wrangler.toml database_id "$DB_ID"
ok "D1-database 'wijnkelder' ($DB_ID)"

if ! $WRANGLER r2 bucket list 2>/dev/null | grep -q 'wijnkelder-fotos'; then
  info "Fotobucket aanmaken…"
  $WRANGLER r2 bucket create wijnkelder-fotos >/dev/null 2>&1 || true
  $WRANGLER r2 bucket list 2>/dev/null | grep -q 'wijnkelder-fotos' || die "Fotobucket aanmaken mislukt. Activeer R2 eenmalig in het Cloudflare-dashboard (R2 Object Storage) of controleer het recht 'Workers R2 Storage: Edit'."
fi
ok "R2-bucket 'wijnkelder-fotos'"

info "Tabellen aanmaken…"
SCHEMA_OUT="$($WRANGLER d1 execute wijnkelder --remote --file=./schema.sql -y 2>&1)" || true
echo "$SCHEMA_OUT" | grep -q '\[ERROR\]' && { echo "$SCHEMA_OUT"; die "Databaseschema toepassen mislukt."; }
ok "Databaseschema toegepast"

# -----------------------------------------------------------------------------
echo; bold "5/8 Configuratie"
set_toml wrangler.toml ORIGIN "$PAGES_ORIGIN"
set_toml wrangler.toml RP_ID "$GH_HOST"
ok "wrangler.toml: ORIGIN=$PAGES_ORIGIN, RP_ID=$GH_HOST"

# -----------------------------------------------------------------------------
echo; bold "6/8 API publiceren naar Cloudflare"
DEPLOY_OUT="$($WRANGLER deploy 2>&1)" || true
echo "$DEPLOY_OUT" | grep -q '\[ERROR\]' && { echo "$DEPLOY_OUT"; die "Publiceren van de API mislukt."; }
WORKER_URL="$(echo "$DEPLOY_OUT" | grep -Eo 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)"
[ -n "$WORKER_URL" ] || die "Kon het adres van de Worker niet bepalen. Uitvoer:\n$DEPLOY_OUT"
ok "API draait op $WORKER_URL"
echo; bold "7/8 Geheimen"
has_secret() { $WRANGLER secret list 2>/dev/null | grep -q "\"name\": *\"$1\""; }

if has_secret SESSION_SECRET; then
  ok "SESSION_SECRET bestaat al"
else
  SESSION_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  printf '%s' "$SESSION_SECRET" | $WRANGLER secret put SESSION_SECRET >/dev/null 2>&1 || true
  has_secret SESSION_SECRET || die "SESSION_SECRET instellen mislukt."
  ok "SESSION_SECRET aangemaakt (willekeurig, 64 tekens)"
fi

if has_secret BOOTSTRAP_SECRET; then
  ok "BOOTSTRAP_SECRET bestaat al"
else
  BOOTSTRAP="$(node -e 'console.log(require("crypto").randomBytes(9).toString("base64url"))')"
  printf '%s' "$BOOTSTRAP" | $WRANGLER secret put BOOTSTRAP_SECRET >/dev/null 2>&1 || true
  has_secret BOOTSTRAP_SECRET || die "BOOTSTRAP_SECRET instellen mislukt."
  ok "BOOTSTRAP_SECRET aangemaakt"
  echo
  printf '  \033[1;33m┌──────────────────────────────────────────────────────────────┐\033[0m\n'
  printf '  \033[1;33m│  OPSTARTWACHTWOORD (eenmalig nodig bij de eerste login):    │\033[0m\n'
  printf '  \033[1;33m│  %-59s │\033[0m\n' "$BOOTSTRAP"
  printf '  \033[1;33m└──────────────────────────────────────────────────────────────┘\033[0m\n'
  echo "  Bewaar dit even; je vult het in bij 'Eerste keer instellen' in de app."
fi
info "De AI-sleutel (Anthropic/OpenAI) stel je straks in de app in onder Instellingen → AI-sommelier."

# -----------------------------------------------------------------------------
cd "$ROOT"

python3 - "$WORKER_URL" <<'PY'
import re, sys
url = sys.argv[1]
p = 'web/config.js'
s = open(p).read()
s = re.sub(r"export const API_BASE = '[^']*';", f"export const API_BASE = '{url}';", s)
open(p, 'w').write(s)
PY
ok "web/config.js: API_BASE=$WORKER_URL"

# -----------------------------------------------------------------------------
echo; bold "8/8 Webapp publiceren naar GitHub Pages"
VIS="$(gh repo view "${GH_USER}/${REPO_NAME}" --json visibility -q .visibility 2>/dev/null || true)"
if [ "$VIS" = "PRIVATE" ]; then
  warn "De repository is privé. GitHub Pages werkt op een gratis account alleen voor openbare repositories."
  ANTW="$(ask "Repository openbaar maken? De code bevat geen geheimen; de app blijft beveiligd met passkeys. [J/n]")"
  case "${ANTW:-J}" in [JjYy]*) gh repo edit "${GH_USER}/${REPO_NAME}" --visibility public --accept-visibility-change-consequences >/dev/null 2>&1 && ok "Repository is nu openbaar";; *) warn "Blijft privé; Pages werkt dan alleen met GitHub Pro.";; esac
fi

# Vaste pakketversies vastleggen (lockfile) zodat de deploy-workflow met 'npm ci' werkt en niet ongemerkt nieuwe versies binnenhaalt.
[ -f api/package-lock.json ] || (cd api && npm install --package-lock-only --silent --no-fund --no-audit >/dev/null 2>&1 || true)
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-Wijnkelder setup}" -c user.email="${GIT_AUTHOR_EMAIL:-setup@wijnkelder.local}" \
  commit -qm "Wijnkelder: installatie en configuratie" >/dev/null 2>&1 || true
git push -qu origin main
ok "Code gepusht"

# GitHub Pages op 'GitHub Actions' zetten (negeer fout als het al zo staat)
gh api -X POST "repos/${GH_USER}/${REPO_NAME}/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/${GH_USER}/${REPO_NAME}/pages" -f build_type=workflow >/dev/null 2>&1 || true
ok "GitHub Pages ingesteld op GitHub Actions"
info "Workflow (opnieuw) starten zodat de webapp gepubliceerd wordt…"
sleep 3; gh workflow run "Webapp naar GitHub Pages" --repo "${GH_USER}/${REPO_NAME}" >/dev/null 2>&1 || true

info "Wachten tot de Pages-workflow klaar is (±1 minuut)…"
sleep 8
gh run watch --exit-status --repo "${GH_USER}/${REPO_NAME}" "$(gh run list --repo "${GH_USER}/${REPO_NAME}" --workflow 'Webapp naar GitHub Pages' --limit 1 --json databaseId -q '.[0].databaseId')" >/dev/null 2>&1 \
  && ok "Webapp gepubliceerd" || warn "Kon de workflow niet volgen; controleer op https://github.com/${GH_USER}/${REPO_NAME}/actions"

# -----------------------------------------------------------------------------
echo
bold "🎉 Klaar!"
echo
echo "  Open de app:            $PAGES_URL"
echo "  API:                    $WORKER_URL"
echo
echo "  Volgende stappen in de app:"
echo "   1. 'Eerste keer instellen' → je naam + het opstartwachtwoord hierboven → passkey aanmaken."
echo "   2. Instellingen → AI-sommelier → Anthropic (Claude) kiezen, model kiezen, API-sleutel plakken, 'Verbinding testen'."
echo "   3. Beheer → Lid uitnodigen → link naar Angela sturen."
echo
echo "  Later iets aanpassen? Wijzig de code, commit en push: GitHub Actions publiceert de webapp automatisch."
echo "  De API opnieuw publiceren: cd api && npm run deploy"
echo "  Opstartwachtwoord kwijt? cd api && npx wrangler secret put BOOTSTRAP_SECRET  (alleen nodig zolang er nog geen beheerder is)"
