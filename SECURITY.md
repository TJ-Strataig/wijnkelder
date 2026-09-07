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

## Wat de app bewust NIET doet
- Geen wachtwoorden, geen e-mail-links, geen "wachtwoord vergeten".
- Geen openbare registratie.
- Geen trackers, analytics of externe scripts.

## Extra aanscherping (optioneel)
- Zet in `web/index.html` bij `connect-src` en `img-src` alleen het adres van jullie Worker in plaats van `https:`.
- Koppel de Worker aan een eigen (sub)domein; dan kun je desgewenst overstappen op `HttpOnly`-cookies.
- Schakel in Cloudflare **WAF/Bot Fight Mode** in en overweeg Cloudflare Access als extra laag vóór de API.
- Maak periodiek een back-up via *Instellingen → Download JSON*.
