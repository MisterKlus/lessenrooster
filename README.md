# Lessenrooster

Lessenrooster PXL Graduaat Programmeren, 21 september – 26 oktober 2026.

- Mijn rooster: https://misterklus.github.io/lessenrooster/
- Voor mijn ouders: https://misterklus.github.io/lessenrooster/ouders.html

Op je gsm: open de link en kies **Zet op beginscherm** (iPhone, Safari) of **App installeren** (Android, Chrome). Het rooster werkt daarna ook zonder internet.

## Automatisch bijwerken vanuit TimeEdit

Elke nacht haalt de GitHub-actie `.github/workflows/publiceren.yml` het rooster op uit TimeEdit, bouwt de site opnieuw en zet ze online. De TimeEdit-abonnementslink staat als geheim `TIMEEDIT_URL` in de repository-instellingen (Settings → Secrets and variables → Actions), niet in de code.

- `src/timeedit-config.json`: vakken, kleuren en welke lessen weggelaten worden (bv. het C#-monitoraat).
- `src/rooster-data.json`: alle bekende lessen. Lessen van vóór de TimeEdit-periode blijven bewaard.

Zelf starten: Actions → "Rooster bijwerken en publiceren" → Run workflow.

## Aanpassen

De pagina staat in `src/rooster.src.html`. Lokaal bouwen:

```
node src/build.js
```

Dat maakt `index.html`, `ouders.html`, de manifests, `sw.js` en de losse bestanden in `bestanden/`. Met een lokale `src/timeedit-url.txt` (wordt genegeerd door Git) wordt ook TimeEdit opgehaald. Nieuwe iconen maken uit `src/icon-source.webp`: `node src/build.js --icons` (Windows). Daarvoor zijn Node.js en Google Chrome nodig.
