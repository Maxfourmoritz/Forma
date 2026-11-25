# FORMA – Personal Strength & Longevity Coach

Persönliche Calisthenics- und Longevity-App als installierbare Progressive Web App (PWA) – optimiert für iPhone, nutzbar auf iPad und Mac. Deutsche Oberfläche, metrische Einheiten, Daten ausschließlich lokal auf dem Gerät.

## Funktionen

- **Heute:** Täglicher Trainingsvorschlag (5–45 min, Zuhause/Hotel/Draußen, Mobility), angepasst an Tagesform, Beschwerden, Historie und Pausen – ohne Nachholzwang.
- **Training:** Geführter Player mit animierter Bewegungsdarstellung, Timern, Pausen, Tonsignalen, Varianten-Tausch, Beschwerden-Abbruch und direkter Erfassung von Wiederholungen, Haltezeiten, RIR und Technik.
- **Progression:** 11 Progressionspfade (u. a. Liegestütz, Kniebeuge, Rudern, Klimmzug, Rumpf, Balance) mit konservativer doppelter Progression und nachvollziehbaren Coaching-Hinweisen.
- **Standortbestimmung:** 8 sichere Tests ohne Maximalbelastung, automatische Ableitung der Einstiegsstufen, Re-Test alle 6 Wochen.
- **Fortschritt:** Gewicht (7-Tage-Mittel), Bauchumfang, Körperfett, Trainingsminuten, Volumen, Sätze pro Muskelgruppe, Stufenentwicklung, Bestleistungen, Balance/Beweglichkeit, Kontinuität; Zeiträume 7 T bis Gesamt. Kennzeichnung *gemessen / erfasst / subjektiv / geschätzt*.
- **Berichte:** Wochen- und Monatsbericht (regelbasiert, lokal).
- **Ernährung:** Essensfoto → Nährwertschätzung über die Claude-API (eigener API-Schlüssel), immer korrigierbar; manuelle Erfassung.
- **Daten:** Export als JSON (Backup) und CSV, Wiederherstellung mit automatischer Vorab-Sicherung, Offline-Betrieb.

## Installation auf dem iPhone

1. Die veröffentlichte Adresse (GitHub Pages) in **Safari** öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“** → Hinzufügen.
3. FORMA immer über das Home-Bildschirm-Symbol starten (eigener, dauerhafter Speicher, Vollbild, offline).
4. Regelmäßig unter *Profil › Daten, Backup & Export* ein Backup in iCloud Drive sichern.

## Entwicklung

```bash
npm install
npm run dev        # lokale Entwicklung
npm test           # Unit-Tests (Planer, Progression, Backup/Restore)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ausliefern (http://localhost:4173)
npm run e2e        # End-to-End-Test im iPhone-Viewport (benötigt laufendes preview + Playwright)
```

## Deployment

Push auf `main` → GitHub Action testet, baut und veröffentlicht auf GitHub Pages
(einmalig: *Settings › Pages › Build and deployment › Source: GitHub Actions*).

## Datensicherheit bei Updates

- Daten liegen in IndexedDB, getrennt vom App-Code; ein Update tauscht nur den Code-Cache.
- Schemaänderungen nur additiv über nummerierte Migrationen (`src/db/db.ts`); vor jeder Migration wird automatisch eine interne Sicherung angelegt.
- Neue Versionen werden erst nach Tippen auf „Aktualisieren“ aktiv.

Siehe auch [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) und [`docs/TRAININGSKONZEPT.md`](docs/TRAININGSKONZEPT.md).

> FORMA ist kein Medizinprodukt, stellt keine Diagnosen und ersetzt keine ärztliche oder physiotherapeutische Beratung.
