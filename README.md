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
- **Dubbele schrijfwijzen samenvoegen**: de app controleert of hetzelfde wijnhuis onder verschillende namen in de kelder staat ("Muga" / "Bodegas Muga" / "Ch. Margaux" / "Château Margaux", typefouten, afkortingen, rechtsvormen) en toont bovenaan Wijnhuizen per groep een voorstel: kies de juiste naam en voeg samen (wijnen, verlanglijst en AI-profiel gaan mee), of markeer ze als verschillende huizen. Bij het toevoegen van een wijn krijg je direct de bestaande naam voorgesteld; bij een zekere match (alleen andere spelling) wordt die automatisch overgenomen — ook bij bulk, wachtrij en Sommelier-chat. Handmatig samenvoegen kan via het paneel van een wijnhuis. Elke zondag verschijnt onder 🔔 een melding als er nieuwe dubbele schrijfwijzen zijn.

**De Sommelier (chat-agent)** — tabblad 🍷 in de onderbalk. Praat in gewone taal, stuur een foto of spreek je vraag in. De Sommelier heeft gereedschappen en handelt zelf: kelder doorzoeken, etiket herkennen (→ beoordelingswachtrij, pas in de kelder na jouw bevestiging), wijnkaart lezen, fles afboeken met proefnotitie, drie flessen voor vanavond kiezen, verlanglijst, drinkvensters. Onder elk antwoord staat wat hij deed. **Hij praat uitsluitend over wijn**: drie lagen bewaking (onderwerpcontrole vóór elk antwoord, strikte instructie, gereedschappen die alleen wijngegevens kunnen) weren andere onderwerpen, andere dranken en pogingen om zijn instructies te omzeilen; geweigerde vragen staan in het activiteitenlog.

**Slimme functies**
- **Vanavond** — één tik en de huissommelier kiest drie flessen uit de kelder: een veilige keuze, een verrassing en iets dat nu open moet. Rekening houdend met dag, seizoen, wat je recent dronk, jullie scores en drinkvensters.
- **Restaurant-modus** — fotografeer de wijnkaart; de sommelier markeert wat jullie kennen (met eigen score) en adviseert op basis van smaakprofiel, gerecht en budget.
- **Sommelier-push** — wekelijkse tip voor het weekend, drinkvenster-meldingen (maandag) en voorraadtekorten (zaterdag), als pushmelding op de telefoon én in de 🔔-inbox in de app. Dag en tijd zelf instelbaar.
- **Smaakprofielen** — per persoon: scores per type, druif, land, streek en body; waar Angela en Tije verschillen; gedeelde favorieten.
- **Prijs & kwaliteit** — welke wijnen gaven de meeste punten voor hun geld, welke vielen tegen; grafiek prijs tegenover score.
- **Jaaroverzicht** — flessen gedronken/gekocht/gekregen, uitgegeven, beste fles, oudste fles, meest gedronken, per maand/type/land/gelegenheid/plek.
- **Aankooplijst met budget** — voorraaddoelen ("min. 6 doordeweekse witte onder € 12"); tekorten, geschatte kosten en suggesties uit wijnen die eerder goed scoorden.
- **Inventarisatie** — telronde: verwacht vs. geteld per wijn, verschillen zichtbaar, ontbrekende flessen desgewenst afboeken.
- **Cadeau-register** — gekregen flessen per gever, gelegenheid, en een herinnering om te bedanken na het openen.
- **Streepjescode** — scan de EAN met de camera: bestaande wijn direct gevonden (bijboeken), anders productgegevens als startpunt.
- **Laatste fles** — bij het openen van de laatste fles van een favoriet: met één tik op de verlanglijst.
- **Herkomstkaart met "gedronken"-laag** — zie ook waar jullie al geweest zijn en hoeveel landen jullie geproefd hebben.

**Statistieken**: flessen, wijnen, aankoopwaarde en geschatte waarde (incl. prijsindicatie voor gekregen flessen), gedronken, gekregen, verdeling per type/land/jaargang, gedronken per maand, en drinkvenster-overzichten (*nu drinken*, *snel drinken*, *over hoogtepunt*, *te jong*).

**Extra's, geïnspireerd op wat CellarTracker, Vivino, InVintory, Cellarion en Sommo bieden**
- Verlanglijst (met maximale prijs en notitie).
- Kelderlocaties per fles, en filter op locatie.
- Data-export als **CSV** (Excel) en **JSON** (collectie-export, geen volledige herstelback-up) — geen lock-in.
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

## Nieuwe installatie met het script

Het script maakt een nieuwe installatie: GitHub-repo, GitHub Pages, Cloudflare-database en fotobucket, Worker-geheimen, configuratie en publicatie. Het wijzigt bestanden en live instellingen en publiceert daadwerkelijk; gebruik het niet om alleen lokaal verder te ontwikkelen aan de bestaande installatie.

**Vooraf nodig (eenmalig):** een GitHub-account, een gratis [Cloudflare](https://dash.cloudflare.com/sign-up)-account, [Node.js 24+](https://nodejs.org) en [GitHub CLI](https://cli.github.com) (het script installeert `gh` zelf als Homebrew of winget aanwezig is). Houd `api/package-lock.json` aanwezig: pakketten worden met `npm ci` geinstalleerd.

Voor de gezamenlijke publicatieworkflow moeten ook de twee hieronder beschreven **Actions repository-secrets** zijn ingericht. Het script controleert alleen hun namen en stopt voor het pushen als ze ontbreken; het kopieert geen lokaal Cloudflare-token naar GitHub.

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

Het script slaat sommige bestaande resources over, maar voert ook configuratie-, database- en publicatiestappen uit. Herhaal het niet blind bij een bestaande installatie; controleer eerst de reeds uitgevoerde stappen.

## Handmatige installatie (als je liever elke stap zelf doet, ±30 minuten)

### 1. Repository op GitHub
1. Maak een nieuwe **openbare** repository, bijv. `wijnkelder`, en upload de inhoud van deze map. (GitHub Pages is op een gratis account alleen beschikbaar voor openbare repositories. Dat is veilig: de code bevat geen geheimen — die staan als secrets in Cloudflare — en de app zelf is afgeschermd met passkeys. Wil je de code toch privé houden, dan is GitHub Pro nodig.)
2. Ga naar **Settings → Pages** en kies bij *Source*: **GitHub Actions**.
3. Richt Cloudflare en de Actions-secrets hieronder in voordat je publiceert. De workflow *Wijnkelder publiceren* controleert de code en publiceert eerst de API, daarna de website. Het adres wordt `https://<gebruikersnaam>.github.io/wijnkelder/`.

> **Belangrijk voor passkeys:** het adres van de webapp bepaalt de *RP ID*. Voor `https://tije.github.io/wijnkelder/` is dat `tije.github.io`. Verhuis je later naar een eigen domein, dan moeten alle passkeys opnieuw worden aangemaakt.

### 2. Cloudflare (API, database, foto-opslag)
Maak een gratis account op cloudflare.com en installeer Node.js 24+.

```bash
cd api
npm ci
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
Zet bij een **nieuwe installatie** in `web/config.js` het Worker-adres in `API_BASE`. Richt de Actions-secrets hieronder in en push daarna naar `main`. Bij een bestaande installatie blijven `web/config.js` en de waarden in `api/wrangler.toml` behouden.

### 4. Eerste beheerder
Open de webapp. Omdat er nog geen gebruikers zijn, verschijnt **Eerste keer instellen**: vul je naam en het `BOOTSTRAP_SECRET` in en maak je passkey aan. Daarna is deze route voorgoed gesloten.

### 5. Huishoudleden toevoegen
**Beheer → Lid uitnodigen** → naam en rol → je krijgt een link die 48 uur geldig is en één keer werkt. Stuur die persoonlijk door; de genodigde maakt ermee een eigen passkey aan.

### 6. AI-sommelier instellen (Claude of OpenAI)
**Instellingen → AI-sommelier** (alleen beheerder): kies *Anthropic (Claude)*, kies een model (aanbevolen: Claude Sonnet 4.5) en plak je API-sleutel van console.anthropic.com. Klik **Opslaan** en daarna **Verbinding testen**. De sleutel wordt met AES-256-GCM versleuteld in de database bewaard en is daarna niet meer uit te lezen — ook niet door beheerders. Je kunt elk moment van model wisselen; alle leden gebruiken dezelfde instelling.

Wil je op een tweede apparaat inloggen? **Instellingen → Passkey voor dit apparaat** (of gebruik de QR-code die de browser aanbiedt om met je telefoon in te loggen).

### Gecontroleerd publiceren via GitHub

Voeg onder **Settings → Secrets and variables → Actions → Repository secrets** toe: `CLOUDFLARE_API_TOKEN` (met passende rechten voor de Worker, D1 en R2 in het bedoelde account) en `CLOUDFLARE_ACCOUNT_ID`. Deel waarden niet in chat, broncode of logs. Dit zijn andere instellingen dan de Worker-secrets zoals `SESSION_SECRET`.

`.github/workflows/checks.yml` draait op branches en pull requests bij wijzigingen aan API, webapp of workflows: Node 24, `npm ci`, de tests en een lokale Worker-bundeling (`npm run check:worker`). Hiervoor zijn geen productiesecrets nodig.

`.github/workflows/cloudflare-readiness.yml` is een afzonderlijke, **niet-publicerende** toegangscontrole. Deze draait wanneer dit workflowbestand op een werkbranch wordt gepusht, en is handmatig te starten zodra het op de standaardbranch staat. Na dezelfde lokale controles gebruikt hij de twee Actions-secrets om de status van het Cloudflare-gebruikerstoken en Worker-/D1-/R2-metadata te lezen. Hij wijzigt niets en bewijst geen schrijfrechten of geslaagde deployment. Gewone branch- en PR-controles blijven zonder productiesecrets draaien.

`.github/workflows/deploy.yml` (*Wijnkelder publiceren*) draait bij relevante pushes naar `main` of een handmatige start op `main`:

1. Bepaal wijzigingen sinds de laatste geslaagde gezamenlijke release en voer dezelfde controles uit.
2. Publiceer de API als `api/` is gewijzigd. Ontbrekende Cloudflare-secrets blokkeren deze stap.
3. Publiceer Pages als `web/` is gewijzigd, maar pas nadat een vereiste API-publicatie is geslaagd. Een bewust overgeslagen API-stap is toegestaan bij een web-only release.

De **eerste release**, een handmatige start en wijzigingen aan workflows publiceren beide onderdelen. Daardoor blokkeren ontbrekende Cloudflare-secrets ook de eerste websitepublicatie. Bij latere web-only releases vanaf een geslaagde release zijn ze niet nodig. Na een mislukte of geannuleerde release worden conservatief beide onderdelen gepubliceerd: de API kan immers al zijn bijgewerkt voordat Pages faalde, zelfs als een volgende commit die wijziging terugdraait. Overgeslagen wachtrijcommits zonder eigen run tellen mee in de vergelijking met de laatste geslaagde release.

Releases lopen na elkaar zonder een lopende release automatisch af te breken. Een run die bij de selectie niet meer de actuele `main` vertegenwoordigt, wordt geweigerd. Is een oude basiscommit niet meer beschikbaar, dan faalt de selectie; een bewuste handmatige release op de actuele `main` publiceert beide onderdelen zonder die vergelijking.

Dit is **geen atomaire release**: als de API slaagt maar Pages faalt, draait de nieuwe API met de oude website. API-wijzigingen moeten dus achterwaarts compatibel blijven. Migraties worden nooit automatisch uitgevoerd. Verplichte PR-controles/branch protection zijn een afzonderlijke repository-instelling; deze workflows stellen ze niet zelf in.

## Kosten
- GitHub Pages: gratis.
- Cloudflare Workers/D1/R2: gratis tier is ruim voldoende voor een huishouden.
- AI: een etiketherkenning kost met Claude Haiku of GPT-4o mini doorgaans minder dan een cent, met Claude Sonnet enkele centen en met Opus een dubbeltje of meer; prijsindicaties en spijs-wijn advies zijn goedkoper. AI-verzoeken zijn begrensd op 60 per uur per persoon.
- Brave Search API: gratis tier (2.000 zoekopdrachten/maand) — alleen nodig als je prijsindicaties op echte webresultaten wilt baseren.

## Bijwerken van een bestaande installatie
Ontwikkelen op een werkbranch publiceert niets. Pas een relevante push/merge naar `main` of een bewuste handmatige release start de publicatieroute. Zolang repository, Pages-instellingen, Worker-naam en configuratie gelijk blijven, blijft het adres `https://tj-strataig.github.io/wijnkelder/` hetzelfde.

Bewaar alle installatiegebonden waarden in `api/wrangler.toml` en heel `web/config.js`; neem deze bestanden niet automatisch over uit een zip of andere sessie. Het TOML-bestand moet UTF-8 **zonder BOM** blijven, ook bij opslaan vanuit Windows PowerShell.

Codepublicatie wist de database en foto's niet, maar dat bewijst niet dat elke wijziging veilig is. Controleer bij een **databasemigratie** in `api/migrations/` eerst welke wijzigingen al zijn toegepast en maak een herstelplan. Sommige migraties kunnen niet tweemaal worden uitgevoerd. Voer alleen de ontbrekende migraties uit na afzonderlijke toestemming en een bewuste keuze over de releasevolgorde.

### Back-up en herstel

De JSON-export bevat collectiegegevens, maar niet de volledige database, passkeys/sessies, instellingen, gesprekken of fotobestanden. Voor volledig herstel zijn afzonderlijke, samenhangende back-ups van **D1**, de **R2-foto's** en veilig beheerde **configuratie en geheimen** nodig. Zonder de oorspronkelijke `SESSION_SECRET` zijn daarmee versleutelde instellingen niet leesbaar. Bewaar zulke back-ups niet in de repository.

Een beschikbare herstelperiode of geslaagde export is nog geen bewezen volledige restore. Verifieer herstel apart in een geisoleerde omgeving; test nooit door productie te overschrijven. Een bereikbaar `/api/health` bevestigt niet dat deze onderdelen in orde zijn.

Stand 17 september 2026: Cloudflare-toegang werkt en beide Actions repository-secrets zijn aanwezig; hun deployrechten zijn nog niet bevestigd. De live API-versie dateert van 11 september, zonder bevestigde koppeling aan een Git-commit. De verwachte 20 tabellen, 219 kolommen en 11 expliciete indexen zijn aanwezig. D1 Time Travel levert ook een herstelpunt van de vorige dag.

Een afgeschermde lokale back-up bevat de D1-export, alle 59 R2-objecten met metadata en SHA-256, en de installatieconfiguratie. De export is hersteld in een aparte lokale SQLite-database: integriteit en relaties zijn in orde en alle 58 unieke fotoreferenties zijn aanwezig. Dit is geen volledige Cloudflare-/browserherstelproef of atomaire D1/R2-snapshot. De oorspronkelijke Worker-geheimen zijn niet opgenomen en hun veilige bewaring is nog onbevestigd; er is ook nog geen versleutelde kopie op een ander apparaat. Laat bestaande Worker-geheimen staan: vooral het vervangen van `SESSION_SECRET` maakt eerder versleutelde instellingen onleesbaar.

### Pushmeldingen inschakelen (optioneel)
Meldingen verschijnen altijd in de app (🔔). Voor échte pushmeldingen op de telefoon heeft de server eenmalig een sleutelpaar nodig:
```bash
cd api
node scripts/vapid.mjs                       # toont twee sleutels
npx wrangler secret put VAPID_PUBLIC_KEY     # plak de publieke sleutel
npx wrangler secret put VAPID_PRIVATE_KEY    # plak de privésleutel
npx wrangler secret put VAPID_SUBJECT        # bijv. mailto:tije@voorbeeld.nl
npm run deploy
```
Daarna in de app: *Instellingen → Meldingen → Pushmeldingen inschakelen* (op de iPhone werkt dit alleen als de app op het beginscherm staat en daarvandaan is geopend).

## Tests
```bash
cd api
npm ci
npm test
npm run check:worker
```
Draait 55 tests voor API-gedrag, beveiligingsregels, releaseselectie en projectintegriteit (in-memory database, geen Cloudflare nodig). De Worker-check bundelt lokaal en publiceert niets. Node 24 is vereist.

Alleen `registration.test.mjs` simuleert succesvolle WebAuthn-verificatie via Node-modulemocking om bootstrap- en uitnodigingsgedrag te controleren. `security.test.mjs` gebruikt de echte verifier en controleert onder meer dat een fake registratie wordt geweigerd. Deze tests vervangen geen passkeyproef in een echte browser/op een apparaat en bewijzen geen werkende live publicatie. Zie [SECURITY.md](SECURITY.md) voor de afbakening.

## Lokaal ontwikkelen
Gebruik voor gewone codewijzigingen eerst de bovenstaande offline controles. Daarvoor zijn geen echte geheimen, Cloudflare-login of wijzigingen aan productieconfiguratie nodig.

Interactief lokaal inloggen vereist een aparte lokale testconfiguratie: testdatabase, lokale API en website, passende CORS/CSP-instellingen en `localhost` als RP ID. Gebruik daarvoor afzonderlijke, niet-gecommitteerde configuratie en uitsluitend testgeheimen in `.dev.vars`. Wijzig niet tijdelijk de installatiebestanden die later naar productie gaan. Passkeys werken op `localhost` zonder https; het alleen starten van de API is geen volledige lokale appomgeving.

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
