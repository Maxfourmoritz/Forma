import { EXERCISE_MAP, PATHS } from './exercises';
import type { Equipment, Exercise, ExerciseLog, PathId, PathState } from './types';

export function hasEquipment(e: Exercise, available: Equipment[]): boolean {
  return e.equipment.every((q) => available.includes(q) || q === 'matte' /* Matte ist optional – Teppich/Handtuch genügt */);
}

export interface Resolved {
  exercise: Exercise;
  level: number;
  /** Stufe wurde wegen fehlendem Equipment heruntergestuft */
  limited: boolean;
}

export function resolve(path: PathId, level: number, equipment: Equipment[], filter?: (e: Exercise) => boolean): Resolved | null {
  const levels = PATHS[path].levels;
  const start = Math.min(level, levels.length - 1);
  for (let l = start; l >= 0; l--) {
    for (const id of levels[l]) {
      const e = EXERCISE_MAP[id];
      if (hasEquipment(e, equipment) && (!filter || filter(e))) return { exercise: e, level: l, limited: l < start };
    }
  }
  return null;
}

/** Nächster realistischer Schritt (mit Hinweis, falls Equipment fehlt). */
export function nextStep(path: PathId, level: number, equipment: Equipment[]): { exercise: Exercise; needs?: Equipment[] } | null {
  const levels = PATHS[path].levels;
  const current = resolve(path, level, equipment)?.exercise.id;
  for (let l = level + 1; l < levels.length; l++) {
    const ok = levels[l].map((id) => EXERCISE_MAP[id]).find((e) => hasEquipment(e, equipment) && e.id !== current);
    if (ok) return { exercise: ok };
    const first = EXERCISE_MAP[levels[l][0]];
    if (first.id !== current) return { exercise: first, needs: first.equipment.filter((q) => !equipment.includes(q)) };
  }
  return null;
}

export function stepFor(e: Exercise): number {
  return e.mode === 'reps' ? 1 : 5;
}

export function initialTarget(e: Exercise): number {
  const [a, b] = e.range;
  return Math.round(a + (b - a) * 0.25);
}

export function initialState(path: PathId, level: number): PathState {
  const e = EXERCISE_MAP[PATHS[path].levels[level][0]];
  return { level, target: initialTarget(e), sessionsAtLevel: 0, formIssues: 0, misses: 0, updated: new Date().toISOString() };
}

/** Bester Wert über alle Sätze (pro Seite das Minimum, damit beide Seiten zählen). */
export function achieved(log: ExerciseLog, e: Exercise): number | undefined {
  const vals = log.sets.map((s) => (e.mode === 'reps' ? s.reps : s.holdSec)).filter((v): v is number => v !== undefined);
  if (!vals.length) return undefined;
  if (e.unilateral) {
    const l = log.sets.filter((s) => s.side === 'L').map((s) => (e.mode === 'reps' ? s.reps : s.holdSec) ?? 0);
    const r = log.sets.filter((s) => s.side === 'R').map((s) => (e.mode === 'reps' ? s.reps : s.holdSec) ?? 0);
    if (l.length && r.length) return Math.min(Math.min(...l), Math.min(...r));
  }
  return Math.min(...vals);
}

export interface Update {
  state: PathState;
  note: string;
  change: 'hoch' | 'runter' | 'ziel+' | 'ziel-' | 'gleich';
}

const MIN_SESSIONS_BEFORE_LEVEL_UP = 3;

/**
 * Doppelte Progression, konservativ:
 *  – Ziel erreicht mit ≥2 Wdh. Reserve → Ziel +1 Wdh. / +5 s
 *  – Obergrenze erreicht + mind. 3 Einheiten auf dieser Stufe → nächste Stufe
 *  – Beschwerden → sofort eine Stufe leichter
 *  – Technik 2× unsauber oder 2× deutlich unter Mindestbereich → eine Stufe leichter
 */
export function updatePath(path: PathId, prev: PathState, log: ExerciseLog, ex: Exercise, equipment: Equipment[]): Update {
  const s: PathState = { ...prev, updated: new Date().toISOString() };
  const step = stepFor(ex);
  const [min, max] = ex.range;
  const unit = ex.mode === 'reps' ? 'Wdh' : 's';
  const rir = log.rir ?? 2;
  const val = achieved(log, ex);
  const levels = PATHS[path].levels;

  if (log.pain) {
    if (s.level > 0) {
      s.level -= 1;
      const e2 = resolve(path, s.level, equipment)?.exercise ?? ex;
      s.target = initialTarget(e2);
      s.sessionsAtLevel = 0; s.misses = 0; s.formIssues = 0;
      return { state: s, change: 'runter', note: `Beschwerden gemeldet – nächstes Mal die leichtere Variante „${e2.name}“. Schmerz ist kein Trainingsreiz.` };
    }
    s.target = min;
    return { state: s, change: 'ziel-', note: 'Beschwerden gemeldet – Ziel auf das Minimum gesetzt. Bleiben die Beschwerden, Übung pausieren und abklären lassen.' };
  }

  if (log.form === 'unsauber') {
    s.formIssues += 1;
    if (s.formIssues >= 2 && s.level > 0) {
      s.level -= 1;
      const e2 = resolve(path, s.level, equipment)?.exercise ?? ex;
      s.target = Math.round((e2.range[0] + e2.range[1]) / 2);
      s.sessionsAtLevel = 0; s.formIssues = 0; s.misses = 0;
      return { state: s, change: 'runter', note: `Technik zweimal nicht sauber – zurück zu „${e2.name}“, um die Bewegung zu festigen.` };
    }
    return { state: s, change: 'gleich', note: 'Technik vor Wiederholungen: Ziel bleibt, bis die Ausführung sauber ist.' };
  }

  if (val === undefined) return { state: s, change: 'gleich', note: 'Keine Werte erfasst.' };
  s.formIssues = 0;

  if (val >= s.target) {
    s.sessionsAtLevel += 1;
    s.misses = 0;
    if (rir <= 1) return { state: s, change: 'gleich', note: `Ziel erreicht, aber am Limit (${rir} in Reserve) – Ziel bleibt bei ${s.target} ${unit}.` };
    if (s.target + step > max) {
      if (s.sessionsAtLevel >= MIN_SESSIONS_BEFORE_LEVEL_UP && s.level < levels.length - 1) {
        const next = resolve(path, s.level + 1, equipment);
        if (next && next.exercise.id !== ex.id) {
          s.level = next.level;
          s.target = initialTarget(next.exercise);
          s.sessionsAtLevel = 0;
          return { state: s, change: 'hoch', note: `Obergrenze sicher erreicht – nächste Stufe: „${next.exercise.name}“ mit ${s.target} ${next.exercise.mode === 'reps' ? 'Wdh' : 's'}.` };
        }
        s.target = max;
        return { state: s, change: 'gleich', note: `Obergrenze erreicht. Für die nächste Stufe fehlt Equipment – Ziel bleibt bei ${max} ${unit}.` };
      }
      s.target = max;
      return { state: s, change: 'gleich', note: `Obergrenze erreicht – noch ${Math.max(1, MIN_SESSIONS_BEFORE_LEVEL_UP - s.sessionsAtLevel)} Einheit(en) festigen, dann nächste Stufe.` };
    }
    s.target += step;
    return { state: s, change: 'ziel+', note: `Sauber geschafft – nächstes Ziel ${s.target} ${unit}.` };
  }

  s.misses += 1;
  if (val < min && s.misses >= 2 && s.level > 0) {
    s.level -= 1;
    const e2 = resolve(path, s.level, equipment)?.exercise ?? ex;
    s.target = Math.round((e2.range[0] + e2.range[1]) / 2);
    s.sessionsAtLevel = 0; s.misses = 0;
    return { state: s, change: 'runter', note: `Zweimal unter ${min} ${unit} – vorübergehend „${e2.name}“, um sauber Volumen zu sammeln.` };
  }
  if (s.misses >= 2) {
    s.target = Math.max(min, s.target - step);
    s.misses = 0;
    return { state: s, change: 'ziel-', note: `Ziel zweimal verfehlt – angepasst auf ${s.target} ${unit}. Das ist normal und kein Rückschritt.` };
  }
  return { state: s, change: 'gleich', note: `Ziel knapp verfehlt – nächstes Mal erneut ${s.target} ${unit}.` };
}
