export type ID = string;

export type Muscle =
  | 'brust'
  | 'schultern'
  | 'trizeps'
  | 'bizeps'
  | 'oberer_ruecken'
  | 'latissimus'
  | 'unterer_ruecken'
  | 'bauch'
  | 'seitlicher_rumpf'
  | 'gesaess'
  | 'quadrizeps'
  | 'beinbeuger'
  | 'waden'
  | 'hueftbeuger'
  | 'adduktoren'
  | 'fuss_sprunggelenk';

export type Pattern =
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v'
  | 'squat'
  | 'hinge'
  | 'anti_ext'
  | 'lateral'
  | 'extension'
  | 'balance'
  | 'calf'
  | 'mobility'
  | 'warmup';

export type Goal = 'kraft' | 'muskelaufbau' | 'rumpf' | 'haltung' | 'beweglichkeit' | 'balance' | 'erholung' | 'aufwaermen';

export type Equipment = 'matte' | 'wand' | 'stuhl' | 'tisch' | 'tuer' | 'handtuch' | 'band' | 'stange' | 'ringe' | 'bank' | 'stufe';

export type Joint = 'knie' | 'schulter' | 'handgelenk' | 'ellbogen' | 'lws' | 'huefte' | 'sprunggelenk' | 'nacken';

export type PathId = 'push' | 'pike' | 'row' | 'vpull' | 'squat' | 'hinge' | 'plank' | 'side' | 'back' | 'balance' | 'calf';

export type Mode = 'reps' | 'hold' | 'time';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  path?: PathId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  mode: Mode;
  /** reps: Wiederholungen, hold/time: Sekunden */
  range: [number, number];
  unilateral?: boolean;
  secPerRep?: number;
  rest: number;
  muscles: { primary: Muscle[]; secondary: Muscle[] };
  goals: Goal[];
  equipment: Equipment[];
  joints: Partial<Record<Joint, 1 | 2 | 3>>;
  space: 'klein' | 'mittel' | 'gross';
  quiet: boolean;
  /** Tiefe Kniebeugung / Scherkräfte – nur bei beschwerdefreien Knien */
  kneeCaution?: boolean;
  /** Erhöhter Blutdruckanstieg (Kopf unten / lange Pressatmung) */
  bpCaution?: boolean;
  /** Erfordert sichere Absicherung wegen Gleichgewicht */
  fallRisk?: boolean;
  prerequisites?: string;
  steps: string[];
  breathing: string;
  mistakes: string[];
  safety: string[];
  anim: string;
}

export interface SetLog {
  reps?: number;
  holdSec?: number;
  target: number;
  side?: 'L' | 'R';
}

export interface ExerciseLog {
  exerciseId: string;
  path?: PathId;
  level?: number;
  sets: SetLog[];
  rir?: number; // geschätzte Wiederholungen in Reserve (letzter Satz)
  form?: 'sauber' | 'unsauber';
  pain?: boolean;
  skipped?: boolean;
  swappedFrom?: string;
}

export type SessionKind = 'kraft_a' | 'kraft_b' | 'mobility' | 'balance' | 'minimum' | 'frei' | 'assessment';

export interface Session {
  id: ID;
  date: string; // ISO Start
  endedAt?: string;
  durationSec: number;
  kind: SessionKind;
  title: string;
  minutesPlanned: number;
  location: Location;
  exercises: ExerciseLog[];
  rpe?: number; // Session-RPE 1–10
  energy?: number; // 1–5 nach dem Training
  note?: string;
  manual?: boolean;
  adjustments?: string[];
}

export type Location = 'zuhause' | 'hotel' | 'draussen';

export type ActivityType = 'laufen' | 'radfahren' | 'peloton' | 'gehen' | 'wandern' | 'yoga' | 'schwimmen' | 'tennis' | 'sonstiges';

export interface Activity {
  id: ID;
  date: string;
  type: ActivityType;
  durationMin: number;
  distanceKm?: number;
  avgHR?: number;
  rpe?: number;
  note?: string;
}

export interface CheckIn {
  date: string; // YYYY-MM-DD
  sleepQuality: number; // 1–5
  sleepHours?: number;
  energy: number; // 1–5
  soreness: number; // 0–4 (keiner – stark)
  stress?: number; // 1–5
  pains: { joint: Joint; intensity: number }[]; // 0–10
  warnings: string[]; // Warnsymptome (ids)
  restingHR?: number;
  hrv?: number;
  note?: string;
}

export interface Measurement {
  id: ID;
  date: string;
  weightKg?: number;
  waistCm?: number;
  bodyFatPct?: number;
  bodyFatMethod?: string;
  restingHR?: number;
  note?: string;
}

export interface AssessmentResult {
  pushVariant: 'wand' | 'schraeg_hoch' | 'schraeg_tief' | 'boden';
  pushReps: number;
  chairStand30s: number;
  chairStandPain?: boolean;
  plankSec: number;
  sidePlankKnees: boolean;
  sidePlankL: number;
  sidePlankR: number;
  singleLegL: number;
  singleLegR: number;
  eyesClosedL?: number;
  eyesClosedR?: number;
  bridgeSingleL: number;
  bridgeSingleR: number;
  proneYHoldSec: number;
  backScratchL?: number; // cm, negativ = Abstand
  backScratchR?: number;
  toeTouch: 'knie' | 'schienbein' | 'knoechel' | 'boden';
  deepSquat30s?: 'ja' | 'mit_hilfe' | 'nein' | 'ausgelassen';
  pullups?: number; // nur mit Stange
  deadHangSec?: number;
}

export interface Assessment {
  id: ID;
  date: string;
  results: AssessmentResult;
  levels: Partial<Record<PathId, number>>;
  notes: string[];
  focus?: string[];
}

export interface ProgressPhoto {
  id: ID;
  date: string;
  view: 'vorne' | 'seite' | 'hinten';
  blob: Blob;
  note?: string;
}

export interface MealItem {
  name: string;
  grams?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  id: ID;
  date: string; // ISO
  label: 'fruehstueck' | 'mittag' | 'abend' | 'snack';
  photo?: Blob;
  items: MealItem[];
  confidence?: 'niedrig' | 'mittel' | 'hoch';
  aiNote?: string;
  source: 'ki' | 'manuell';
  edited?: boolean;
}

export interface PathState {
  level: number;
  target: number; // Ziel-Wdh. oder -Sekunden
  sessionsAtLevel: number;
  formIssues: number;
  misses: number;
  updated: string;
  lastNote?: string;
}

export type PathStates = Partial<Record<PathId, PathState>>;

export type Sex = 'maennlich' | 'weiblich';

export interface Profile {
  name?: string;
  sex?: Sex;
  birthYear: number;
  heightCm: number;
  startWeightKg?: number;
  startWaistCm?: number;
  /** Auswahl aus dem Katalog (domain/conditions.ts) – Quelle der Wahrheit für Gesundheitsangaben */
  conditions?: string[];
  kneeHistory: ('meniskus' | 'kreuzband' | 'knorpel' | 'prothese')[];
  kneeStatus: 'beschwerdefrei' | 'leicht' | 'regelmaessig';
  neuropathy: boolean;
  cardioClearance: 'ausstehend' | 'frei' | 'eingeschraenkt';
  bpMeds: boolean;
  otherConditions?: string;
  hr: { max?: number; z1Bike?: [number, number]; z1Run?: [number, number]; vt2?: number };
  equipmentHome: Equipment[];
  equipmentTravel: Equipment[];
  daysPerWeek: number;
  defaultMinutes: number;
  goals: { weightKg?: number; waistCm?: number; pushups?: number; note?: string };
  nutrition: { kcalTarget?: number; proteinTarget?: number; carbsMax?: number; enabled: boolean };
  screening?: Record<string, boolean>;
  programStart: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Settings {
  theme: 'auto' | 'hell' | 'dunkel';
  sound: boolean;
  voice: boolean;
  lastBackupAt?: string;
  backupReminderDays: number;
}
