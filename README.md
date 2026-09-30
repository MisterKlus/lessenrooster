# Lessenrooster

Lessenroosters PXL, academiejaar 2026–2027.

- Mijn rooster (Graduaat Programmeren): https://misterklus.github.io/lessenrooster/
- Voor mijn ouders: https://misterklus.github.io/lessenrooster/ouders.html
- Thomas (Elektromechanica): https://misterklus.github.io/lessenrooster/thomas/

Op je gsm: open de link en kies **Zet op beginscherm** (iPhone, Safari) of **App installeren** (Android, Chrome). Het rooster werkt daarna ook zonder internet.

## Automatisch bijwerken vanuit TimeEdit

Elke nacht haalt de GitHub-actie `.github/workflows/publiceren.yml` de roosters op uit TimeEdit, bouwt de site opnieuw en zet ze online. De TimeEdit-abonnementslinks staan als geheimen in de repository-instellingen (Settings → Secrets and variables → Actions), niet in de code: `TIMEEDIT_URL` voor Tymo, `TIMEEDIT_URL_THOMAS` voor Thomas.

- `src/timeedit-config.json`: Tymo's vakken, kleuren en welke lessen weggelaten worden (bv. het C#-monitoraat), plus de academische kalender en het weer voor iedereen.
- `src/rooster-data.json`: alle bekende lessen van Tymo. Lessen van vóór de TimeEdit-periode blijven bewaard.
- `src/thomas/`: hetzelfde voor Thomas.

Past niet alles in één TimeEdit-selectie, zet dan meerdere links in het geheim (één per regel): ze worden samengevoegd en lessen die in meer links staan tellen maar één keer. Tymo gebruikt zo twee links (de ene met IT-organisation, de andere met Data Expert).

Zelf starten: Actions → "Rooster bijwerken en publiceren" → Run workflow.

## Iemand toevoegen

1. Voeg de persoon toe aan `PEOPLE` in `src/build.js` (id, voornaam, opleiding, uitleg).
2. Maak `src/<id>/timeedit-config.json` (vakken met code, korte naam, kleur) en `src/<id>/rooster-data.json` met `{"updated":null,"extraSubjects":[],"changes":[],"lessons":[]}`.
3. Zet de TimeEdit-link als geheim `TIMEEDIT_URL_<ID>` en voeg die toe aan de workflow.

Het rooster komt dan op `https://misterklus.github.io/lessenrooster/<id>/`, met eigen instellingen, widget en app-icoon.

## Aanpassen

De pagina staat in `src/rooster.src.html`. Lokaal bouwen:

```
node src/build.js
```

Dat maakt voor iedereen `index.html`, het manifest, `sw.js`, `rooster.json` en `widget.js`, en voor Tymo ook `ouders.html` en de losse bestanden in `bestanden/`. Met een lokale `timeedit-url.txt` in `src/` of `src/<id>/` (wordt genegeerd door Git) wordt ook TimeEdit opgehaald. Nieuwe iconen maken uit `src/icon-source.webp`: `node src/build.js --icons` (Windows). Daarvoor zijn Node.js en Google Chrome nodig.
