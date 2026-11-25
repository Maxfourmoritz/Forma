import { BACKUP_STORES, DB_VERSION, getAll, kvEntries, put, replaceAll, type StoreName } from './db';
import { EXERCISE_MAP } from '../domain/exercises';
import type { Activity, Meal, Measurement, Session } from '../domain/types';
import { blobToBase64 } from '../domain/nutrition';

export const BACKUP_FORMAT = 'forma-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  schema: number;
  exportedAt: string;
  includesPhotos: boolean;
  data: Partial<Record<StoreName, unknown[]>>;
}

interface EncodedBlob { __blob: true; type: string; b64: string }

async function encode(v: unknown): Promise<unknown> {
  if (v instanceof Blob) return { __blob: true, type: v.type, b64: await blobToBase64(v) } satisfies EncodedBlob;
  if (Array.isArray(v)) return Promise.all(v.map(encode));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = await encode(x);
    return out;
  }
  return v;
}

function decode(v: unknown): unknown {
  if (v && typeof v === 'object' && (v as EncodedBlob).__blob) {
    const e = v as EncodedBlob;
    const bin = atob(e.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: e.type });
  }
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = decode(x);
    return out;
  }
  return v;
}

export async function createBackup(includePhotos: boolean): Promise<BackupFile> {
  const data: BackupFile['data'] = {};
  for (const s of BACKUP_STORES) {
    if (s === 'kv') data.kv = await kvEntries();
    else if (s === 'photos') data.photos = includePhotos ? ((await encode(await getAll('photos'))) as unknown[]) : [];
    else if (s === 'meals') {
      const meals = await getAll<Meal>('meals');
      data.meals = includePhotos ? ((await encode(meals)) as unknown[]) : meals.map(({ photo: _p, ...m }) => m);
    } else data[s] = await getAll(s);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schema: DB_VERSION, exportedAt: new Date().toISOString(), includesPhotos: includePhotos, data };
}

export function validateBackup(x: unknown): { ok: true; file: BackupFile } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'Keine gültige Datei.' };
  const f = x as BackupFile;
  if (f.format !== BACKUP_FORMAT) return { ok: false, error: 'Diese Datei ist kein FORMA-Backup.' };
  if (typeof f.version !== 'number' || f.version > BACKUP_VERSION) return { ok: false, error: 'Backup stammt aus einer neueren App-Version. Bitte FORMA aktualisieren.' };
  if (!f.data || typeof f.data !== 'object') return { ok: false, error: 'Backup enthält keine Daten.' };
  for (const [k, v] of Object.entries(f.data)) {
    if (!BACKUP_STORES.includes(k as StoreName)) return { ok: false, error: `Unbekannter Bereich „${k}“.` };
    if (!Array.isArray(v)) return { ok: false, error: `Bereich „${k}“ ist beschädigt.` };
    if (k !== 'kv' && v.some((it) => !it || typeof it !== 'object' || (!('id' in it) && !('date' in it)))) return { ok: false, error: `Einträge in „${k}“ sind beschädigt.` };
  }
  const sessions = (f.data.sessions ?? []) as Session[];
  if (sessions.some((s) => !Array.isArray(s.exercises))) return { ok: false, error: 'Trainingseinheiten sind beschädigt.' };
  return { ok: true, file: f };
}

/**
 * Stellt ein Backup wieder her. Vorher wird der aktuelle Stand als Snapshot gesichert,
 * die Wiederherstellung selbst läuft in einer einzigen Transaktion (alles oder nichts).
 */
export async function restoreBackup(file: BackupFile): Promise<{ counts: Record<string, number> }> {
  const current = await createBackup(false);
  await put('snapshots', { id: `restore-${Date.now()}`, date: new Date().toISOString(), reason: 'Automatische Sicherung vor Wiederherstellung', data: current.data });
  const data: Partial<Record<StoreName, unknown[]>> = {};
  for (const [k, v] of Object.entries(file.data)) data[k as StoreName] = decode(v) as unknown[];
  // Bereiche, die im Backup fehlen, bleiben unverändert (z. B. Fotos bei Backups ohne Fotos)
  if (!file.includesPhotos) delete data.photos;
  await replaceAll(data);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) counts[k] = v?.length ?? 0;
  return { counts };
}

export async function listSnapshots() {
  return (await getAll<{ id: string; date: string; reason: string; data: BackupFile['data'] }>('snapshots')).sort((a, b) => b.date.localeCompare(a.date));
}

// ───────────── CSV ─────────────

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}

export function sessionsCSV(sessions: Session[]): string {
  const rows: unknown[][] = [];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date)))
    for (const ex of s.exercises)
      ex.sets.forEach((st, i) => rows.push([
        s.date.slice(0, 10), s.date.slice(11, 16), s.title, Math.round(s.durationSec / 60), EXERCISE_MAP[ex.exerciseId]?.name ?? ex.exerciseId, ex.path ?? '', ex.level ?? '',
        i + 1, st.side ?? '', st.target, st.reps ?? '', st.holdSec ?? '', ex.rir ?? '', ex.form ?? '', ex.pain ? 'ja' : '', s.rpe ?? '', s.note ?? '',
      ]));
  return toCSV(['Datum', 'Uhrzeit', 'Einheit', 'Dauer_min', 'Übung', 'Pfad', 'Stufe', 'Satz', 'Seite', 'Ziel', 'Wdh', 'Halten_s', 'RIR', 'Technik', 'Beschwerden', 'Session_RPE', 'Notiz'], rows);
}
export function activitiesCSV(a: Activity[]): string {
  return toCSV(['Datum', 'Art', 'Dauer_min', 'Distanz_km', 'Puls_Ø', 'RPE', 'Notiz'], a.map((x) => [x.date.slice(0, 10), x.type, x.durationMin, x.distanceKm, x.avgHR, x.rpe, x.note]));
}
export function measurementsCSV(m: Measurement[]): string {
  return toCSV(['Datum', 'Gewicht_kg', 'Bauchumfang_cm', 'Körperfett_%', 'Methode', 'Ruhepuls', 'Notiz'], m.map((x) => [x.date.slice(0, 10), x.weightKg, x.waistCm, x.bodyFatPct, x.bodyFatMethod, x.restingHR, x.note]));
}
export function mealsCSV(m: Meal[]): string {
  const rows: unknown[][] = [];
  for (const meal of m) for (const it of meal.items) rows.push([meal.date.slice(0, 10), meal.date.slice(11, 16), meal.label, it.name, it.grams, it.kcal, it.protein, it.carbs, it.fat, meal.source, meal.confidence]);
  return toCSV(['Datum', 'Uhrzeit', 'Mahlzeit', 'Lebensmittel', 'Gramm', 'kcal', 'Eiweiß_g', 'KH_g', 'Fett_g', 'Quelle', 'Sicherheit'], rows);
}

/** Datei zum Speichern anbieten – auf dem iPhone über das Teilen-Menü (Dateien/iCloud Drive). */
export async function offerFile(name: string, content: string | Blob, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const file = new File([blob], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
