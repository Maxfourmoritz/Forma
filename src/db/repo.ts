import { del, get, getAll, kvGet, kvSet, put } from './db';
import { updatePath } from '../domain/progression';
import { EXERCISE_MAP } from '../domain/exercises';
import type { Activity, Assessment, CheckIn, Equipment, Meal, Measurement, PathStates, Profile, ProgressPhoto, Session, Settings } from '../domain/types';

export const DEFAULT_SETTINGS: Settings = { theme: 'auto', sound: true, voice: false, backupReminderDays: 14 };

export const repo = {
  profile: () => kvGet<Profile>('profile'),
  saveProfile: (p: Profile) => kvSet('profile', p),
  settings: async () => ({ ...DEFAULT_SETTINGS, ...((await kvGet<Settings>('settings')) ?? {}) }),
  saveSettings: (s: Settings) => kvSet('settings', s),
  states: async () => (await kvGet<PathStates>('pathStates')) ?? {},
  saveStates: (s: PathStates) => kvSet('pathStates', s),
  coachLog: async () => (await kvGet<CoachNote[]>('coachLog')) ?? [],
  addCoachNotes: async (notes: CoachNote[]) => {
    const prev = (await kvGet<CoachNote[]>('coachLog')) ?? [];
    await kvSet('coachLog', [...notes, ...prev].slice(0, 200));
  },

  sessions: () => getAll<Session>('sessions'),
  saveSession: (s: Session) => put('sessions', s),
  deleteSession: (id: string) => del('sessions', id),
  activities: () => getAll<Activity>('activities'),
  saveActivity: (a: Activity) => put('activities', a),
  deleteActivity: (id: string) => del('activities', id),
  checkins: () => getAll<CheckIn>('checkins'),
  checkin: (date: string) => get<CheckIn>('checkins', date),
  saveCheckin: (c: CheckIn) => put('checkins', c),
  measurements: () => getAll<Measurement>('measurements'),
  saveMeasurement: (m: Measurement) => put('measurements', m),
  deleteMeasurement: (id: string) => del('measurements', id),
  assessments: () => getAll<Assessment>('assessments'),
  saveAssessment: (a: Assessment) => put('assessments', a),
  photos: () => getAll<ProgressPhoto>('photos'),
  savePhoto: (p: ProgressPhoto) => put('photos', p),
  deletePhoto: (id: string) => del('photos', id),
  meals: () => getAll<Meal>('meals'),
  saveMeal: (m: Meal) => put('meals', m),
  deleteMeal: (id: string) => del('meals', id),

  apiKey: () => get<string>('secrets', 'anthropicKey'),
  saveApiKey: (k: string) => (k ? put('secrets', k, 'anthropicKey') : del('secrets', 'anthropicKey')),
};

export interface CoachNote {
  date: string;
  path?: string;
  exerciseId?: string;
  change: string;
  text: string;
}

/**
 * Speichert eine abgeschlossene Einheit und entwickelt die Progression weiter.
 * Gibt die Coaching-Hinweise zurück (für die Zusammenfassung).
 */
export async function finishSession(session: Session, equipment: Equipment[]): Promise<CoachNote[]> {
  await repo.saveSession(session);
  const states = await repo.states();
  const notes: CoachNote[] = [];
  for (const log of session.exercises) {
    if (!log.path || log.skipped) continue;
    const ex = EXERCISE_MAP[log.exerciseId];
    const prev = states[log.path];
    if (!prev) continue;
    // Nur werten, wenn die Übung der aktuellen Stufe entspricht (sonst z. B. Tausch/Variante)
    if (log.level !== undefined && log.level !== prev.level && !log.pain) {
      const why = log.swappedFrom ? 'Variante gewechselt' : 'Equipment oder Beschwerden';
      notes.push({ date: session.date, path: log.path, exerciseId: ex.id, change: 'gleich', text: `${ex.name}: andere Stufe als geplant (${why}) – Progression bleibt unverändert.` });
      continue;
    }
    const u = updatePath(log.path, prev, log, ex, equipment);
    states[log.path] = { ...u.state, lastNote: u.note };
    notes.push({ date: session.date, path: log.path, exerciseId: ex.id, change: u.change, text: `${ex.name}: ${u.note}` });
  }
  await repo.saveStates(states);
  await repo.addCoachNotes(notes);
  return notes;
}
