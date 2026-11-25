import type { Joint, Profile, Sex } from './types';

/**
 * Katalog der Angaben zu Erkrankungen, Beschwerden und Medikamenten.
 *
 * Grundsätze:
 *  – FORMA stellt keine Diagnosen und ersetzt keine ärztliche Beratung. Die Angaben dienen nur dazu, den
 *    Trainingsvorschlag vorsichtiger zu gestalten und auf eine ärztliche Abstimmung hinzuweisen.
 *  – Wirkungen sind bewusst konservativ: im Zweifel schonender, nie „freigebend“.
 *  – Bei „needsClearance“ bleiben hochintensive und Kopf-unten-Belastungen gesperrt, bis die Nutzerin / der Nutzer
 *    im Profil bestätigt, dass eine ärztliche Freigabe vorliegt.
 */
export interface ConditionEffect {
  /** Höchste erlaubte Belastungsstufe je Gelenk (0–3), gilt dauerhaft */
  joints?: Partial<Record<Joint, number>>;
  /** Keine Übungen mit Kopf unter Herzhöhe / Pressatmungsrisiko – dauerhaft */
  noInverted?: boolean;
  /** Keine tiefen oder einbeinigen Kniebelastungen */
  noDeepKnee?: boolean;
  /** Hinweis, dass vor intensiverem Training eine ärztliche Freigabe sinnvoll ist */
  needsClearance?: boolean;
  /** Ohne Freigabe keine hochintensiven Intervalle */
  noIntervals?: boolean;
  /** Automatische Vorschläge bis zur Freigabe nur sanft (Mobilität, Balance) */
  gentle?: boolean;
  /** Sturzprävention: Gleichgewichtsübungen nur mit Halt, Einstiegsstufe begrenzt */
  fallCare?: boolean;
  /** Pulszonen unzuverlässig → nach Gefühl (RPE) steuern */
  pulseUnreliable?: boolean;
  /** Kalorien-/Gewichtsfokus ausblenden */
  noCalories?: boolean;
  /** Entspricht einer früheren Knie-OP (begrenzt die Startstufe bei Kniebeugen) */
  kneeHistory?: 'meniskus' | 'kreuzband' | 'knorpel' | 'prothese';
  /** Kurzer Hinweis, der im Profil unter „So berücksichtigt FORMA das“ erscheint */
  note?: string;
}

export interface Condition {
  id: string;
  label: string;
  femaleOnly?: boolean;
  effect?: ConditionEffect;
}

export interface ConditionGroup {
  id: string;
  title: string;
  items: Condition[];
}

const CLEAR = { needsClearance: true, noIntervals: true } as const;

export const CONDITION_GROUPS: ConditionGroup[] = [
  {
    id: 'allgemein',
    title: 'Ärztliche Abklärung',
    items: [
      { id: 'abklaerung_offen', label: 'Eine ärztliche Abklärung meiner Belastbarkeit steht noch aus (z. B. Herz, Lunge)', effect: { ...CLEAR, noInverted: true, note: 'Abklärung ausstehend: keine hochintensiven Intervalle, keine Kopf-unten-Übungen, Ausdauer im ruhigen Grundlagenbereich.' } },
      { id: 'sport_abgeraten', label: 'Mir wurde von sportlicher Belastung abgeraten oder nur unter ärztlicher Aufsicht erlaubt', effect: { ...CLEAR, gentle: true, noInverted: true, note: 'Ärztliche Vorgaben haben Vorrang: FORMA schlägt nur sanfte Einheiten vor, bis du die Freigabe bestätigst.' } },
      { id: 'op_kuerzlich', label: 'Operation in den letzten 6 Monaten', effect: { ...CLEAR, gentle: true, note: 'Nach einer Operation sind Wundheilung und ärztliche Vorgaben maßgeblich – bis zur Freigabe nur sanftes Training.' } },
      { id: 'krebs', label: 'Krebserkrankung (aktuell, in Behandlung oder Nachsorge)', effect: { ...CLEAR, note: 'Belastung bitte mit dem Behandlungsteam abstimmen; an schlechten Tagen konsequent leichter trainieren.' } },
    ],
  },
  {
    id: 'herz',
    title: 'Herz & Kreislauf',
    items: [
      { id: 'bluthochdruck', label: 'Bluthochdruck', effect: { noInverted: true, note: 'Bluthochdruck: keine Kopf-unten-Übungen, Pressatmung vermeiden, Blutdruck regelmäßig kontrollieren lassen.' } },
      { id: 'herzerkrankung', label: 'Herzerkrankung (z. B. koronare Herzkrankheit, Herzschwäche)', effect: { ...CLEAR, noInverted: true, note: 'Herzerkrankung: Belastung nur nach ärztlicher Freigabe steigern; keine hochintensiven Intervalle ohne Freigabe.' } },
      { id: 'herzrhythmus', label: 'Herzrhythmusstörungen / Vorhofflimmern', effect: { ...CLEAR, noInverted: true, note: 'Rhythmusstörungen: Intensität nach Gefühl begrenzen, bei Herzrasen oder Schwindel sofort pausieren und ärztlich abklären.' } },
      { id: 'herzklappe', label: 'Herzklappenerkrankung', effect: { ...CLEAR, noInverted: true } },
      { id: 'infarkt_schlaganfall', label: 'Herzinfarkt oder Schlaganfall in der Vorgeschichte', effect: { ...CLEAR, noInverted: true } },
      { id: 'schrittmacher', label: 'Herzschrittmacher oder Defibrillator', effect: { ...CLEAR, noInverted: true, joints: { schulter: 2 }, note: 'Schrittmacher/Defibrillator: Belastungsgrenzen und Armbewegungen bitte mit der Kardiologie abstimmen.' } },
      { id: 'durchblutung', label: 'Durchblutungsstörung der Beine oder Thrombose in der Vorgeschichte', effect: { ...CLEAR, note: 'Durchblutungsstörung: bei Schmerzen in den Beinen pausieren; Belastung ärztlich abstimmen.' } },
    ],
  },
  {
    id: 'stoffwechsel',
    title: 'Stoffwechsel & Hormone',
    items: [
      { id: 'diabetes1', label: 'Diabetes Typ 1', effect: { needsClearance: true, note: 'Diabetes: Blutzucker vor und nach dem Training im Blick behalten, Traubenzucker bereithalten; Einheit bei Unterzuckerungszeichen sofort beenden.' } },
      { id: 'diabetes2', label: 'Diabetes Typ 2', effect: { note: 'Diabetes: Blutzucker im Blick behalten, bei Unterzuckerungszeichen (Zittern, Schwitzen, Schwindel) beenden. Regelmäßige Bewegung ist günstig.' } },
      { id: 'praediabetes', label: 'Prädiabetes oder Insulinresistenz', effect: { note: 'Krafttraining und regelmäßige Bewegung verbessern die Insulinempfindlichkeit – Kontinuität zählt mehr als Intensität.' } },
      { id: 'adipositas', label: 'Starkes Übergewicht (BMI ab 30)', effect: { noDeepKnee: true, note: 'Gelenkschonend starten: keine einbeinigen Tiefbeugen, Steigerung in kleinen Schritten.' } },
      { id: 'schilddruese', label: 'Schilddrüsenerkrankung (Über-/Unterfunktion, Knoten)', effect: { note: 'Bei unbehandelter Überfunktion ist der Ruhepuls oft erhöht – Belastung ärztlich abstimmen.' } },
      { id: 'blutfette', label: 'Erhöhte Blutfettwerte / Cholesterin' },
      { id: 'gicht', label: 'Gicht', effect: { note: 'Bei akutem Gichtanfall Training in der betroffenen Region pausieren.' } },
    ],
  },
  {
    id: 'atemwege',
    title: 'Atemwege & Lunge',
    items: [
      { id: 'asthma', label: 'Asthma', effect: { note: 'Asthma: Notfallmedikament bereithalten; bei Atemnot sofort pausieren. Bei kalter oder staubiger Luft ruhiger starten.' } },
      { id: 'copd', label: 'COPD oder andere chronische Lungenerkrankung', effect: { ...CLEAR, noInverted: true } },
      { id: 'atemnot_unklar', label: 'Ungeklärte Atemnot bei Belastung', effect: { ...CLEAR, noInverted: true, note: 'Ungeklärte Atemnot: bitte ärztlich abklären lassen; bis dahin nur ruhige Belastung.' } },
      { id: 'schlafapnoe', label: 'Schlafapnoe', effect: { note: 'Schlafapnoe: Müdigkeit tagsüber beeinflusst die Trainingsform – bei sehr schlechtem Schlaf leichter trainieren.' } },
    ],
  },
  {
    id: 'bewegung',
    title: 'Gelenke, Rücken & Muskeln',
    items: [
      { id: 'knie_arthrose', label: 'Kniearthrose oder Knorpelschaden', effect: { joints: { knie: 2 }, noDeepKnee: true, kneeHistory: 'knorpel', note: 'Kniearthrose: keine tiefen oder einbeinigen Knieübungen; Knie stabil über dem Fuß führen.' } },
      { id: 'knie_meniskus', label: 'Meniskusriss oder Meniskus-Operation', effect: { kneeHistory: 'meniskus', note: 'Knie nach Meniskusproblem: kontrollierte Kniebeugen ohne Sprünge, einbeinige Varianten erst nach sauberer Vorstufe.' } },
      { id: 'knie_kreuzband', label: 'Kreuzbandverletzung oder Kreuzband-Operation', effect: { kneeHistory: 'kreuzband', note: 'Kreuzband: Knie stabil über dem Fuß führen, keine Sprünge; einbeinige Varianten erst nach sauberer Vorstufe.' } },
      { id: 'knie_prothese', label: 'Knieprothese', effect: { joints: { knie: 1 }, noDeepKnee: true, kneeHistory: 'prothese', note: 'Knieprothese: nur gelenkschonende Beinübungen; Vorgaben der Orthopädie haben Vorrang.' } },
      { id: 'huefte_arthrose', label: 'Hüftarthrose', effect: { joints: { huefte: 2 } } },
      { id: 'huefte_prothese', label: 'Hüftprothese', effect: { joints: { huefte: 1 }, note: 'Hüftprothese: Bewegungsgrenzen laut OP-Anweisung beachten (z. B. nicht zu tief beugen).' } },
      { id: 'bandscheibe', label: 'Bandscheibenvorfall oder Ischias', effect: { joints: { lws: 1 }, note: 'Bandscheibe: keine Übungen mit starkem Hohlkreuz; bei ausstrahlenden Schmerzen oder Taubheit pausieren und ärztlich abklären.' } },
      { id: 'ruecken_chronisch', label: 'Chronische Rückenschmerzen', effect: { joints: { lws: 2 } } },
      { id: 'stenose', label: 'Spinalkanalstenose oder Wirbelgleiten', effect: { joints: { lws: 1 } } },
      { id: 'skoliose', label: 'Skoliose', effect: { note: 'Skoliose: Übungen möglichst symmetrisch ausführen; physiotherapeutische Anleitung ist sinnvoll.' } },
      { id: 'osteoporose', label: 'Osteoporose oder Osteopenie', effect: { needsClearance: true, note: 'Osteoporose: keine Sprünge, keine ruckartigen Rumpfbewegungen; Sturzprävention und Belastung ärztlich abstimmen.' } },
      { id: 'schulter', label: 'Schulterbeschwerden (z. B. Impingement, Rotatorenmanschette, Instabilität)', effect: { joints: { schulter: 2 }, note: 'Schulter: anspruchsvolle Druck- und Zugvarianten werden ausgelassen.' } },
      { id: 'schulter_op', label: 'Schulter-Operation oder Schulterverrenkung', effect: { joints: { schulter: 1 } } },
      { id: 'ellbogen', label: 'Ellbogenbeschwerden (z. B. Tennis-/Golferarm)', effect: { joints: { ellbogen: 1 } } },
      { id: 'handgelenk', label: 'Handgelenkbeschwerden oder Karpaltunnelsyndrom', effect: { joints: { handgelenk: 1 }, note: 'Handgelenk: Liegestütz-Varianten am Boden werden durch wandnahe Varianten ersetzt.' } },
      { id: 'fuss', label: 'Beschwerden an Achillessehne, Fuß oder Sprunggelenk', effect: { joints: { sprunggelenk: 1 } } },
      { id: 'nacken', label: 'Nacken- oder Halswirbelsäulenbeschwerden', effect: { joints: { nacken: 1 } } },
      { id: 'rheuma', label: 'Rheuma oder entzündliche Gelenkerkrankung', effect: { note: 'Bei akutem Schub das Training in den betroffenen Gelenken pausieren.' } },
      { id: 'fibromyalgie', label: 'Fibromyalgie oder chronisches Schmerzsyndrom', effect: { note: 'Sehr langsam steigern; an schlechten Tagen genügt Mobilität.' } },
      { id: 'hernie', label: 'Leisten- oder Bauchwandbruch', effect: { needsClearance: true, note: 'Bruch: starkes Pressen vermeiden und ärztlich abklären lassen, welche Rumpfübungen geeignet sind.' } },
      { id: 'beckenboden', label: 'Beckenbodenschwäche oder Blasenschwäche', effect: { note: 'Pressatmung vermeiden; physiotherapeutisches Beckenbodentraining ergänzt FORMA sinnvoll.' } },
    ],
  },
  {
    id: 'nerven',
    title: 'Nerven, Gleichgewicht & Kopf',
    items: [
      { id: 'polyneuropathie', label: 'Gefühlsstörungen oder Taubheit an Füßen oder Händen (z. B. Polyneuropathie)', effect: { fallCare: true, note: 'Gefühlsstörungen: Gleichgewichtsübungen immer mit Halt in Griffweite, Füße regelmäßig auf Druckstellen prüfen, sicherer Untergrund.' } },
      { id: 'schwindel', label: 'Schwindel oder Gleichgewichtsstörungen', effect: { noInverted: true, fallCare: true, note: 'Schwindel: keine Kopf-unten-Übungen, Gleichgewichtsübungen nur mit Halt; bei neuem Schwindel ärztlich abklären.' } },
      { id: 'sturz', label: 'Sturz in den letzten 12 Monaten oder Sturzangst', effect: { fallCare: true } },
      { id: 'epilepsie', label: 'Epilepsie', effect: { needsClearance: true, noInverted: true, note: 'Epilepsie: Training nicht allein an Orten mit Verletzungsrisiko; Belastung ärztlich abstimmen.' } },
      { id: 'neuro', label: 'Multiple Sklerose, Parkinson oder andere neurologische Erkrankung', effect: { ...CLEAR, fallCare: true, noInverted: true, gentle: true, note: 'Neurologische Erkrankung: bis zur ärztlichen Freigabe nur sanfte Einheiten, Gleichgewichtsübungen nur mit Halt.' } },
      { id: 'migraene', label: 'Migräne oder häufige Kopfschmerzen', effect: { noInverted: true, note: 'Pressatmung und Kopf-unten-Positionen vermeiden; bei Aura oder Kopfschmerz während des Trainings pausieren.' } },
    ],
  },
  {
    id: 'augen',
    title: 'Augen',
    items: [
      { id: 'glaukom', label: 'Grüner Star (Glaukom)', effect: { noInverted: true, note: 'Glaukom: Kopf-unten-Positionen und Pressatmung meiden.' } },
      { id: 'netzhaut', label: 'Netzhauterkrankung, Netzhautablösung oder Augen-Operation', effect: { noInverted: true, note: 'Netzhaut/Augen-OP: Kopf-unten-Positionen, Erschütterungen und Pressatmung meiden; Belastung augenärztlich abstimmen.' } },
    ],
  },
  {
    id: 'sonstiges',
    title: 'Weitere Erkrankungen',
    items: [
      { id: 'schwanger', label: 'Schwangerschaft', femaleOnly: true, effect: { ...CLEAR, gentle: true, noInverted: true, note: 'Schwangerschaft: Training bitte mit Ärztin oder Hebamme abstimmen; FORMA schlägt bis dahin nur sanfte Einheiten vor.' } },
      { id: 'wochenbett', label: 'Geburt in den letzten 6 Monaten', femaleOnly: true, effect: { ...CLEAR, gentle: true, note: 'Nach der Geburt: Rückbildung und Beckenboden zuerst, intensiveres Training nach ärztlicher Freigabe.' } },
      { id: 'diastase', label: 'Rektusdiastase (Bauchmuskelspalt) nach Schwangerschaft', femaleOnly: true, effect: { needsClearance: true, note: 'Diastase: Rumpfübungen physiotherapeutisch abstimmen lassen.' } },
      { id: 'niere', label: 'Nierenerkrankung', effect: { needsClearance: true } },
      { id: 'leber', label: 'Lebererkrankung', effect: { needsClearance: true } },
      { id: 'anaemie', label: 'Blutarmut (Anämie)', effect: { note: 'Anämie: bei ungewöhnlicher Müdigkeit oder Atemnot ärztlich abklären; Belastung nach Gefühl.' } },
      { id: 'gerinnung', label: 'Blutgerinnungsstörung', effect: { needsClearance: true, fallCare: true, note: 'Gerinnungsstörung: Stoß- und Sturzrisiken vermeiden.' } },
      { id: 'autoimmun', label: 'Autoimmunerkrankung', effect: { note: 'Bei akuten Schüben Intensität deutlich reduzieren.' } },
      { id: 'long_covid', label: 'Long COVID oder chronische Erschöpfung (ME/CFS)', effect: { ...CLEAR, gentle: true, note: 'Chronische Erschöpfung: Belastung sehr vorsichtig und mit Pausen dosieren; Verschlechterung nach Anstrengung ernst nehmen.' } },
      { id: 'psyche', label: 'Depression, Angststörung oder Burn-out', effect: { note: 'Regelmäßige Bewegung kann helfen – an schlechten Tagen reicht das Minimum-Workout. Bei Verschlechterung bitte Unterstützung suchen.' } },
      { id: 'essstoerung', label: 'Essstörung (aktuell oder früher)', effect: { noCalories: true, note: 'Kalorien- und Gewichtsfunktionen werden ausgeblendet. Sprich bei Unsicherheit mit deinem Behandlungsteam.' } },
    ],
  },
  {
    id: 'medikamente',
    title: 'Medikamente',
    items: [
      { id: 'med_betablocker', label: 'Betablocker oder andere pulssenkende Medikamente', effect: { pulseUnreliable: true, note: 'Pulssenkende Medikamente: Pulszonen sind unzuverlässig – Intensität nach Gefühl (RPE) steuern.' } },
      { id: 'med_blutdruck', label: 'Blutdruckmedikamente (z. B. Entwässerung, ACE-Hemmer)', effect: { note: 'Blutdruckmedikamente: langsam aufstehen, ausreichend trinken; bei Schwindel pausieren.' } },
      { id: 'med_blutverduenner', label: 'Blutverdünner (z. B. Marcumar, Apixaban, Rivaroxaban, ASS)', effect: { fallCare: true, note: 'Blutverdünner: Sturz- und Stoßrisiken vermeiden, bei Verletzungen ärztlich abklären lassen.' } },
      { id: 'med_insulin', label: 'Insulin oder Medikamente mit Unterzuckerungsrisiko', effect: { needsClearance: true, note: 'Unterzuckerung: Traubenzucker bereithalten, vor dem Training Blutzucker prüfen, nicht allein bei starken Schwankungen trainieren.' } },
      { id: 'med_kortison', label: 'Dauerhaft Kortison', effect: { note: 'Kortison: Knochen und Sehnen sind empfindlicher – besonders langsam steigern.' } },
      { id: 'med_gewicht', label: 'Medikamente zur Gewichtsreduktion (z. B. GLP-1-Spritzen)', effect: { note: 'Bei schneller Gewichtsabnahme ist Krafttraining mit ausreichend Eiweiß wichtig, um Muskulatur zu erhalten.' } },
      { id: 'med_schmerz', label: 'Regelmäßig Schmerzmittel', effect: { note: 'Schmerzmittel können Warnsignale überdecken – Schmerzregeln besonders ernst nehmen.' } },
      { id: 'med_statin', label: 'Cholesterinsenker (Statine)', effect: { note: 'Ungewöhnliche Muskelschmerzen oder -schwäche bitte ärztlich abklären lassen.' } },
    ],
  },
];

export const ALL_CONDITIONS: Condition[] = CONDITION_GROUPS.flatMap((g) => g.items);
export const CONDITION_MAP: Record<string, Condition> = Object.fromEntries(ALL_CONDITIONS.map((c) => [c.id, c]));

export function groupsFor(sex?: Sex): ConditionGroup[] {
  return CONDITION_GROUPS.map((g) => ({ ...g, items: g.items.filter((c) => !c.femaleOnly || sex === 'weiblich') })).filter((g) => g.items.length);
}

// ───────────────────────── Auswertung ─────────────────────────

export interface ProfileRules {
  joints: Partial<Record<Joint, number>>;
  noInverted: boolean;
  noDeepKnee: boolean;
  noIntervals: boolean;
  gentle: boolean;
  fallCare: boolean;
  pulseUnreliable: boolean;
  noCalories: boolean;
  needsClearance: boolean;
  cleared: boolean;
  kneeHistory: NonNullable<ConditionEffect['kneeHistory']>[];
  notes: string[];
}

export function profileRules(p: Pick<Profile, 'conditions' | 'cardioClearance'>): ProfileRules {
  const cs = (p.conditions ?? []).map((id) => CONDITION_MAP[id]).filter((c): c is Condition => !!c);
  const fx = (c: Condition) => c.effect ?? {};
  const needsClearance = cs.some((c) => fx(c).needsClearance);
  const cleared = !needsClearance || p.cardioClearance === 'frei';
  const joints: Partial<Record<Joint, number>> = {};
  for (const c of cs) for (const [j, v] of Object.entries(fx(c).joints ?? {}) as [Joint, number][]) joints[j] = Math.min(joints[j] ?? 3, v);
  const notes: string[] = [];
  for (const c of cs) { const n = fx(c).note; if (n && !notes.includes(n)) notes.push(n); }
  return {
    joints,
    // Kopf-unten: gesperrt solange keine Freigabe bestätigt ist; bei Gründen ohne „needsClearance“ (z. B. Glaukom) dauerhaft
    noInverted: p.cardioClearance !== 'frei' || cs.some((c) => fx(c).noInverted && (!fx(c).needsClearance || !cleared)),
    noDeepKnee: cs.some((c) => fx(c).noDeepKnee),
    noIntervals: p.cardioClearance !== 'frei' || cs.some((c) => fx(c).noIntervals && !cleared),
    gentle: cs.some((c) => fx(c).gentle) && !cleared,
    fallCare: cs.some((c) => fx(c).fallCare),
    pulseUnreliable: cs.some((c) => fx(c).pulseUnreliable),
    noCalories: cs.some((c) => fx(c).noCalories),
    needsClearance,
    cleared,
    kneeHistory: cs.map((c) => fx(c).kneeHistory).filter((k): k is NonNullable<ConditionEffect['kneeHistory']> => !!k),
    notes,
  };
}

/** Setzt die Auswahl und hält die abgeleiteten Altfelder (für Bestandslogik und Backups) konsistent. */
export function withConditions(p: Profile, ids: string[]): Profile {
  const set = new Set(ids);
  const prev = profileRules(p);
  const next = profileRules({ conditions: ids, cardioClearance: p.cardioClearance });
  let cardioClearance = p.cardioClearance;
  if (next.needsClearance && !prev.needsClearance && cardioClearance === 'frei') cardioClearance = 'ausstehend';
  if (!next.needsClearance && cardioClearance !== 'frei') cardioClearance = 'frei';
  if (set.has('abklaerung_offen') && !p.conditions?.includes('abklaerung_offen') && cardioClearance === 'frei') cardioClearance = 'ausstehend';
  const knee = next.kneeHistory;
  return {
    ...p,
    conditions: ids,
    cardioClearance,
    neuropathy: set.has('polyneuropathie'),
    bpMeds: set.has('med_betablocker') || set.has('med_blutdruck'),
    kneeHistory: [...new Set(knee)],
    kneeStatus: knee.length ? p.kneeStatus : 'beschwerdefrei',
    nutrition: next.noCalories ? { ...p.nutrition, enabled: false } : p.nutrition,
  };
}

/** Bestandsprofile (vor Einführung der Auswahl): bisherige Angaben in die Auswahl übernehmen. */
export function migrateProfile(p: Profile): Profile | null {
  if (p.conditions) return null;
  const ids: string[] = [];
  if (p.neuropathy) ids.push('polyneuropathie');
  if (p.bpMeds) ids.push('med_betablocker');
  for (const k of p.kneeHistory ?? []) ids.push({ meniskus: 'knie_meniskus', kreuzband: 'knie_kreuzband', knorpel: 'knie_arthrose', prothese: 'knie_prothese' }[k]);
  if (p.cardioClearance !== 'frei') ids.push('abklaerung_offen');
  return { ...withConditions({ ...p, conditions: [] }, ids), cardioClearance: p.cardioClearance, kneeStatus: p.kneeStatus };
}
