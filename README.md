# Bandydos

En enkel app for treninger med tre lag på isen. Den har to deler:

1. **Timer** – sett rundetid og pause, så veksler appen automatisk mellom dem.
   Den spiller ett signal _to ganger_ når runden er slutt og et annet signal
   _én gang_ når pausen er slutt. Vibrerer i tillegg på telefoner som støtter
   det.
2. **Lag-trekkeren** – marker hvem som er på trening og hvilken farge de
   allerede har på (hvit, blå, rød, gul). Appen lager tre så jevne lag som
   mulig basert på en intern ferdighetsvurdering, og prøver å la spillerne
   beholde fargen de allerede har på.

Ferdighetsnivåene ligger kun i kildekoden (`src/roster.ts`) og vises aldri i
grensesnittet.

## Kjøre lokalt

```bash
npm install
npm run dev
```

Vite åpner serveren på `http://localhost:5180/` (eller første ledige port). Den
lytter også på lokalt nettverk, så telefonen din kan koble seg til samme Wi-Fi
og åpne IP-adressen som vises i terminalen.

## Bygge for produksjon

```bash
npm run build
npm run preview
```

`dist/`-mappa kan slippes på en hvilken som helst statisk webhost (GitHub
Pages, Netlify, Vercel, Cloudflare Pages osv.).

## Installer som "app" på telefonen

Bandydos er en PWA, så du kan legge den til på hjem-skjermen for en
fullskjerm-følelse uten nettleser-chrome:

- **iPhone (Safari):** Åpne URL-en, trykk på del-knappen, velg
  _Legg til på Hjem-skjerm_.
- **Android (Chrome):** Åpne URL-en, trykk på meny-knappen (3 prikker), velg
  _Legg til på startskjermen_ eller _Installer app_.

Trykk **Start timer** én gang før første runde – det låser opp lyd på iOS.

## Tips på isen

- Telefonen forsøker å holde skjermen våken mens timeren går (Wake Lock API
  der det støttes).
- Innstillinger (rundetid, pause, oppmøte og draktfarge) lagres lokalt i
  nettleseren.
- Telefoner med vibrasjon (Android, ikke iOS) vibrerer som ekstra varsling
  ved start av runde og ved slutten av pause/runde.

## Generere ikoner

Hvis logoen byttes ut, kan PWA-ikonene regenereres:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
```
