import type { Profile } from './types';
import { daysBetween } from './util';

export interface Phase {
  name: string;
  week: number;
  sets: number;
  rir: [number, number];
  deload: boolean;
  retest: boolean;
  focus: string;
}

/**
 * 12-Wochen-Einstieg, danach fortlaufende 6-Wochen-Blöcke (5 Aufbau + 1 Entlastung mit Re-Test).
 * Konservativ: Sehnen und Bänder passen sich langsamer an als Muskeln – daher lange Technikphase.
 */
export function phaseForWeek(week: number): Phase {
  if (week <= 2) return { name: 'Einstieg', week, sets: 2, rir: [3, 4], deload: false, retest: false, focus: 'Technik lernen, Gelenke und Sehnen an die Belastung gewöhnen.' };
  if (week <= 5) return { name: 'Fundament', week, sets: 2, rir: [2, 3], deload: false, retest: false, focus: 'Saubere Wiederholungen sammeln, Umfang langsam steigern.' };
  if (week === 6) return { name: 'Entlastung & Re-Test', week, sets: 2, rir: [3, 4], deload: true, retest: true, focus: 'Weniger Umfang, Erholung, Standortbestimmung.' };
  if (week <= 11) return { name: 'Aufbau', week, sets: 3, rir: [1, 3], deload: false, retest: false, focus: 'Mehr Umfang, anspruchsvollere Varianten.' };
  if (week === 12) return { name: 'Entlastung & Re-Test', week, sets: 2, rir: [3, 4], deload: true, retest: true, focus: 'Abschluss der ersten 12 Wochen – Re-Test.' };
  const inBlock = ((week - 13) % 6) + 1;
  const block = Math.floor((week - 13) / 6) + 3;
  if (inBlock === 6) return { name: `Block ${block} · Entlastung & Re-Test`, week, sets: 2, rir: [3, 4], deload: true, retest: true, focus: 'Erholung und Standortbestimmung.' };
  return { name: `Block ${block} · Aufbau`, week, sets: 3, rir: [1, 2], deload: false, retest: false, focus: 'Kontinuierlicher Aufbau mit konservativen Steigerungen.' };
}

export function programWeek(profile: Pick<Profile, 'programStart'>, today: Date = new Date()): number {
  return Math.max(1, Math.floor(daysBetween(profile.programStart, today) / 7) + 1);
}

export function currentPhase(profile: Pick<Profile, 'programStart'>, today: Date = new Date()): Phase {
  return phaseForWeek(programWeek(profile, today));
}

/** Jahresperspektive (für die Programmübersicht) */
export const YEAR_PLAN = [
  { months: 'Monat 1–3', title: 'Fundament', text: 'Technik, Gelenkverträglichkeit, Routine. Eingangstest und Re-Tests in Woche 6 und 12.' },
  { months: 'Monat 4–6', title: 'Kraft', text: 'Einbeinige Beinübungen, Liegestütz-Varianten, mit Equipment erste Klimmzug-Vorstufen.' },
  { months: 'Monat 7–9', title: 'Athletik', text: 'Mehr Umfang, Rumpfstabilität unter Bewegung, anspruchsvolle Balance.' },
  { months: 'Monat 10–12', title: 'Konsolidierung', text: 'Erreichtes Niveau festigen, individuelle Schwerpunkte, Jahrestest.' },
];
