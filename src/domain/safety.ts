import type { CheckIn, Exercise, Joint, Profile } from './types';
import { JOINT_LABEL } from './exercises';
import { profileRules } from './conditions';

export const WARNINGS: { id: string; label: string; level: 'notfall' | 'arzt' | 'pause' }[] = [
  { id: 'brustschmerz', label: 'Brustschmerz, Druck- oder Engegefühl in der Brust', level: 'notfall' },
  { id: 'atemnot', label: 'Ungewöhnliche Atemnot (stärker als gewohnt)', level: 'arzt' },
  { id: 'schwindel', label: 'Schwindel, Benommenheit oder Ohnmachtsgefühl', level: 'arzt' },
  { id: 'herzrasen', label: 'Herzrasen oder unregelmäßiger Herzschlag', level: 'arzt' },
  { id: 'infekt', label: 'Fieber oder akuter Infekt', level: 'pause' },
  { id: 'knie', label: 'Knie schwillt an, blockiert oder gibt nach', level: 'arzt' },
  { id: 'taubheit', label: 'Neue oder zunehmende Taubheit/Kraftverlust in Armen oder Beinen', level: 'arzt' },
  { id: 'akut', label: 'Plötzlicher, starker Schmerz', level: 'arzt' },
];

export const STOP_RULES = [
  'Brustschmerz, Druck oder Enge in der Brust → sofort aufhören. Hält es an: Notruf 112.',
  'Ungewöhnliche Atemnot, Schwindel, Herzrasen → aufhören, hinsetzen, nicht weitertrainieren.',
  'Stechender oder zunehmender Gelenkschmerz (über 3 von 10) → Übung abbrechen, leichtere Variante oder Pause.',
  'Knie schwillt an, blockiert oder gibt nach → Training beenden, ärztlich/physiotherapeutisch abklären.',
  'Neue Taubheit oder Kraftverlust → nicht weitertrainieren, ärztlich abklären.',
];

export type SafetyStatus = 'ok' | 'angepasst' | 'pause' | 'arzt' | 'notfall';

export interface SafetyEval {
  status: SafetyStatus;
  /** Gelenke → maximal erlaubte Belastungsstufe (0 = gar nicht belasten) */
  jointLimits: Partial<Record<Joint, number>>;
  messages: string[];
}

export function evaluateCheckIn(c: CheckIn | undefined): SafetyEval {
  const res: SafetyEval = { status: 'ok', jointLimits: {}, messages: [] };
  if (!c) return res;
  const levels = c.warnings.map((w) => WARNINGS.find((x) => x.id === w)?.level).filter(Boolean);
  if (levels.includes('notfall')) {
    res.status = 'notfall';
    res.messages.push('Heute kein Training. Bei anhaltendem Brustschmerz oder Druckgefühl bitte sofort den Notruf 112 wählen.');
    return res;
  }
  if (levels.includes('arzt')) {
    res.status = 'arzt';
    res.messages.push('Heute kein Training. Das gemeldete Symptom sollte ärztlich abgeklärt werden, bevor du wieder belastest.');
    return res;
  }
  if (levels.includes('pause')) {
    res.status = 'pause';
    res.messages.push('Bei Fieber oder akutem Infekt: Training pausieren, bis du 24–48 h symptomfrei bist.');
    return res;
  }
  for (const p of c.pains) {
    const name = JOINT_LABEL[p.joint];
    if (p.intensity >= 7) {
      res.status = 'pause';
      res.messages.push(`${name}: starker Schmerz (${p.intensity}/10). Heute nicht trainieren. Bleibt der Schmerz bestehen, bitte ärztlich oder physiotherapeutisch abklären.`);
      res.jointLimits[p.joint] = 0;
    } else if (p.intensity >= 4) {
      if (res.status === 'ok') res.status = 'angepasst';
      res.jointLimits[p.joint] = 0;
      res.messages.push(`${name}: ${p.intensity}/10 – Übungen mit ${name}-Belastung werden heute ausgelassen.`);
    } else if (p.intensity >= 1) {
      if (res.status === 'ok') res.status = 'angepasst';
      res.jointLimits[p.joint] = Math.min(res.jointLimits[p.joint] ?? 3, 1);
      res.messages.push(`${name}: leichte Beschwerden (${p.intensity}/10) – nur gelenkschonende Varianten. Schmerz darf beim Training nicht zunehmen.`);
    }
  }
  return res;
}

/** Wiederkehrende Beschwerden: gleiche Region an ≥3 Tagen innerhalb von 10 Tagen */
export function recurringPain(checkins: CheckIn[], today = new Date()): Joint[] {
  const cutoff = today.getTime() - 10 * 86_400_000;
  const counts = new Map<Joint, number>();
  for (const c of checkins) {
    if (new Date(c.date).getTime() < cutoff) continue;
    for (const p of c.pains) if (p.intensity >= 3) counts.set(p.joint, (counts.get(p.joint) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([j]) => j);
}

export interface Allowed {
  ok: boolean;
  reason?: string;
}

/** Darf diese Übung mit Profil + Tagesstatus ausgeführt werden? */
export function exerciseAllowed(e: Exercise, profile: Profile, safety: SafetyEval): Allowed {
  for (const [j, lim] of Object.entries(safety.jointLimits) as [Joint, number][]) {
    const load = e.joints[j] ?? 0;
    if (load > lim) return { ok: false, reason: `${JOINT_LABEL[j]}-Belastung heute ausgeschlossen` };
  }
  const rules = profileRules(profile);
  for (const [j, lim] of Object.entries(rules.joints) as [Joint, number][]) {
    if ((e.joints[j] ?? 0) > lim) return { ok: false, reason: `${JOINT_LABEL[j]}: wegen deiner Angaben nur schonende Varianten` };
  }
  if (e.kneeCaution && (profile.kneeStatus !== 'beschwerdefrei' || rules.noDeepKnee)) return { ok: false, reason: 'Tiefe/einbeinige Kniebelastung wegen deiner Angaben ausgelassen' };
  if (e.bpCaution && rules.noInverted) return { ok: false, reason: 'Kopf-unten-Übung wegen deiner Angaben ausgelassen' };
  return { ok: true };
}

export function profileSafetyNotes(p: Profile): string[] {
  const rules = profileRules(p);
  const n = [...rules.notes];
  if (p.cardioClearance !== 'frei' && !rules.needsClearance)
    n.unshift('Ärztliche Freigabe nicht bestätigt: keine hochintensiven Intervalle, keine Kopf-unten-Übungen.');
  if (rules.needsClearance && !rules.cleared)
    n.push('Ärztliche Freigabe noch nicht bestätigt: Kopf-unten-Übungen und hochintensive Intervalle bleiben gesperrt. Nach der Abklärung unter Profil › Gesundheit bestätigen.');
  return n;
}
