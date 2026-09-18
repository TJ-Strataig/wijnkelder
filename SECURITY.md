# Beveiliging van de Wijnkelder-app

Dit document beschrijft hoe de app is beveiligd en welke keuzes daarbij zijn gemaakt.

## Inloggen: alleen met passkeys
- **Geen wachtwoorden.** Inloggen gaat uitsluitend via WebAuthn/passkeys (Face ID, Touch ID, Windows Hello, Android-vergrendeling of een hardwaresleutel). De server bewaart alleen publieke sleutels; er is niets te lekken of te phishen.
- **Gebruikersverificatie verplicht** (`userVerification: required`): een passkey werkt alleen na biometrie of pincode op het apparaat.
- **Discoverable credentials** (`residentKey: required`): inloggen zonder gebruikersnaam; de browser toont de beschikbare passkeys.
- Passkeys zijn gebonden aan de **RP ID** (jullie GitHub Pages-domein). Ze werken nergens anders, ook niet op een nagemaakte site.
- Sign-count wordt bijgehouden om gekloonde authenticators te detecteren (afgehandeld door de SimpleWebAuthn-bibliotheek).

## Alleen de beheerder voegt leden toe
- De **allereerste beheerder** wordt aangemaakt met een eenmalig opstartwachtwoord (`BOOTSTRAP_SECRET`). Zodra er één gebruiker bestaat, is deze route definitief dicht.
- Nieuwe leden komen **uitsluitend via een uitnodigingslink** die een beheerder aanmaakt. De link:
  - bevat een willekeurig token van 256 bits, waarvan alleen de SHA-256-hash in de database staat;
  - is **48 uur** geldig en werkt **één keer** (atomisch afgeboekt);
  - legt naam en rol (lid/beheerder) vooraf vast — de genodigde kan die niet zelf kiezen.
- Beheerders kunnen leden uitschakelen (alle sessies worden direct beëindigd), van rol wisselen of verwijderen. Een beheerder kan zichzelf niet degraderen of uitschakelen, zodat er altijd een beheerder overblijft.

## Sessies
- Na een geslaagde passkey-login krijgt de browser een willekeurig sessietoken (256 bits). In de database staat alleen de **hash**; een databaselek levert dus geen bruikbare tokens op.
- Sessies verlopen na 30 dagen inactiviteit en na maximaal 90 dagen. Uitloggen (ook "overal uitloggen") maakt tokens direct ongeldig.
- Het token wordt als `Authorization: Bearer` meegestuurd. Omdat webapp (GitHub Pages) en API (Cloudflare Workers) op verschillende domeinen draaien, zijn cookies onbetrouwbaar (Safari blokkeert third-party cookies). Bearer-tokens zijn daarnaast **immuun voor CSRF**. Het token staat in `localStorage`; het risico daarvan (XSS) wordt beperkt door de maatregelen hieronder.

## Bescherming tegen XSS en injectie
- **Strikte Content Security Policy** in `web/index.html`: alleen eigen scripts en stijlen, geen inline scripts, geen externe bibliotheken of fonts, `object-src 'none'`, `base-uri 'none'`.
- De frontend gebruikt **nooit `innerHTML`**; alle tekst wordt via `textContent` gezet. De hulpfunctie `el()` gooit een fout als iemand het toch probeert.
- Alle invoer wordt op de server gevalideerd (lengte, type, toegestane waarden) met **geparametriseerde SQL** (geen string-concatenatie).
- Beveiligingsheaders op elk API-antwoord (`nosniff`, `frame DENY`, `no-referrer`, HSTS, `no-store`).

## API-toegang
- **CORS** is beperkt tot het exacte adres van de webapp (`ORIGIN`). Verzoeken met een andere `Origin` worden geweigerd.
- Elk endpoint (behalve inloggen/registreren en status) vereist een geldige sessie; beheer-endpoints vereisen daarnaast de rol `admin`.
- **Rate limiting** op inloggen/registreren (per IP) en op AI-functies (per gebruiker) tegen misbruik en onverwachte kosten.
- Bestandsgrootte-limieten op JSON-body's (max ~1 MB, 12 MB voor foto's) en toegestane afbeeldingstypes.

## Foto's
- Etiketfoto's staan in een **privé** R2-bucket, nooit publiek.
- Ze worden geserveerd via **ondertekende links** (HMAC-SHA256 met `SESSION_SECRET`) die na een uur verlopen. Zonder geldige handtekening is een foto niet op te vragen, ook niet als iemand de sleutel raadt.
- Foto's worden in de browser verkleind vóór upload (max 1600 px), wat privacy-vriendelijker en goedkoper is.

## AI en externe diensten
- Alleen de server praat met het AI-model en de zoek-API; sleutels komen nooit in de browser of in de repository.
- De AI-sleutel die een beheerder in de app invoert, wordt op de server **versleuteld met AES-256-GCM** (sleutel afgeleid van `SESSION_SECRET`) opgeslagen. De API geeft de sleutel nooit terug — alleen een hint (`sk-ant-…abcd`). Alleen beheerders kunnen de instellingen wijzigen; wijzigingen staan in het activiteitenlog.
- Sleutels worden op formaat gecontroleerd en het API-adres mag alleen https zijn; de "Verbinding testen"-knop is begrensd op 10 keer per 10 minuten.
- AI-uitvoer wordt behandeld als onbetrouwbare invoer: alles wordt gevalideerd en beperkt vóór het in de database komt.
- De AI ontvangt alleen wat nodig is (een etiketfoto, of een compacte lijst van jullie wijnen zonder persoonsgegevens).

## Geheimen en configuratie
- Zet geheimen **nooit** in `wrangler.toml` of in de code; gebruik `wrangler secret put`. Voor lokaal testen: `.dev.vars` (staat in `.gitignore`).
- `SESSION_SECRET` moet minimaal 32 willekeurige tekens zijn, bijv. `openssl rand -base64 48`.
- Bewaar de installatiegebonden configuratie; kopieer `api/wrangler.toml` en `web/config.js` niet uit een andere installatie. TOML wordt zonder UTF-8-BOM opgeslagen.

## Ontwikkel- en publicatiecontroles

De huidige testset gebruikt Node 24 en `npm ci` met de bestaande lockfile. De 55 tests bestrijken API-regels, releaseselectie en projectintegriteit. Succesvolle registraties worden alleen in het afzonderlijke `registration.test.mjs` gesimuleerd via een modulemock van de WebAuthn-verifier; daarbij worden challenge, origin, RP ID en vereiste gebruikersverificatie gecontroleerd. De beveiligingstests gebruiken de echte verifier en bewaken dat ongeldige registraties geen gebruiker, credential of sessie aanmaken. Productieauthenticatie is hiervoor niet aangepast.

Dit is geen nieuwe volledige beveiligingsreview of biometrische end-to-endproef. De historische reviewbeschrijvingen hieronder zijn geen bewijs van de huidige live versie. Echte apparaatregistratie, de GitHub-publicatieroute en herstel van productiegegevens vereisen afzonderlijke bevestiging.

Branches en pull requests draaien controles zonder productiesecrets, inclusief een lokale Worker-dry-run. Alleen de releaseworkflow op `main` kan publiceren: controles, zo nodig API, daarna zo nodig Pages. Een mislukte of geannuleerde vereiste API-stap blokkeert Pages. De API gebruikt de vastgelegde Wrangler en vereist `CLOUDFLARE_API_TOKEN` en `CLOUDFLARE_ACCOUNT_ID` als Actions repository-secrets; ontbrekende waarden geven een fout, geen terugval naar een andere versie of publicatieroute.

Releases worden geserialiseerd, maar zijn niet atomair. Een nieuwe API moet met de vorige webapp blijven werken. Na een mislukte of geannuleerde release publiceert de volgende release daarom beide onderdelen opnieuw. Migraties en repository-beveiliging zoals branch protection worden niet automatisch ingesteld of uitgevoerd.

## Back-ups en herstel

*Instellingen → Download JSON* is een collectie-export, **geen volledige herstelback-up**. Voor herstel zijn ook de volledige D1-database, private R2-objecten, installatieconfiguratie en veilig bewaarde Worker-geheimen nodig. De oorspronkelijke `SESSION_SECRET` is nodig voor het ontsleutelen van opgeslagen AI-instellingen. Bewaar back-ups en geheimen buiten GitHub en behandel ze als gevoelige gegevens.

Controleer bewaartermijnen en herstelmogelijkheden apart en oefen herstel uitsluitend in een geisoleerde omgeving. Op 17 september 2026 zijn Cloudflare-toegang, de aanwezigheid van beide Actions repository-secrets en de verwachte live tabel-/kolom-/indexstructuur bevestigd. Inmiddels is ook publicatie en verwijdering van een geisoleerde tijdelijke Worker met de Actions-secrets bevestigd (run `35319619418`). Dit bewijst geen volledige productierelease, D1/R2-schrijfhandelingen of Pages-publicatie. De koppeling tussen de live Worker-versie en een Git-commit is nog niet bewezen.

De D1-export en alle 59 R2-objecten zijn lokaal opgeslagen met beperkte Windows-toegangsrechten, metadata en hashes. Herstel naar een afzonderlijke lokale SQLite-database slaagt zonder integriteits- of foreign-keyfouten; alle 58 unieke fotoreferenties zijn aanwezig. Er is geen herstel op Cloudflare of volledige passkey-/browserproef uitgevoerd. D1 en R2 vormen geen gezamenlijk atomair snapshot. Een AES-256-versleuteld 7-Zip-archief met versleutelde bestandsnamen is lokaal op integriteit gecontroleerd en met gelijke SHA-256 naar persoonlijke OneDrive gekopieerd. De gebruiker bevestigt de online aanwezigheid en afzonderlijke veilige wachtwoordbewaring. Een onafhankelijke downloadcontrole is niet uitgevoerd; de lokale bronbestanden blijven onversleuteld onder beperkte Windows-toegangsrechten.

De oorspronkelijke `SESSION_SECRET` en `BOOTSTRAP_SECRET` zijn niet in deze back-up opgenomen; de gebruiker heeft geen bevestigde veilige kopie. Cloudflare toont bestaande secretwaarden niet opnieuw via de beheer-API. Vervang `SESSION_SECRET` niet om dit op te lossen: daarmee zijn eerder versleutelde AI-instellingen niet meer te ontsleutelen. Bewaar een eventueel teruggevonden oorspronkelijke waarde rechtstreeks in een wachtwoordmanager, nooit in chat of GitHub. De huidige codepublicatie hoeft bestaande Worker-geheimen niet te vervangen.

Als het oorspronkelijke geheim bij een volledige herinstallatie niet beschikbaar is, kan een beheerder een AI-aanbiedersleutel opnieuw invoeren onder een nieuw geheim in de herstelomgeving. Deze beperkte route is op 18 september lokaal beproefd op een geheugenkopie van de echte back-up, met synthetische sleutel/testsessies en zonder netwerkverkeer. Dit herstelt niet de oude versleuteling en bewijst geen echte browser-/passkeylogin of Cloudflare-restore. Zie de noodherstelprocedure in README; verander de huidige productiegeheimen niet.

## Beveiligingsreview (september 2026)
De volledige code (API, webapp, installatiescripts, workflows) is onderworpen aan een onafhankelijke beveiligingsreview plus een geautomatiseerde testset (`cd api && npm test`, 18 tests). Er zijn geen kritieke of hoge bevindingen gevonden. De volgende punten (1× medium, 4× laag) zijn gevonden en verholpen:

| # | Ernst | Bevinding | Oplossing |
|---|---|---|---|
| 1 | Medium | Een ingelogd lid kon via een zelfgekozen `label_image_key` de server een foto-link laten ondertekenen die nooit verliep (dubbelzinnige HMAC-boodschap + `exp` niet als geheel getal gecontroleerd). | Fotosleutels moeten exact het serverformaat hebben én bestaan in de opslag; HMAC-boodschap heeft nu een ondubbelzinnige structuur; `exp` en `sig` worden strikt op formaat gecontroleerd. |
| 2 | Laag | Links in de prijsbron-informatie werden ongefilterd als `href` getoond (alleen de CSP hield `javascript:` tegen). | Server slaat alleen `https:`-links op in een vaste structuur; de webapp toont alleen `https:`-links; `el()` weigert script-URL's in `href`/`src`. |
| 3 | Laag | CSV-export was gevoelig voor formule-injectie in Excel/LibreOffice. | Cellen die met `= + - @ tab CR` beginnen krijgen een `'`-prefix. |
| 4 | Laag | Deploy-workflow haalde zonder lockfile telkens nieuwe pakketversies binnen en had geen expliciete rechtenbeperking. | `npm ci` met vastgelegde `package-lock.json`; `permissions: contents: read`. |
| 5 | Laag | CSP stond `connect-src`/`img-src` naar elke https-host toe. | Beperkt tot `*.workers.dev` (jullie API) en `frame-ancestors 'none'` toegevoegd. |

Gecontroleerd en in orde bevonden: routering en autorisatie (admin/lid), volledige WebAuthn-flow (eenmalige challenges, atomische uitnodigingen, bootstrap-lockout, origin/RP-ID-controle), sessiebeheer, geparametriseerde SQL, foto-upload en -serving, XSS-oppervlak (geen `innerHTML`), CORS/CSRF, AES-GCM-versleuteling met unieke IV, geheimen (nooit gelogd of teruggegeven), AI-uitvoer als onbetrouwbare invoer, service worker, exports en rate limiting.

### Tweede review (na de 12 slimme functies en de Sommelier-chat)
Na de uitbreiding met kaart, wijnhuizen, bulkfoto's, wachtrij, duplicaatcontrole, pushmeldingen, inzichten en de Sommelier-chat is de volledige code opnieuw beoordeeld (beveiliging én codekwaliteit; testset nu 34 tests). **Er zijn geen uitbuitbare kwetsbaarheden gevonden**; alle eerdere oplossingen zijn intact. Vier verhardingspunten en vijf functionele fouten zijn opgelost:

| # | Type | Bevinding | Oplossing |
|---|---|---|---|
| 1 | Verharding | De schrijfgereedschappen van de Sommelier (toevoegen, afboeken, verlanglijst) vertrouwden op het oordeel van het model dat de gebruiker had bevestigd. Tekst die óp een gefotografeerd etiket of wijnkaart staat komt via herkenningsresultaten bij het model terecht. | Serverregel: in een bericht met foto zijn kelderwijzigingen geblokkeerd; alleen de beoordelingswachtrij is toegestaan. Bevestigen kan uitsluitend in een volgend tekstbericht van de gebruiker zelf. |
| 2 | Verharding | Geweigerde (niet-wijn) chatberichten werden met tekst in het gedeelde activiteitenlog gezet, terwijl chatgesprekken per persoon privé zijn. | Alleen het feit en de lengte worden gelogd, niet de tekst. |
| 3 | Verharding | Foto's verwijderen controleerde alleen of een wijn de foto gebruikte; foto's uit de wachtrij of uit het chatgesprek van de ander konden worden verwijderd. | Wachtrijfoto's zijn beschermd (409); chatfoto's alleen door de eigenaar (403 voor anderen). |
| 4 | Verharding | De onderwerpcontrole is heuristisch en niet waterdicht (kosten/beleidskwestie, geen beveiligingsgrens). | Geaccepteerd; de systeeminstructie bevat niets geheims en de gereedschappen kunnen alleen wijngegevens raken. |
| 5 | Fout | Onderwerpfilter weigerde legitieme wijnvragen: `rosé` werd nooit herkend (accent en woordgrens), en de veelvoorkomende woorden `weer`, `verhaal` en `code` leidden tot weigering zonder classificatie. | Regex voor rosé hersteld; die woorden verwijderd; wijnhuis/producent/domein/château/wijngaard e.d. toegevoegd; in een lopend gesprek beslist de classificatie. |
| 6 | Fout | Jaaroverzicht: de kop verdween en de jaarkeuzelijst werd bij wisselen leeggemaakt. | Kop en keuzelijst apart bijgehouden. |
| 7 | Fout | "Pushmeldingen uitschakelen op dit apparaat" schakelde ze op álle apparaten uit. | Server geeft per abonnement een vingerafdruk terug; alleen het huidige apparaat wordt afgemeld. |
| 8 | Fout | Streepjescodescanner: camera bleef aan als de dialoog werd gesloten tijdens de toestemmingsvraag. | Stream wordt direct gestopt als de dialoog al dicht is. |
| 9 | Fout | Pagina Wijnhuizen markeerde "Kelder" in de navigatie. | Routematch gecorrigeerd. |

Opnieuw gecontroleerd en in orde bevonden: router/autorisatie, WebAuthn-flow, SQL (alle waarden geparametriseerd, dynamische kolomnamen uit vaste lijsten), fotosleutels en ondertekende links, interne aanroepen vanuit de Sommelier (altijd met de al geauthenticeerde gebruiker, nooit via de router), AI-uitvoer als onbetrouwbare invoer, Web Push-cryptografie (RFC 8291/8188) en VAPID, SSRF-oppervlak, IDOR-scoping, exports (geen instellingen/sessies/chat/push), frontend (geen `innerHTML`, CSP zonder `unsafe-*`), supply chain (vaste actieversies, `npm ci`), installatiescripts.

**Restrisico dat je zelf kunt verkleinen:** het sessietoken staat in `localStorage` op `<naam>.github.io`. Die oorsprong deel je met al je andere GitHub Pages-projecten onder hetzelfde account. Publiceer daarom geen andere (onbetrouwbare) sites onder dit GitHub-account, of gebruik een eigen domein voor de wijnkelder.

## De Sommelier-chat
- Alleen ingelogde huishoudleden; elk gesprek is per gebruiker en wordt in jullie eigen database bewaard (wissen kan altijd).
- **Alleen wijn**: (1) onderwerpcontrole vóór elk antwoord — duidelijke andere onderwerpen, andere dranken en manipulatiepogingen ("negeer je instructies", "doe alsof") worden geweigerd zonder het model te raadplegen; twijfelgevallen krijgen een aparte, goedkope classificatie; (2) strikte systeeminstructie; (3) de gereedschappen kunnen uitsluitend wijngegevens lezen/schrijven; (4) in een bericht met foto zijn kelderwijzigingen serverzijdig geblokkeerd (alleen de wachtrij), zodat tekst op een etiket of wijnkaart nooit een kelderactie kan uitlokken. Inhoud van foto's en geplakte teksten wordt als data behandeld, niet als opdracht.
- Schrijfacties lopen via dezelfde API-functies als de app (validatie, duplicaatcontrole, goedkeuringsregel: een herkend etiket gaat naar de wachtrij en komt pas in de kelder na expliciete bevestiging). Alles staat in het activiteitenlog, inclusief geweigerde vragen.
- Begrensd op 120 berichten per uur per persoon en maximaal 6 gereedschapsrondes per bericht.

## Wat de app bewust NIET doet
- Geen wachtwoorden, geen e-mail-links, geen "wachtwoord vergeten".
- Geen openbare registratie.
- Geen trackers, analytics of externe scripts.

## Extra aanscherping (optioneel)
- Zet in `web/index.html` bij `connect-src` en `img-src` alleen het adres van jullie Worker in plaats van `https:`.
- Koppel de Worker aan een eigen (sub)domein; dan kun je desgewenst overstappen op `HttpOnly`-cookies.
- Schakel in Cloudflare **WAF/Bot Fight Mode** in en overweeg Cloudflare Access als extra laag vóór de API.
- Maak periodiek een collectie-export via *Instellingen → Download JSON* en richt daarnaast de volledige back-up- en herstelprocedure hierboven in.
