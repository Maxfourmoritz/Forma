# Architektur & Datenmodell

## Entscheidung: PWA zuerst, native App als zweiter Schritt

| | PWA (umgesetzt) | Native iOS-App (Ausblick) |
|---|---|---|
| Installation | Safari → Home-Bildschirm | Xcode + Apple-Developer-Konto |
| Offline, lokale Daten | ja (Service Worker, IndexedDB) | ja (SwiftData/Core Data) |
| HealthKit, Apple Watch, iCloud-Sync | **nein** | ja |
| Updates | sofort über GitHub Pages | TestFlight/App Store bzw. Xcode |

Die Fachlogik (`src/domain`) ist frei von UI- und Speichercode und kann in eine Capacitor-Hülle übernommen oder nach Swift portiert werden. Bestehende Daten lassen sich über das JSON-Backup migrieren.

## Schichten

```
src/
  domain/        reine Logik, ohne Browser-Abhängigkeiten (außer foodAI/nutrition-Bildfunktionen)
    exercises.ts   Übungsbibliothek (Kategorien, Gelenkbelastung, Sicherheit) + Progressionspfade
    poses.ts       parametrische 2D-Bewegungsanimationen (Inverse Kinematik)
    program.ts     Periodisierung (12 Wochen + 6-Wochen-Blöcke)
    planner.ts     Tagesplan: Einheitstyp, Umfang, Zeitbudget, Ablaufschritte
    progression.ts doppelte Progression, Equipment-Auflösung
    safety.ts      Warnsymptome, Schmerzregeln, Übungsfreigaben
    assessment.ts  Tests → Einstiegsstufen
    analytics.ts / reports.ts  Auswertungen und Berichte
    nutrition.ts / foodAI.ts   Bedarfsschätzung, Claude-API-Fotoanalyse (lazy geladen)
  db/            IndexedDB (versionierte Migrationen), Repository, Backup/CSV
  screens/, ui/  Preact-Oberfläche
  sw-template.js Service Worker (App-Shell-Cache)
```

## Datenmodell (IndexedDB `forma`)

| Store | Schlüssel | Inhalt |
|---|---|---|
| `kv` | Name | `profile`, `settings`, `pathStates` (Stufe/Ziel je Pfad), `coachLog` |
| `sessions` | `id` | Einheit: Datum, Dauer, Art, Ort, Übungen → Sätze (Ziel, Wdh./Sekunden, Seite), RIR, Technik, Beschwerden, RPE, Energie, Notiz, Anpassungen |
| `activities` | `id` | Laufen, Rad, Peloton, Yoga … (Dauer, Distanz, Puls, RPE) |
| `checkins` | Datum | Schlafqualität/-dauer, Energie, Muskelkater, Stress, Schmerzen je Region, Warnsymptome, Ruhepuls, HRV |
| `measurements` | `id` | Gewicht, Bauchumfang, Körperfett + Methode, Ruhepuls |
| `assessments` | `id` | Testergebnisse, abgeleitete Stufen, Hinweise, Mobilitätsschwerpunkte |
| `meals` | `id` | Foto (Blob), Lebensmittel mit kcal/Eiweiß/KH/Fett, Quelle (KI/manuell), Sicherheit |
| `photos` | `id` | Fortschrittsfotos (Blob) |
| `snapshots` | `id` | automatische Sicherungen vor Migration/Wiederherstellung |
| `secrets` | Name | API-Schlüssel (nie im Backup) |

## Tests

- `tests/planner.test.ts` – Planlogik, Zeitbudgets 5–45 min, Erholung, Wiedereinstieg, Sicherheitsregeln, Equipment.
- `tests/progression.test.ts` – Progression/Regression, Equipment-Grenzen, Assessment-Ableitung.
- `tests/backup.test.ts` – Speicherung, Backup, Wiederherstellung, CSV, Schlüssel-Ausschluss.
- `e2e/smoke.mjs` – kompletter Nutzerfluss im iPhone-Viewport inkl. Reload und Offline-Start.
- `e2e/update.mjs` – App-Update mit Datenerhalt, Ernährungserfassung.
