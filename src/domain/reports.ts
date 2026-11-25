import { activeDays, movingAvg, pathHistory, series, setsPerMuscle } from './analytics';
import { EXERCISE_MAP, MUSCLE_LABEL, PATHS, PATH_IDS } from './exercises';
import { CARDIO_TYPES } from './planner';
import { recurringPain } from './safety';
import type { Activity, CheckIn, Measurement, Profile, Session } from './types';
import { addDays, avg, dayKey, fmtNum, sum } from './util';

export interface Report {
  title: string;
  period: string;
  summary: string;
  facts: { label: string; value: string; kind: 'gemessen' | 'erfasst' | 'subjektiv' | 'geschätzt' }[];
  insights: string[];
  recommendations: string[];
}

interface Data { profile: Profile; sessions: Session[]; activities: Activity[]; measurements: Measurement[]; checkins: CheckIn[] }

export function buildReport(d: Data, days: 7 | 30, today = new Date()): Report {
  const start = addDays(today, -days + 1);
  const prevStart = addDays(start, -days);
  const inP = <T extends { date: string }>(xs: T[], a: Date, b: Date) => xs.filter((x) => dayKey(x.date) >= dayKey(a) && dayKey(x.date) <= dayKey(b));
  const S = inP(d.sessions, start, today), Sp = inP(d.sessions, prevStart, addDays(start, -1));
  const A = inP(d.activities, start, today);
  const C = inP(d.checkins, start, today);
  const strength = S.filter((s) => s.kind.startsWith('kraft') || s.kind === 'minimum' || s.kind === 'frei');
  const trainMin = Math.round(sum(S.map((s) => s.durationSec / 60)));
  const cardioMin = Math.round(sum(A.filter((a) => CARDIO_TYPES.includes(a.type)).map((a) => a.durationMin)));
  const days_ = activeDays(S, A).size;
  const target = days === 7 ? d.profile.daysPerWeek : Math.round((d.profile.daysPerWeek * 30) / 7);

  const facts: Report['facts'] = [
    { label: 'Aktive Tage', value: `${days_} von ${days} (Ziel ~${target})`, kind: 'erfasst' },
    { label: 'Krafteinheiten', value: `${strength.length}${Sp.length ? ` (Vorperiode ${Sp.filter((s) => s.kind.startsWith('kraft') || s.kind === 'minimum').length})` : ''}`, kind: 'erfasst' },
    { label: 'Trainingsminuten FORMA', value: `${trainMin} min`, kind: 'erfasst' },
    { label: 'Ausdauer', value: `${cardioMin} min (Ziel ${days === 7 ? 150 : 640} min)`, kind: 'erfasst' },
  ];
  const insights: string[] = [];
  const recs: string[] = [];

  // Körper
  const w = series(d.measurements, 'weightKg');
  const wIn = w.filter((p) => dayKey(p.date) >= dayKey(start));
  if (wIn.length >= 2) {
    const ma = movingAvg(w).filter((p) => dayKey(p.date) >= dayKey(start));
    const delta = ma[ma.length - 1].value - ma[0].value;
    facts.push({ label: 'Gewicht (7-T-Mittel)', value: `${fmtNum(ma[ma.length - 1].value)} kg (${delta >= 0 ? '+' : ''}${fmtNum(delta)} kg)`, kind: 'gemessen' });
    const perWeek = (delta / days) * 7;
    if (perWeek < -1) insights.push('Gewicht sinkt schneller als ca. 1 kg/Woche – bei diesem Tempo steigt das Risiko, Muskulatur zu verlieren. Eiweißzufuhr und Krafttraining sind jetzt besonders wichtig.');
    else if (perWeek <= -0.2) insights.push('Gewicht sinkt in einem nachhaltigen Tempo.');
    else if (days === 30 && perWeek > -0.1) recs.push('Gewicht stagniert seit 30 Tagen. Wenn Fettabbau Priorität hat: Kalorien/Kohlenhydrate leicht reduzieren oder Alltagsbewegung erhöhen – nicht das Training forcieren.');
  } else recs.push('Für einen belastbaren Gewichtstrend: 2–3× pro Woche morgens nüchtern wiegen.');
  const waist = series(d.measurements, 'waistCm').filter((p) => dayKey(p.date) >= dayKey(start));
  if (waist.length >= 2) facts.push({ label: 'Bauchumfang', value: `${fmtNum(waist[waist.length - 1].value)} cm (${fmtNum(waist[waist.length - 1].value - waist[0].value)} cm)`, kind: 'gemessen' });

  // Kraftentwicklung
  const ups: string[] = [];
  for (const p of PATH_IDS) {
    const h = pathHistory(d.sessions, p);
    const before = h.filter((x) => dayKey(x.date) < dayKey(start)).pop();
    const now = h.filter((x) => dayKey(x.date) >= dayKey(start)).pop();
    if (before && now && now.level > before.level) ups.push(`${PATHS[p].name}: ${EXERCISE_MAP[before.exerciseId].name} → ${EXERCISE_MAP[now.exerciseId].name}`);
  }
  if (ups.length) insights.push(`Stufenaufstiege: ${ups.join('; ')}.`);

  // Muskelbalance
  const spm = setsPerMuscle(strength);
  const weekly = (m: string) => ((spm as Record<string, number>)[m] ?? 0) / (days / 7);
  const low = ['quadrizeps', 'gesaess', 'brust', 'oberer_ruecken', 'latissimus', 'bauch'].filter((m) => weekly(m) < 4);
  if (strength.length >= 2 && low.length) recs.push(`Wenig Volumen für: ${low.map((m) => MUSCLE_LABEL[m]).join(', ')} (unter ~4 Arbeitssätzen/Woche). Längere Einheiten (20–30 min) helfen hier.`);

  // Subjektiv
  const sleep = avg(C.map((c) => c.sleepQuality));
  const energy = avg(C.map((c) => c.energy));
  if (sleep !== undefined) facts.push({ label: 'Schlafqualität Ø', value: `${fmtNum(sleep)} / 5`, kind: 'subjektiv' });
  if (energy !== undefined) facts.push({ label: 'Energie Ø', value: `${fmtNum(energy)} / 5`, kind: 'subjektiv' });
  const rpe = avg(S.map((s) => s.rpe).filter((x): x is number => x !== undefined));
  if (rpe !== undefined) {
    facts.push({ label: 'Belastung (Session-RPE) Ø', value: `${fmtNum(rpe)} / 10`, kind: 'subjektiv' });
    if (rpe >= 8.5) recs.push('Einheiten fühlen sich im Schnitt sehr hart an. Ziel ist RPE 6–8 – lieber eine Variante leichter und konstant bleiben.');
  }
  if (sleep !== undefined && sleep < 2.8) recs.push('Schlafqualität ist niedrig. Schlaf ist der stärkste Hebel für Regeneration – feste Zeiten, Abendroutine, Alkohol am Abend reduzieren.');
  const pain = recurringPain(d.checkins, today);
  if (pain.length) recs.push(`Wiederkehrende Beschwerden (${pain.join(', ')}). Bitte physiotherapeutisch oder ärztlich abklären lassen – FORMA schont diese Region bis dahin.`);

  // Kontinuität
  if (days_ >= target) insights.push('Kontinuität im Zielbereich – das ist der wichtigste Faktor für langfristigen Fortschritt.');
  else if (days_ >= target * 0.6) insights.push('Solide Kontinuität. Auch kurze 5–10-Minuten-Einheiten an vollen Tagen zählen.');
  else recs.push('Weniger aktive Tage als geplant. Das Minimum-Workout (5 min) hält die Routine auch an vollen Tagen am Leben.');
  if (cardioMin < (days === 7 ? 150 : 600)) recs.push(`Ausdauer unter Ziel: Zwei zusätzliche 30-Minuten-Einheiten im Grundlagenbereich${d.profile.hr.z1Bike ? ` (${d.profile.hr.z1Bike[0]}–${d.profile.hr.z1Bike[1]}/min)` : ''} würden die ärztliche Empfehlung erfüllen.`);

  const summary =
    days_ === 0 ? 'Keine Aktivitäten erfasst. Ein ruhiger Neustart mit einer kurzen Einheit ist jederzeit möglich.'
      : `${days_} aktive Tage, ${strength.length} Krafteinheiten und ${cardioMin} Minuten Ausdauer.`;
  return {
    title: days === 7 ? 'Wochenbericht' : 'Monatsbericht',
    period: `${start.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${today.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`,
    summary, facts, insights, recommendations: recs.slice(0, 5),
  };
}
