import { EXERCISE_MAP, PATHS } from './exercises';
import { initialTarget } from './progression';
import type { AssessmentResult, Equipment, PathId, PathStates, Profile } from './types';
import { clamp } from './util';
import { profileRules } from './conditions';

export interface TestDef {
  id: string;
  title: string;
  what: string;
  how: string[];
  safety: string;
  anim: string;
  timer?: number;
}

/** Sicheres Eingangs-Assessment – keine Maximalkrafttests, Abbruch an der Technikgrenze. */
export const TESTS: TestDef[] = [
  {
    id: 'push', title: 'Liegestütz-Test', what: 'Kraft Brust, Schulter, Arme', anim: 'pushup?inc=40',
    how: ['Beginne an der Wand. Gelingen 15 saubere Wiederholungen, teste nach 2 Minuten Pause die nächste Variante (Tischkante → Stuhl → Boden).', 'Zähle bei der schwersten Variante, die du sauber schaffst, die Wiederholungen bis zur Technikgrenze – nicht bis zum Muskelversagen.', 'Stopp, sobald Hüfte durchhängt oder das Tempo deutlich nachlässt.'],
    safety: 'Kein Schmerz in Schulter oder Handgelenk. Keine Pressatmung.',
  },
  {
    id: 'chair', title: '30-Sekunden-Aufstehtest', what: 'Funktionelle Beinkraft', anim: 'squat?depth=box', timer: 30,
    how: ['Stabiler Stuhl (ca. 45 cm) an der Wand, Arme vor der Brust verschränkt.', 'Zähle in 30 Sekunden, wie oft du vollständig aufstehst und dich wieder setzt.', 'Zügig, aber kontrolliert.'],
    safety: 'Bei Knieschmerz über 3/10 sofort abbrechen und das Häkchen „Knieschmerz“ setzen.',
  },
  {
    id: 'plank', title: 'Unterarmstütz', what: 'Rumpfstabilität', anim: 'plank', timer: 90,
    how: ['Unterarmstütz mit gerader Linie.', 'Zeit stoppen, sobald die Hüfte absinkt oder hochwandert – maximal 90 Sekunden.'],
    safety: 'Ruhig weiteratmen. Bei Rückenschmerz abbrechen.',
  },
  {
    id: 'side', title: 'Seitstütz', what: 'Seitliche Rumpfkraft', anim: 'side', timer: 60,
    how: ['Seitstütz auf dem Unterarm, Beine gestreckt. Falls das nicht geht: Knie gebeugt (Häkchen setzen).', 'Zeit bis die Hüfte absinkt, max. 60 s – beide Seiten.'],
    safety: 'Schulter liegt direkt über dem Ellbogen.',
  },
  {
    id: 'balance', title: 'Einbeinstand', what: 'Gleichgewicht', anim: 'stand?single=1', timer: 45,
    how: ['Direkt neben einer Wand, Hand in Griffweite.', 'Ein Bein anheben, Zeit stoppen bis zum Absetzen oder Festhalten – max. 45 s pro Seite.', 'Nur wenn beide Seiten 30 s schaffen: zusätzlich mit geschlossenen Augen testen (max. 30 s), Hand 2 cm vor der Wand.'],
    safety: 'Mit Gefühlsstörungen in den Füßen den Augen-zu-Test nur direkt an der Wand durchführen.',
  },
  {
    id: 'bridge', title: 'Einbeinige Brücke', what: 'Gesäß, hintere Kette', anim: 'bridge?single=1',
    how: ['Rückenlage, ein Bein gestreckt.', 'Zähle saubere Wiederholungen mit waagerechtem Becken, max. 20 pro Seite.'],
    safety: 'Bei Krampf im Oberschenkel hinten: abbrechen, Fuß näher ans Gesäß.',
  },
  {
    id: 'prone', title: 'Y-Halten in Bauchlage', what: 'Oberer Rücken, Haltung', anim: 'prone_ytw', timer: 45,
    how: ['Bauchlage, Arme in Y-Position, Daumen nach oben.', 'Arme wenige Zentimeter anheben und halten, max. 45 s.'],
    safety: 'Nacken lang lassen, Blick zum Boden.',
  },
  {
    id: 'mobility', title: 'Beweglichkeit', what: 'Schulter & Hüfte', anim: 'dislocate',
    how: ['Schulter (Back-Scratch): eine Hand von oben, eine von unten hinter den Rücken – Abstand der Mittelfinger in cm (Überlappung positiv, Lücke negativ). Beide Seiten.', 'Hüfte/Rückseite: Im Stand mit gestreckten Knien langsam nach vorn beugen – wie weit kommst du?', 'Optional: Tiefe Hocke 30 s mit Fersen am Boden (bei beschwerdefreien Knien).'],
    safety: 'Nur bis zu einem deutlichen Dehngefühl, nie in den Schmerz.',
  },
];

function lvl(path: PathId, l: number) {
  return clamp(l, 0, PATHS[path].levels.length - 1);
}

export interface Derived {
  levels: Partial<Record<PathId, number>>;
  targets: Partial<Record<PathId, number>>;
  notes: string[];
  focus: ('schulter' | 'huefte' | 'sprunggelenk' | 'balance')[];
}

export function deriveLevels(r: AssessmentResult, profile: Profile, equipment: Equipment[]): Derived {
  const levels: Partial<Record<PathId, number>> = {};
  const targets: Partial<Record<PathId, number>> = {};
  const notes: string[] = [];
  const focus: Derived['focus'] = [];
  const t = (path: PathId, testValue: number, factor = 0.6) => {
    const e = EXERCISE_MAP[PATHS[path].levels[levels[path]!][0]];
    targets[path] = clamp(Math.round(testValue * factor), e.range[0], e.range[1]);
  };

  // Drücken
  const pv = r.pushVariant, pr = r.pushReps;
  levels.push = pv === 'wand' ? (pr >= 15 ? 1 : 0) : pv === 'schraeg_hoch' ? (pr >= 15 ? 2 : 1) : pv === 'schraeg_tief' ? (pr >= 15 ? 3 : 2) : pr > 15 ? 4 : 3;
  t('push', pr);
  levels.pike = levels.push >= 4 ? 1 : 0;

  // Beine (konservativ wegen Knie-OPs: Start höchstens Tempo-Kniebeuge)
  const cs = r.chairStand30s;
  levels.squat = r.chairStandPain ? 0 : cs < 12 ? 0 : cs < 16 ? 1 : cs < 20 ? 2 : 3;
  if (r.chairStandPain) notes.push('Knieschmerz beim Aufstehtest – Beinübungen starten bewusst leicht. Bleibt der Schmerz, bitte orthopädisch/physiotherapeutisch abklären.');
  const rules = profileRules(profile);
  if ((profile.kneeHistory.length || rules.kneeHistory.length) && levels.squat > 3) levels.squat = 3;
  targets.squat = initialTarget(EXERCISE_MAP[PATHS.squat.levels[levels.squat][0]]);

  // Rumpf
  const pl = r.plankSec;
  levels.plank = pl < 15 ? 0 : pl < 30 ? 1 : pl < 60 ? 2 : 3;
  if (levels.plank === 2) t('plank', pl, 0.6);
  else targets.plank = initialTarget(EXERCISE_MAP[PATHS.plank.levels[levels.plank][0]]);

  const sp = Math.min(r.sidePlankL, r.sidePlankR);
  levels.side = r.sidePlankKnees ? (sp >= 40 ? 1 : 0) : sp < 15 ? 0 : sp < 45 ? 1 : 2;
  if (levels.side <= 1) t('side', sp, 0.6);
  if (Math.abs(r.sidePlankL - r.sidePlankR) > Math.max(8, 0.25 * Math.max(r.sidePlankL, r.sidePlankR)))
    notes.push(`Seitstütz: deutlicher Seitenunterschied (L ${r.sidePlankL} s / R ${r.sidePlankR} s) – wir beobachten das.`);

  // Balance
  const sl = Math.min(r.singleLegL, r.singleLegR);
  const ec = Math.min(r.eyesClosedL ?? 0, r.eyesClosedR ?? 0);
  levels.balance = sl < 10 ? 0 : sl < 30 ? 1 : ec >= 15 ? 3 : 2;
  if ((profile.neuropathy || rules.fallCare) && levels.balance > 3) levels.balance = 3;
  targets.balance = clamp(Math.round(Math.max(sl, 20) * 0.7), 20, 45);
  if (sl < 30) focus.push('balance');

  // Hüfte
  const br = Math.min(r.bridgeSingleL, r.bridgeSingleR);
  levels.hinge = br === 0 ? 0 : br < 8 ? 1 : br <= 12 ? 2 : equipment.includes('bank') ? 3 : 2;
  targets.hinge = levels.hinge === 2 ? clamp(Math.round(br * 0.7), 6, 12) : initialTarget(EXERCISE_MAP[PATHS.hinge.levels[levels.hinge][0]]);

  // Ziehen
  levels.row = r.proneYHoldSec < 20 ? 0 : 1;
  targets.row = initialTarget(EXERCISE_MAP[PATHS.row.levels[levels.row][0]]);
  if (equipment.includes('stange')) {
    levels.vpull = (r.pullups ?? 0) >= 3 ? 4 : (r.deadHangSec ?? 0) >= 30 ? 2 : (r.deadHangSec ?? 0) >= 10 ? 1 : 0;
  } else levels.vpull = 0;
  targets.vpull = initialTarget(EXERCISE_MAP[PATHS.vpull.levels[levels.vpull][0]]);

  levels.back = pl >= 60 ? 1 : 0;
  targets.back = initialTarget(EXERCISE_MAP[PATHS.back.levels[levels.back][0]]);
  levels.calf = 0;
  targets.calf = 15;

  // Beweglichkeit → Mobilitätsschwerpunkte
  const bs = Math.min(r.backScratchL ?? 0, r.backScratchR ?? 0);
  if (bs < -8) { focus.push('schulter'); notes.push('Schulterbeweglichkeit eingeschränkt – Wandgleiten und Handtuch-Kreisen werden bevorzugt.'); }
  if (r.toeTouch === 'knie' || r.toeTouch === 'schienbein') { focus.push('huefte'); notes.push('Rückseite/Hüfte eher steif – Hüft- und Beinbeuger-Mobilität im Fokus.'); }
  if (r.deepSquat30s === 'nein' || r.deepSquat30s === 'mit_hilfe') focus.push('sprunggelenk');

  for (const p of Object.keys(levels) as PathId[]) levels[p] = lvl(p, levels[p]!);
  return { levels, targets, notes, focus };
}

export function statesFromDerived(d: Derived, prev: PathStates = {}): PathStates {
  const out: PathStates = { ...prev };
  for (const p of Object.keys(d.levels) as PathId[]) {
    out[p] = { level: d.levels[p]!, target: d.targets[p] ?? 8, sessionsAtLevel: 0, formIssues: 0, misses: 0, updated: new Date().toISOString(), lastNote: 'Aus Standortbestimmung abgeleitet' };
  }
  return out;
}

/** Startwerte, falls der Test (noch) übersprungen wird – bewusst leicht. */
export function defaultStates(): PathStates {
  const base: Record<PathId, number> = { push: 1, pike: 0, row: 1, vpull: 0, squat: 1, hinge: 0, plank: 1, side: 0, back: 0, balance: 1, calf: 0 };
  const out: PathStates = {};
  for (const [p, l] of Object.entries(base) as [PathId, number][]) {
    out[p] = { level: l, target: initialTarget(EXERCISE_MAP[PATHS[p].levels[l][0]]), sessionsAtLevel: 0, formIssues: 0, misses: 0, updated: new Date().toISOString(), lastNote: 'Vorläufiger Start – Standortbestimmung empfohlen' };
  }
  return out;
}
