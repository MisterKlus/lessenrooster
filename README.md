# Lessenrooster

Lessenrooster PXL Graduaat Programmeren, 21 september – 26 oktober 2026.

- Mijn rooster: https://misterklus.github.io/lessenrooster/
- Voor mijn ouders: https://misterklus.github.io/lessenrooster/ouders.html

Op je gsm: open de link en kies **Zet op beginscherm** (iPhone, Safari) of **App installeren** (Android, Chrome). Het rooster werkt daarna ook zonder internet.

## Aanpassen

De bron staat in `src/rooster.src.html` (de lessen staan in `base` en `weeks`). Na een wijziging:

```
node src/build.js
```

Dat maakt `index.html`, `ouders.html`, de iconen, de manifests, `sw.js` en de losse bestanden in `bestanden/`. Daarvoor zijn Node.js en Google Chrome nodig.
