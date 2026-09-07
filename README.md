# 🍷 Wijnkelder — de gezamenlijke wijncollectie van Angela & Tije

Een responsive webapp (installeerbaar op telefoon en tablet) voor het bijhouden van de wijnkelder van het huishouden.
Inloggen gaat met **passkeys** (Face ID / Touch ID / Windows Hello), leden worden alleen door de beheerder toegevoegd, en
alle leden zien en beheren dezelfde collectie.

## Wat kan de app?

**Collectie**
- **AI naar keuze**: onder *Instellingen → AI-sommelier* kiest de beheerder tussen **Anthropic (Claude Sonnet 4.5, Opus 4.1, Haiku 4.5, …)** en **OpenAI**, voert de API-sleutel in (versleuteld opgeslagen) en test de verbinding met één klik.
- **Bulk toevoegen**: kies meerdere etiketfoto's tegelijk (van één of verschillende wijnhuizen) of fotografeer fles na fles. Gedeelde aankoopgegevens (datum, winkel, kelderlocatie) vul je één keer in; **aantal en prijs per fles** apart. De AI herkent de etiketten; jij controleert en keurt **elke fles apart goed** voordat hij in de kelder komt. Duplicaten worden herkend en als extra flessen bijgeboekt.
- **Later beoordelen**: zet het vinkje aan en de foto's + herkenning gaan naar een **beoordelingswachtrij op de server**. Maak onderweg of in de winkel de foto's op je telefoon, en loop ze later op de desktop rustig door (bewaren, goedkeuren, overslaan). Alle huishoudleden zien dezelfde wachtrij, gegroepeerd per partij.
- Wijnen toevoegen **via een foto van het etiket** (AI herkent producent, naam, jaargang, land, streek, appellatie, druiven, alcohol, stijl, drinkvenster, ontwikkeling, gerechten, beschrijving en een prijsindicatie) of **handmatig**, met een knop om ontbrekende gegevens door AI te laten aanvullen.
- **Direct naar de historie**: bij het toevoegen kies je *in de kelder leggen* of *al gedronken / meteen weggegeven*. Handig voor een fles in een restaurant of een cadeau dat meteen opengaat: met datum, waar gedronken, gelegenheid en desgewenst een proefnotitie. Werkt op de Toevoegen-pagina, bij bulk-goedkeuring, in de wachtrij en bij *Flessen toevoegen* op een bestaande wijn.
- **Meerdere flessen** per wijn, elk met eigen prijs, aankoopdatum, winkel, inhoud (halve fles t/m dubbele magnum) en **locatie in de kelder** (rek/plank).
- Per fles vastleggen of het een **gekregen fles** is (en van wie). Voor gekregen flessen haalt de app met één klik een **prijsindicatie** op (webzoekresultaten + AI, met bronvermelding en zekerheid).
- **Bewaarwijn**-markering, drinkvenster (drinken van–tot), **hoogtepunt** (op z'n best van–tot), hoe de wijn zich ontwikkelt, serveertemperatuur en decanteertijd — met een visuele tijdlijn en statussen als *Nu op z'n best*, *Te jong*, *Snel drinken*, *Over hoogtepunt*.
- **Duplicaatbewaking**: voer je een fles in die al in de collectie staat (zelfde wijnhuis, naam, jaargang, type, druiven en inhoud — hoofdletters en accenten tellen niet), dan waarschuwt de app direct tijdens het invullen én blokkeert de server een dubbel record. Je kiest dan: *flessen bijboeken* op de bestaande wijn (meestal), of *toch apart toevoegen* als het echt een andere wijn is. Werkt overal: Toevoegen, bulk en de beoordelingswachtrij. Een andere jaargang of een magnum telt als andere wijn; daarvoor krijg je een zachte hint.
- Favorieten, eigen notities.

**Zoeken & filteren** op naam, producent, land, streek, type (rood / wit / rosé / mousserend / port / dessert / versterkt / oranje), jaargang (van–tot), druivenras, bewaarwijn, drinkvenster-status, gekregen, favoriet, locatie, prijs — en sorteren op naam, jaargang, beoordeling, aantal, "drinken vóór" of prijs.

**Flessen openen & historie**
- Een fles "openen" verplaatst hem naar de **historie** met reden (gedronken, weggegeven, verkocht, kurk/beschadigd, anders), datum, wie en opmerking — desgewenst direct met een proefnotitie. Terugzetten kan altijd.
- Historie is doorzoekbaar en filterbaar per reden en jaar; daarnaast een **activiteitenlogboek** (wie voegde wat toe, wie opende wat).

**Proefnotities** per wijn en per fles: score (50–100, met sterren), kleur, neus, smaak, afdronk, gelegenheid, gegeten met, opnieuw kopen ja/nee, vrije notities. Gemiddelde score per wijn en een "best beoordeeld"-lijst.

**Spijs & wijn**
- Kies een gerecht (30 categorieën: van biefstuk en oesters tot rijsttafel, stamppot, geitenkaas en chocoladedessert) → passende wijnen **uit de eigen kelder** met match-percentage.
- Andersom: kies een wijn → welke gerechten passen.
- **AI-sommelier**: typ wat je gaat eten en krijg de beste 5 flessen uit de kelder met uitleg en serveertip, rekening houdend met drinkvensters. Op de wijnpagina kan de AI ook gerechten voorstellen.

**Herkomst & wijnhuizen**
- **Topografische kaart** (OpenTopoMap, omschakelbaar naar stratenkaart) met een speld per wijn, gekleurd op type en met het aantal flessen. Spelden dicht bij elkaar worden gegroepeerd; tik om in te zoomen. Tik op een speld voor de wijnen op die plek en het wijnhuis.
- Locaties worden automatisch bepaald (knop *Locaties bepalen*): eerst het wijnhuis zelf, anders appellatie, streek of land — de nauwkeurigheid staat erbij.
- **Wijnhuizen** (in het menu): alle producenten uit de kelder, met een door de AI geschreven profiel (geschiedenis, ligging, eigenaar, wijnmaker, hectares, filosofie, bekendste wijnen, website) en ruimte voor eigen notities. Ook zichtbaar op de wijnpagina en op de kaart.

**Statistieken**: flessen, wijnen, aankoopwaarde en geschatte waarde (incl. prijsindicatie voor gekregen flessen), gedronken, gekregen, verdeling per type/land/jaargang, gedronken per maand, en drinkvenster-overzichten (*nu drinken*, *snel drinken*, *over hoogtepunt*, *te jong*).

**Extra's, geïnspireerd op wat CellarTracker, Vivino, InVintory, Cellarion en Sommo bieden**
- Verlanglijst (met maximale prijs en notitie).
- Kelderlocaties per fles, en filter op locatie.
- Data-export als **CSV** (Excel) en **JSON** (volledige back-up) — geen lock-in.
- Installeerbaar als app (PWA) met donker thema.
- Meerdere passkeys per persoon (telefoon + laptop), "overal uitloggen".
- Wie-deed-wat activiteitenlog voor het huishouden.

Zie [SECURITY.md](SECURITY.md) voor alle beveiligingsmaatregelen.

## Architectuur

```
GitHub Pages  ──(https)──▶  Cloudflare Worker (API)  ──▶  D1 (SQLite database)
 web/  (statische PWA)        api/                     ──▶  R2 (privé fotobucket)
                                                        ──▶  Anthropic Claude of OpenAI (etiket, prijs, spijs-wijn) — instelbaar in de app
                                                        ──▶  Brave Search (optioneel, voor prijsindicaties)
```

- **web/** — pure HTML/CSS/JavaScript zonder build-stap of externe bibliotheken. Wordt door GitHub Actions naar GitHub Pages gepubliceerd.
- **api/** — Cloudflare Worker (gratis tier ruim voldoende voor een huishouden) met passkey-authenticatie via `@simplewebauthn/server`.

## Snelle installatie met het script (aanbevolen, ±10 minuten)

Het script doet alle terminal-stappen voor je: GitHub-repo, GitHub Pages, Cloudflare-database en fotobucket, geheimen, configuratie invullen en publiceren. Je hoeft alleen in te loggen als het daarom vraagt (er opent een browservenster voor GitHub en voor Cloudflare).

**Vooraf nodig (eenmalig):** een GitHub-account, een gratis [Cloudflare](https://dash.cloudflare.com/sign-up)-account, [Node.js 20+](https://nodejs.org) en [GitHub CLI](https://cli.github.com) (het script installeert `gh` zelf als Homebrew of winget aanwezig is).

Open de map in VS Code en draai in de terminal:

```bash
# macOS / Linux / WSL
bash setup.sh
```
```powershell
# Windows PowerShell
.\setup.ps1
# Mag je geen scripts uitvoeren (beheerde laptop, 'execution policy')? Gebruik dan:
Get-Content .\setup.ps1 -Raw | Invoke-Expression
```

Voor Cloudflare vraagt het script om een **API-token** (op Windows werkt de browser-login vaak niet): maak die aan op dash.cloudflare.com/profile/api-tokens met het sjabloon *Edit Cloudflare Workers*, aangevuld met *D1: Edit* en *Workers R2 Storage: Edit*. Het script legt dit stap voor stap uit.

Aan het einde toont het script het adres van de app en een **opstartwachtwoord** voor de eerste login. Daarna in de app:
1. **Eerste keer instellen** → naam + opstartwachtwoord → passkey aanmaken.
2. **Instellingen → AI-sommelier** → Anthropic (Claude) kiezen, model kiezen, API-sleutel van console.anthropic.com plakken → *Verbinding testen*.
3. **Beheer → Lid uitnodigen** → link naar Angela sturen.

Het script is veilig opnieuw te draaien: wat al bestaat wordt overgeslagen. Je kunt het ook aan de AI-assistent in VS Code geven ("draai setup.sh en help me bij de vragen").

## Handmatige installatie (als je liever elke stap zelf doet, ±30 minuten)

### 1. Repository op GitHub
1. Maak een nieuwe **openbare** repository, bijv. `wijnkelder`, en upload de inhoud van deze map. (GitHub Pages is op een gratis account alleen beschikbaar voor openbare repositories. Dat is veilig: de code bevat geen geheimen — die staan als secrets in Cloudflare — en de app zelf is afgeschermd met passkeys. Wil je de code toch privé houden, dan is GitHub Pro nodig.)
2. Ga naar **Settings → Pages** en kies bij *Source*: **GitHub Actions**.
3. Na de eerste push draait de workflow *Webapp naar GitHub Pages*. Het adres wordt `https://<gebruikersnaam>.github.io/wijnkelder/`.

> **Belangrijk voor passkeys:** het adres van de webapp bepaalt de *RP ID*. Voor `https://tije.github.io/wijnkelder/` is dat `tije.github.io`. Verhuis je later naar een eigen domein, dan moeten alle passkeys opnieuw worden aangemaakt.

### 2. Cloudflare (API, database, foto-opslag)
Maak een gratis account op cloudflare.com en installeer Node.js 20+.

```bash
cd api
npm install
npx wrangler login

# Database en fotobucket aanmaken
npx wrangler d1 create wijnkelder          # kopieer het database_id in wrangler.toml
npx wrangler r2 bucket create wijnkelder-fotos
npm run db:init                            # maakt de tabellen aan

# Geheimen instellen (elke opdracht vraagt om de waarde)
npx wrangler secret put SESSION_SECRET     # bijv. uitvoer van: openssl rand -base64 48
npx wrangler secret put BOOTSTRAP_SECRET   # eenmalig opstartwachtwoord voor de eerste beheerder
npx wrangler secret put BRAVE_API_KEY      # optioneel: https://brave.com/search/api (gratis tier)
```

Pas in `api/wrangler.toml` aan:
- `ORIGIN` → `https://<gebruikersnaam>.github.io` (zonder pad, zonder slash)
- `RP_ID` → `<gebruikersnaam>.github.io`
- `database_id` → het id uit `wrangler d1 create`
- de AI-sleutel stel je straks **in de app** in (stap 6); je kunt optioneel ook een terugval-sleutel als secret zetten (`AI_API_KEY`, met `AI_PROVIDER`/`AI_MODEL` in `wrangler.toml`)

Publiceer de API:
```bash
npm run deploy
```
Noteer het adres, bijv. `https://wijnkelder-api.<subdomein>.workers.dev`.

### 3. Webapp koppelen aan de API
Zet in `web/config.js` het Worker-adres in `API_BASE` en push naar `main`. Klaar.

### 4. Eerste beheerder
Open de webapp. Omdat er nog geen gebruikers zijn, verschijnt **Eerste keer instellen**: vul je naam en het `BOOTSTRAP_SECRET` in en maak je passkey aan. Daarna is deze route voorgoed gesloten.

### 5. Huishoudleden toevoegen
**Beheer → Lid uitnodigen** → naam en rol → je krijgt een link die 48 uur geldig is en één keer werkt. Stuur die persoonlijk door; de genodigde maakt ermee een eigen passkey aan.

### 6. AI-sommelier instellen (Claude of OpenAI)
**Instellingen → AI-sommelier** (alleen beheerder): kies *Anthropic (Claude)*, kies een model (aanbevolen: Claude Sonnet 4.5) en plak je API-sleutel van console.anthropic.com. Klik **Opslaan** en daarna **Verbinding testen**. De sleutel wordt met AES-256-GCM versleuteld in de database bewaard en is daarna niet meer uit te lezen — ook niet door beheerders. Je kunt elk moment van model wisselen; alle leden gebruiken dezelfde instelling.

Wil je op een tweede apparaat inloggen? **Instellingen → Passkey voor dit apparaat** (of gebruik de QR-code die de browser aanbiedt om met je telefoon in te loggen).

### Automatisch publiceren van de API via GitHub (optioneel)
Voeg in de repository onder **Settings → Secrets and variables → Actions** toe: `CLOUDFLARE_API_TOKEN` (met rechten *Workers Scripts: Edit*, *D1: Edit*, *R2: Edit*) en `CLOUDFLARE_ACCOUNT_ID`. De workflow *API naar Cloudflare Workers* publiceert dan bij elke wijziging in `api/`.

## Kosten
- GitHub Pages: gratis.
- Cloudflare Workers/D1/R2: gratis tier is ruim voldoende voor een huishouden.
- AI: een etiketherkenning kost met Claude Haiku of GPT-4o mini doorgaans minder dan een cent, met Claude Sonnet enkele centen en met Opus een dubbeltje of meer; prijsindicaties en spijs-wijn advies zijn goedkoper. AI-verzoeken zijn begrensd op 60 per uur per persoon.
- Brave Search API: gratis tier (2.000 zoekopdrachten/maand) — alleen nodig als je prijsindicaties op echte webresultaten wilt baseren.

## Bijwerken van een bestaande installatie
Nieuwe versies vervangen alleen code; jullie wijnen, gebruikers en foto's blijven staan. Wanneer een update een **databasemigratie** meebrengt (staat in `api/migrations/`), voer die dan één keer uit — migraties voegen alleen toe en verwijderen niets:
```bash
cd api
npx wrangler d1 execute wijnkelder --remote --file=./migrations/0003_wachtrij.sql -y
npm run deploy
```

## Tests
```bash
cd api && npm test
```
Draait 25 beveiligings- en functietests tegen de API (in-memory database, geen Cloudflare nodig). Zie [SECURITY.md](SECURITY.md) voor de reviewresultaten.

## Lokaal ontwikkelen
```bash
cd api && cp .dev.vars.example .dev.vars   # vul de geheimen in
npm run db:init:local && npm run dev       # API op http://localhost:8787
```
Zet in `web/config.js` tijdelijk `API_BASE = 'http://localhost:8787'` en in `wrangler.toml` `ORIGIN = "http://localhost:5500"`, `RP_ID = "localhost"`; serveer `web/` bijv. met `npx serve web -l 5500`.
Passkeys werken op `localhost` zonder https.

## Mappenstructuur
```
web/                  webapp (GitHub Pages)
  index.html          app-schil met strikte Content Security Policy
  config.js           API-adres
  css/app.css         wijnthema (bordeaux, crème, goud) + donker thema
  js/app.js           routering en navigatie
  js/api.js           communicatie met de API
  js/auth.js          passkeys (WebAuthn) in de browser
  js/pairings.js      spijs-wijn regels
  js/views/           kelder, wijn, toevoegen, historie, spijs & wijn, statistieken, verlanglijst, beheer, instellingen
  sw.js, manifest     installeerbaar als app
api/                  Cloudflare Worker
  schema.sql          databaseschema
  src/index.js        router, CORS, autorisatie
  src/auth.js         passkeys, sessies, uitnodigingen, ledenbeheer
  src/wines.js        wijnen, flessen, proefnotities, historie, statistieken, export, foto's
  src/ai.js           AI-aanbieders (Anthropic/OpenAI), etiketherkenning, prijsindicatie, spijs-wijn advies
.github/workflows/    automatisch publiceren
setup.sh / setup.ps1  installatiescript (macOS/Linux resp. Windows)
```

## Licentie
Privéproject voor eigen gebruik.
