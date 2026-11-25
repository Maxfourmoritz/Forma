import { useEffect, useState } from 'preact/hooks';
import { onChange, type StoreName } from './db/db';
import { repo, type CoachNote } from './db/repo';
import { migrateProfile } from './domain/conditions';
import type { Activity, Assessment, CheckIn, Meal, Measurement, PathStates, Profile, Session, Settings } from './domain/types';
import type { PlanMode } from './domain/planner';
import type { Location } from './domain/types';

export interface Data {
  loaded: boolean;
  profile?: Profile;
  settings: Settings;
  states: PathStates;
  sessions: Session[];
  activities: Activity[];
  checkins: CheckIn[];
  measurements: Measurement[];
  assessments: Assessment[];
  meals: Meal[];
  coach: CoachNote[];
}

type Sub = () => void;
function createStore<T>(initial: T) {
  let v = initial;
  const subs = new Set<Sub>();
  return {
    get: () => v,
    set: (n: T | ((p: T) => T)) => {
      v = typeof n === 'function' ? (n as (p: T) => T)(v) : n;
      subs.forEach((s) => s());
    },
    sub: (s: Sub) => { subs.add(s); return () => { subs.delete(s); }; },
  };
}

export function useStore<T>(store: { get: () => T; sub: (s: Sub) => () => void }): T {
  const [, force] = useState(0);
  useEffect(() => store.sub(() => force((x) => x + 1)), [store]);
  return store.get();
}

export const data = createStore<Data>({
  loaded: false, settings: { theme: 'auto', sound: true, voice: false, backupReminderDays: 14 },
  states: {}, sessions: [], activities: [], checkins: [], measurements: [], assessments: [], meals: [], coach: [],
});

const byDateDesc = <T extends { date: string }>(xs: T[]) => xs.sort((a, b) => b.date.localeCompare(a.date));

async function loadStore(s: StoreName) {
  switch (s) {
    case 'kv': {
      let [profile, settings, states, coach] = await Promise.all([repo.profile(), repo.settings(), repo.states(), repo.coachLog()]);
      // Bestandsprofile: bisherige Gesundheitsangaben einmalig in die neue Auswahl übernehmen
      const migrated = profile ? migrateProfile(profile) : null;
      if (migrated) { profile = migrated; await repo.saveProfile(migrated); }
      data.set((d) => ({ ...d, profile, settings, states, coach }));
      applyTheme(settings.theme);
      break;
    }
    case 'sessions': { const v = byDateDesc(await repo.sessions()); data.set((d) => ({ ...d, sessions: v })); break; }
    case 'activities': { const v = byDateDesc(await repo.activities()); data.set((d) => ({ ...d, activities: v })); break; }
    case 'checkins': { const v = byDateDesc(await repo.checkins()); data.set((d) => ({ ...d, checkins: v })); break; }
    case 'measurements': { const v = byDateDesc(await repo.measurements()); data.set((d) => ({ ...d, measurements: v })); break; }
    case 'assessments': { const v = byDateDesc(await repo.assessments()); data.set((d) => ({ ...d, assessments: v })); break; }
    case 'meals': { const v = byDateDesc(await repo.meals()); data.set((d) => ({ ...d, meals: v })); break; }
  }
}

export async function loadAll() {
  await Promise.all((['kv', 'sessions', 'activities', 'checkins', 'measurements', 'assessments', 'meals'] as StoreName[]).map(loadStore));
  data.set((d) => ({ ...d, loaded: true }));
  onChange((s) => { void loadStore(s); });
}

export function applyTheme(t: Settings['theme']) {
  const el = document.documentElement;
  if (t === 'hell') el.setAttribute('data-theme', 'light');
  else if (t === 'dunkel') el.setAttribute('data-theme', 'dark');
  else el.removeAttribute('data-theme');
  const dark = t === 'dunkel' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
}

// ───────── Navigation ─────────
export type Tab = 'heute' | 'training' | 'fortschritt' | 'historie' | 'profil';
export type Screen =
  | { name: 'library' }
  | { name: 'exercise'; id: string }
  | { name: 'assessment' }
  | { name: 'preview'; mode: PlanMode; minutes: number; location: Location }
  | { name: 'session'; id: string }
  | { name: 'activity'; id?: string }
  | { name: 'measurement'; id?: string }
  | { name: 'manualSession' }
  | { name: 'meals'; date?: string }
  | { name: 'photos' }
  | { name: 'report'; days: 7 | 30 }
  | { name: 'paths' }
  | { name: 'program' }
  | { name: 'settings'; section: string };

export interface NavState {
  tab: Tab;
  stack: Screen[];
  player?: { mode: PlanMode; minutes: number; location: Location; resume?: boolean; freeIds?: string[] };
  sheet?: { name: 'checkin' } | { name: 'quickAdd' };
}

export const navStore = createStore<NavState>({ tab: 'heute', stack: [] });
export const nav = {
  tab: (t: Tab) => navStore.set((s) => ({ ...s, tab: t, stack: [] })),
  push: (sc: Screen) => navStore.set((s) => ({ ...s, stack: [...s.stack, sc] })),
  pop: () => navStore.set((s) => ({ ...s, stack: s.stack.slice(0, -1) })),
  startWorkout: (p: NavState['player']) => navStore.set((s) => ({ ...s, player: p })),
  endWorkout: () => navStore.set((s) => ({ ...s, player: undefined })),
  sheet: (sh: NavState['sheet']) => navStore.set((s) => ({ ...s, sheet: sh })),
};

// ───────── Toast ─────────
export const toastStore = createStore<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  toastStore.set(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastStore.set(null), 2800);
}

// ───────── Planoptionen (pro Tag gemerkt) ─────────
export const planPrefs = createStore<{ minutes?: number; location: Location; mode: PlanMode }>({ location: 'zuhause', mode: 'auto' });
