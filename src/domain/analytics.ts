import { EXERCISE_MAP, PATHS } from './exercises';
import { achieved } from './progression';
import type { Activity, Assessment, Measurement, Muscle, PathId, Session } from './types';
import { addDays, dayKey, daysBetween, sum, weekStart } from './util';

export type Range = '7' | '30' | '90' | '180' | '365' | 'all';
export const RANGE_LABEL: Record<Range, string> = { '7': '7 T', '30': '30 T', '90': '90 T', '180': '6 M', '365': '12 M', all: 'Gesamt' };

export function rangeStart(r: Range, first?: string, today = new Date()): Date {
  if (r === 'all') return first ? new Date(first) : addDays(today, -365);
  return addDays(today, -Number(r) + 1);
}

export function inRange<T extends { date: string }>(xs: T[], start: Date): T[] {
  const k = dayKey(start);
  return xs.filter((x) => dayKey(x.date) >= k);
}

export interface Point { date: string; value: number }

export function series(ms: Measurement[], key: 'weightKg' | 'waistCm' | 'bodyFatPct' | 'restingHR'): Point[] {
  return ms.filter((m) => m[key] !== undefined).map((m) => ({ date: m.date, value: m[key]! })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Gleitender 7-Tage-Mittelwert (zeitbasiert) – glättet Wasserschwankungen beim Gewicht. */
export function movingAvg(pts: Point[], days = 7): Point[] {
  return pts.map((p) => {
    const win = pts.filter((q) => daysBetween(q.date, p.date) >= 0 && daysBetween(q.date, p.date) < days);
    return { date: p.date, value: sum(win.map((w) => w.value)) / win.length };
  });
}

export function trend(pts: Point[], days: number, today = new Date()): number | undefined {
  if (pts.length < 2) return undefined;
  const ma = movingAvg(pts);
  const last = ma[ma.length - 1];
  const cutoff = dayKey(addDays(today, -days));
  const past = [...ma].reverse().find((p) => dayKey(p.date) <= cutoff) ?? ma[0];
  if (past === last) return undefined;
  return last.value - past.value;
}

export interface WeekBucket { start: Date; label: string; strength: number; mobility: number; cardio: number; other: number; sessions: number; sets: number; reps: number; holdSec: number }

export function weekly(sessions: Session[], activities: Activity[], start: Date, today = new Date()): WeekBucket[] {
  const out: WeekBucket[] = [];
  for (let w = weekStart(start); w <= today; w = addDays(w, 7)) {
    const end = addDays(w, 7);
    const inW = <T extends { date: string }>(x: T) => new Date(x.date) >= w && new Date(x.date) < end;
    const ss = sessions.filter(inW);
    const as = activities.filter(inW);
    const strength = sum(ss.filter((s) => s.kind.startsWith('kraft') || s.kind === 'minimum' || s.kind === 'frei').map((s) => s.durationSec / 60));
    const mobility = sum(ss.filter((s) => s.kind === 'mobility' || s.kind === 'balance').map((s) => s.durationSec / 60));
    const cardio = sum(as.filter((a) => a.type !== 'yoga' && a.type !== 'sonstiges').map((a) => a.durationMin));
    const other = sum(as.filter((a) => a.type === 'yoga' || a.type === 'sonstiges').map((a) => a.durationMin));
    let sets = 0, reps = 0, holdSec = 0;
    for (const s of ss) for (const ex of s.exercises) for (const st of ex.sets) { sets++; reps += st.reps ?? 0; holdSec += st.holdSec ?? 0; }
    out.push({ start: w, label: w.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }), strength, mobility, cardio, other, sessions: ss.length + as.length, sets, reps, holdSec });
  }
  return out;
}

/** Arbeitssätze pro Muskelgruppe (primär = 1, sekundär = 0,5), ohne Aufwärmen/Mobilität. */
export function setsPerMuscle(sessions: Session[]): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const s of sessions)
    for (const ex of s.exercises) {
      const e = EXERCISE_MAP[ex.exerciseId];
      if (!e || e.pattern === 'mobility' || e.pattern === 'warmup' || ex.skipped) continue;
      const n = e.unilateral ? ex.sets.length / 2 : ex.sets.length;
      for (const m of e.muscles.primary) out[m] = (out[m] ?? 0) + n;
      for (const m of e.muscles.secondary) out[m] = (out[m] ?? 0) + n * 0.5;
    }
  return out;
}

export interface PathPoint { date: string; level: number; value: number; exerciseId: string }

export function pathHistory(sessions: Session[], path: PathId): PathPoint[] {
  const pts: PathPoint[] = [];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date)))
    for (const ex of s.exercises) {
      if (ex.path !== path || ex.skipped) continue;
      const e = EXERCISE_MAP[ex.exerciseId];
      const v = achieved(ex, e);
      if (v !== undefined) pts.push({ date: s.date, level: ex.level ?? 0, value: v, exerciseId: e.id });
    }
  return pts;
}

/** Fortschrittswert über Stufen hinweg: Stufe + Anteil im Wiederholungsbereich (nur zur Visualisierung der Reihenfolge, keine physikalische Größe). */
export function pathProgressValue(p: PathPoint): number {
  const e = EXERCISE_MAP[p.exerciseId];
  const [a, b] = e.range;
  return p.level + Math.min(1, Math.max(0, (p.value - a) / Math.max(1, b - a)));
}

export interface Record_ { exerciseId: string; value: number; date: string; unit: string }

export function personalRecords(sessions: Session[]): Record_[] {
  const best = new Map<string, Record_>();
  for (const s of sessions)
    for (const ex of s.exercises) {
      const e = EXERCISE_MAP[ex.exerciseId];
      if (!e || e.pattern === 'warmup' || e.pattern === 'mobility' || ex.skipped) continue;
      for (const st of ex.sets) {
        const v = e.mode === 'reps' ? st.reps : st.holdSec;
        if (v === undefined) continue;
        const cur = best.get(e.id);
        if (!cur || v > cur.value) best.set(e.id, { exerciseId: e.id, value: v, date: s.date, unit: e.mode === 'reps' ? 'Wdh.' : 's' });
      }
    }
  // Sortierung: schwierigste Übungen zuerst
  return [...best.values()].sort((a, b) => EXERCISE_MAP[b.exerciseId].difficulty - EXERCISE_MAP[a.exerciseId].difficulty || b.value - a.value);
}

/** Aktive Tage (Training oder Aktivität) */
export function activeDays(sessions: Session[], activities: Activity[]): Set<string> {
  return new Set([...sessions.map((s) => dayKey(s.date)), ...activities.map((a) => dayKey(a.date))]);
}

/** Wochen in Folge mit mindestens n aktiven Tagen (aktuelle Woche zählt, wenn bereits erfüllt). */
export function weeksStreak(days: Set<string>, n: number, today = new Date()): number {
  let streak = 0;
  let w = weekStart(today);
  const count = (start: Date) => { let c = 0; for (let i = 0; i < 7; i++) if (days.has(dayKey(addDays(start, i)))) c++; return c; };
  if (count(w) >= n) streak++;
  w = addDays(w, -7);
  while (count(w) >= n) { streak++; w = addDays(w, -7); }
  return streak;
}

export function assessmentSeries(as: Assessment[], pick: (a: Assessment) => number | undefined): Point[] {
  return as.map((a) => ({ date: a.date, value: pick(a) })).filter((p): p is Point => p.value !== undefined).sort((a, b) => a.date.localeCompare(b.date));
}

export function pathName(p: PathId) {
  return PATHS[p].name;
}
