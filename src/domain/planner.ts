import { EXERCISE_MAP, PATHS, UBIQUITOUS } from './exercises';
import { currentPhase, type Phase } from './program';
import { initialTarget, resolve } from './progression';
import { evaluateCheckIn, exerciseAllowed, type SafetyEval } from './safety';
import { profileRules } from './conditions';
import type { Activity, CheckIn, Equipment, Exercise, Location, PathId, PathStates, Profile, Session, SessionKind } from './types';
import { clamp, dayKey, daysBetween, sum } from './util';

export type PlanMode = 'auto' | 'kraft' | 'hotel' | 'draussen' | 'mobility';

export interface PlanOptions {
  minutes: number;
  mode: PlanMode;
  location: Location;
  extraEquipment?: Equipment[];
}

export interface PlanItem {
  exerciseId: string;
  path?: PathId;
  level?: number;
  target: number;
  sets: number;
  rest: number;
  note?: string;
}

export interface Block {
  label: string;
  kind: 'warmup' | 'main' | 'extra' | 'mobility' | 'cooldown';
  items: PlanItem[];
  /** Zirkel/Supersatz: Übungen im Wechsel, Satzpause nach jedem Durchgang */
  circuit: boolean;
  pairRest: number;
}

export interface Plan {
  kind: SessionKind | 'pause' | 'ruhe';
  title: string;
  subtitle: string;
  minutes: number;
  estimatedSec: number;
  blocks: Block[];
  rationale: string[];
  warnings: string[];
  cardio?: string;
  phase: Phase;
  location: Location;
  safety: SafetyEval;
}

export interface Context {
  profile: Profile;
  states: PathStates;
  sessions: Session[];
  activities: Activity[];
  checkin?: CheckIn;
  focus?: string[];
  today?: Date;
}

const STRENGTH: SessionKind[] = ['kraft_a', 'kraft_b', 'minimum'];

export function equipmentFor(profile: Profile, location: Location, extra: Equipment[] = []): Equipment[] {
  const base = location === 'zuhause' ? profile.equipmentHome : profile.equipmentTravel;
  const env: Equipment[] = location === 'draussen' ? ['bank', 'stufe', 'wand'] : UBIQUITOUS;
  return [...new Set([...base, ...env, ...extra])];
}

export function readiness(c?: CheckIn): { level: 'gut' | 'mittel' | 'niedrig'; reasons: string[] } {
  if (!c) return { level: 'gut', reasons: [] };
  const reasons: string[] = [];
  let pts = 0;
  if (c.sleepQuality <= 2) { pts++; reasons.push('Schlaf schlecht'); }
  if (c.sleepHours !== undefined && c.sleepHours < 5.5) { pts++; reasons.push(`nur ${c.sleepHours} h Schlaf`); }
  if (c.energy <= 2) { pts++; reasons.push('Energie niedrig'); }
  if (c.soreness >= 3) { pts++; reasons.push('starker Muskelkater'); }
  if ((c.stress ?? 0) >= 5) { pts++; reasons.push('hoher Stress'); }
  return { level: pts >= 2 ? 'niedrig' : pts === 1 ? 'mittel' : 'gut', reasons };
}

function estimateItemSec(it: PlanItem): number {
  const e = EXERCISE_MAP[it.exerciseId];
  const per = e.mode === 'reps' ? it.target * (e.secPerRep ?? 3.5) : it.target;
  const sides = e.unilateral ? 2 : 1;
  return it.sets * (per * sides + 12 * sides);
}

export function estimateBlockSec(b: Block): number {
  if (!b.items.length) return 0;
  const work = sum(b.items.map(estimateItemSec));
  const rounds = Math.max(...b.items.map((i) => i.sets), 1);
  if (b.kind === 'warmup' || b.kind === 'cooldown' || b.kind === 'mobility') return work + b.items.length * 5;
  if (b.circuit) {
    const pairRests = (b.items.length - 1) * b.pairRest * rounds;
    const roundRests = (rounds - 1) * Math.max(...b.items.map((i) => i.rest));
    return work + pairRests + roundRests;
  }
  return work + sum(b.items.map((i) => (i.sets - 1) * i.rest));
}

export function estimatePlanSec(blocks: Block[]): number {
  return Math.round(sum(blocks.map(estimateBlockSec)));
}

function pick(ids: string[], ok: (e: Exercise) => boolean): Exercise[] {
  return ids.map((id) => EXERCISE_MAP[id]).filter(ok);
}

export function lastStrength(sessions: Session[]): Session | undefined {
  return [...sessions].filter((s) => STRENGTH.includes(s.kind)).sort((a, b) => b.date.localeCompare(a.date))[0];
}

function consecutiveActiveDays(sessions: Session[], activities: Activity[], today: Date): number {
  const days = new Set([...sessions.map((s) => dayKey(s.date)), ...activities.map((a) => dayKey(a.date))]);
  let n = 0;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(dayKey(d))) n++;
    else break;
  }
  return n;
}

export const CARDIO_TYPES = ['laufen', 'radfahren', 'peloton', 'schwimmen', 'wandern', 'gehen'];

export function cardioMinutesThisWeek(activities: Activity[], today: Date): number {
  return sum(activities.filter((a) => CARDIO_TYPES.includes(a.type) && daysBetween(a.date, today) < 7 && daysBetween(a.date, today) >= 0).map((a) => a.durationMin));
}

export function generatePlan(ctx: Context, opts: PlanOptions): Plan {
  const today = ctx.today ?? new Date();
  const { profile } = ctx;
  const phase = currentPhase(profile, today);
  const safety = evaluateCheckIn(ctx.checkin);
  const ready = readiness(ctx.checkin);
  const rules = profileRules(profile);
  const equipment = equipmentFor(profile, opts.location, opts.extraEquipment);
  const rationale: string[] = [];
  const warnings: string[] = [...safety.messages];
  const base = { phase, location: opts.location, safety, warnings, rationale };

  if (safety.status === 'notfall' || safety.status === 'arzt' || safety.status === 'pause') {
    return { ...base, kind: 'pause', title: 'Heute: Pause', subtitle: 'Gesundheit geht vor', minutes: 0, estimatedSec: 0, blocks: [] };
  }

  const ls = lastStrength(ctx.sessions);
  const daysSinceStrength = ls ? daysBetween(ls.date, today) : 99;
  const lastAny = [...ctx.sessions].sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysSinceAny = lastAny ? daysBetween(lastAny.date, today) : 99;
  const streak = consecutiveActiveDays(ctx.sessions, ctx.activities, today);
  const trainedToday = ctx.sessions.some((s) => daysBetween(s.date, today) === 0 && STRENGTH.includes(s.kind));

  // ── Art der Einheit bestimmen ──
  let kind: SessionKind;
  let mode = opts.mode;
  if (mode === 'mobility') kind = 'mobility';
  else if (mode === 'kraft' || mode === 'hotel' || mode === 'draussen') {
    kind = ls?.kind === 'kraft_a' ? 'kraft_b' : 'kraft_a';
    if (rules.gentle) warnings.push('Wegen deiner Angaben ist Krafttraining erst nach ärztlicher Abstimmung empfohlen. Wähle eine leichte Belastung und höre auf deinen Körper.');
  } else if (rules.gentle) {
    kind = 'mobility';
    mode = 'mobility';
    rationale.push('Wegen deiner Angaben schlägt FORMA derzeit nur sanfte Einheiten vor. Krafttraining bitte mit deiner Ärztin oder deinem Arzt abstimmen und danach die Freigabe im Profil bestätigen.');
  } else {
    if (streak >= 6) {
      rationale.push(`${streak} aktive Tage in Folge – ein Ruhetag sichert die Anpassung. Optional: 10 Minuten lockere Mobilität.`);
      kind = 'mobility';
      mode = 'mobility';
    } else if (ready.level === 'niedrig') {
      rationale.push(`Tagesform niedrig (${ready.reasons.join(', ')}) – heute Mobilität & Regeneration statt Krafttraining.`);
      kind = 'mobility';
    } else if (trainedToday) {
      rationale.push('Krafteinheit heute bereits erledigt – ergänzend Mobilität & Balance.');
      kind = 'mobility';
    } else if (daysSinceStrength >= 2) {
      kind = ls?.kind === 'kraft_a' ? 'kraft_b' : 'kraft_a';
      if (daysSinceStrength >= 2 && daysSinceStrength < 99) rationale.push(`${daysSinceStrength} Tage seit der letzten Krafteinheit – Muskulatur ist erholt.`);
      if (!ls) rationale.push('Erste Krafteinheit – Fokus auf saubere Technik.');
    } else {
      kind = 'mobility';
      rationale.push('Gestern Kraft – heute aktive Erholung mit Balance und Mobilität (48 h zwischen Krafteinheiten).');
    }
  }

  if (daysSinceAny >= 2 && daysSinceAny < 99 && profile.daysPerWeek >= 5)
    rationale.push('Trainingspause bemerkt – kein Nachholen nötig, der Plan läuft einfach von hier weiter.');

  // ── Umfang ──
  let sets = phase.sets;
  const reentry = daysSinceStrength >= 8 && daysSinceStrength < 99;
  if (phase.deload) rationale.push(`Woche ${phase.week}: Entlastungswoche – weniger Sätze, mehr Reserve.${phase.retest ? ' Guter Zeitpunkt für den Re-Test.' : ''}`);
  if (reentry) {
    sets = Math.min(sets, 2);
    rationale.push(`Wiedereinstieg nach ${daysSinceStrength} Tagen: Ziele heute ca. 20 % niedriger, damit der Körper sich wieder gewöhnt.`);
  }
  if (ready.level === 'mittel' && kind !== 'mobility') {
    sets = Math.max(2, sets - 1);
    rationale.push(`Tagesform mittel (${ready.reasons.join(', ')}) – ein Satz weniger, mindestens 3 Wdh. in Reserve lassen.`);
  }
  if (safety.status === 'angepasst') rationale.push('Beschwerden berücksichtigt – betroffene Übungen werden ersetzt oder ausgelassen.');

  const allowed = (e: Exercise) => exerciseAllowed(e, profile, safety).ok;

  const pathItem = (path: PathId, s: number): PlanItem | null => {
    const st = ctx.states[path];
    const lvl = st?.level ?? 0;
    const r = resolve(path, lvl, equipment, allowed);
    if (!r) return null;
    const e = r.exercise;
    let target = st && r.level === lvl ? st.target : initialTarget(e);
    if (reentry) target = Math.max(e.range[0], Math.round(target * 0.8));
    target = clamp(target, e.range[0], e.range[1]);
    const note = r.level < lvl ? (r.limited ? 'Leichtere Variante (Equipment/Beschwerden)' : undefined) : undefined;
    const rest = Math.round(e.rest * (phase.deload ? 0.9 : 1));
    return { exerciseId: e.id, path, level: r.level, target, sets: s, rest, note };
  };

  const blocks: Block[] = [];
  const minutes = opts.minutes;
  const budget = minutes * 60;

  // ── Aufwärmen ──
  const warmIds = minutes <= 5 ? ['march'] : minutes <= 15 ? ['march', 'arm_circles', 'good_morning'] : ['march', 'arm_circles', 'hip_circles', 'good_morning', 'half_squat', 'cat_cow'];
  const warm: Block = {
    label: 'Aufwärmen', kind: 'warmup', circuit: false, pairRest: 0,
    items: pick(warmIds, allowed).map((e) => ({ exerciseId: e.id, target: e.mode === 'reps' ? e.range[0] : e.range[0], sets: 1, rest: 0 })),
  };
  if (kind !== 'mobility') blocks.push(warm);

  const focus = new Set(ctx.focus ?? []);
  const mobilityPool = (): string[] => {
    const ids = ['cat_cow', 'worlds_greatest', 'open_book', 'hip_flexor_stretch', 'wall_slide', 'ankle_knee_to_wall', 'hamstring_towel', 'doorway_pec', 'hip_90_90', 'towel_dislocate', 'chin_tuck', 'child_pose'];
    const pri: string[] = [];
    if (focus.has('schulter')) pri.push('wall_slide', 'towel_dislocate');
    if (focus.has('huefte')) pri.push('hip_flexor_stretch', 'hamstring_towel', 'hip_90_90');
    if (focus.has('sprunggelenk')) pri.push('ankle_knee_to_wall');
    return [...new Set([...pri, ...ids])];
  };

  if (kind === 'kraft_a' || kind === 'kraft_b') {
    const s = phase.deload ? 2 : sets;
    const main: [PathId, PathId][] = kind === 'kraft_a' ? [['squat', 'push'], ['row', 'plank']] : [['hinge', 'pike'], ['vpull', 'side']];
    const extras: PathId[] = kind === 'kraft_a' ? ['balance', 'calf', 'back'] : ['balance', 'push', 'back'];
    for (const [i, pair] of main.entries()) {
      const items = pair.map((p) => pathItem(p, s)).filter((x): x is PlanItem => !!x);
      if (items.length) blocks.push({ label: `Hauptteil ${i + 1}`, kind: 'main', items, circuit: items.length > 1, pairRest: 30 });
    }
    const exItems = extras.map((p) => pathItem(p, 2)).filter((x): x is PlanItem => !!x);
    if (exItems.length) blocks.push({ label: 'Ergänzung', kind: 'extra', items: exItems, circuit: true, pairRest: 20 });
    const cool = pick(mobilityPool().slice(0, minutes >= 30 ? 4 : 2), allowed).map((e) => ({ exerciseId: e.id, target: e.range[0], sets: 1, rest: 0 }));
    blocks.push({ label: 'Ausklang', kind: 'cooldown', items: cool, circuit: false, pairRest: 0 });
    if (minutes >= 45) {
      const mob = pick(mobilityPool().slice(2, 8), allowed).map((e) => ({ exerciseId: e.id, target: e.range[1], sets: 1, rest: 0 }));
      blocks.splice(blocks.length - 1, 0, { label: 'Mobilität', kind: 'mobility', items: mob, circuit: false, pairRest: 0 });
    }
    fitToBudget(blocks, budget);
    if (minutes <= 5) {
      // Minimum: nur ein Zirkel ohne Ergänzung
      kind = 'minimum';
    }
  } else {
    // Mobility & Balance & Rumpf (aktive Erholung)
    const balance = pathItem('balance', 2);
    const back = pathItem('back', 2);
    const calf = pathItem('calf', 2);
    const mob = pick(mobilityPool(), allowed).map((e) => ({ exerciseId: e.id, target: e.mode === 'hold' ? e.range[0] : e.range[0], sets: 1, rest: 0 }));
    blocks.push({ label: 'Mobilität', kind: 'mobility', items: mob.slice(0, 3), circuit: false, pairRest: 0 });
    const stab = [balance, back, calf].filter((x): x is PlanItem => !!x).map((x) => ({ ...x, rest: 30 }));
    if (stab.length && ready.level !== 'niedrig') blocks.push({ label: 'Balance & Haltung', kind: 'extra', items: stab, circuit: true, pairRest: 15 });
    blocks.push({ label: 'Ausklang', kind: 'cooldown', items: mob.slice(3), circuit: false, pairRest: 0 });
    fitToBudget(blocks, budget);
  }

  const est = estimatePlanSec(blocks);

  // ── Ausdauer-Empfehlung ──
  const cardioMin = cardioMinutesThisWeek(ctx.activities, today);
  let cardio: string | undefined;
  const z = profile.hr.z1Bike ? `${profile.hr.z1Bike[0]}–${profile.hr.z1Bike[1]}/min` : 'lockeres Tempo, Unterhaltung möglich';
  if (cardioMin < 150) {
    cardio = `Ausdauer diese Woche: ${cardioMin} von 150 min. ${kind === 'mobility' ? 'Heute passt' : 'Optional zusätzlich'}: 30 min Rad/Peloton im Grundlagenbereich (${z}).`;
  } else cardio = `Ausdauer diese Woche: ${cardioMin} min – Ziel von 150 min erreicht.`;
  if (rules.noIntervals) cardio += ' Ohne ärztliche Freigabe keine hochintensiven Intervalle.';
  if (rules.pulseUnreliable) cardio += ' Pulszonen sind bei deinen Medikamenten unzuverlässig – steuere nach Gefühl (du kannst dich noch unterhalten).';

  const titles: Record<string, string> = {
    kraft_a: 'Kraft A · Beine, Drücken, Rudern',
    kraft_b: 'Kraft B · Hüfte, Schulter, Rumpf',
    minimum: 'Minimum · Kraft kompakt',
    mobility: 'Mobilität & Balance',
  };
  const subtitle = `${phase.name} · Woche ${phase.week}${opts.location === 'hotel' ? ' · Hotel' : opts.location === 'draussen' ? ' · Draußen' : ''}`;
  return { ...base, kind, title: titles[kind] ?? 'Training', subtitle, minutes, estimatedSec: est, blocks: blocks.filter((b) => b.items.length), cardio };
}

/** Kürzt den Plan, bis er ins Zeitbudget passt (Priorität: Hauptteil 1 > Hauptteil 2 > Ergänzung). */
export function fitToBudget(blocks: Block[], budget: number) {
  const total = () => estimatePlanSec(blocks);
  const by = (k: Block['kind']) => blocks.filter((b) => b.kind === k);
  // 1. Mobilitätsblock (nur 45 min) kürzen
  for (const b of by('mobility')) while (total() > budget && b.items.length > 2) b.items.pop();
  // 2. Ergänzungen reduzieren
  for (const b of by('extra')) while (total() > budget && b.items.length > 0) b.items.pop();
  // 3. Cooldown auf 1 Übung
  for (const b of by('cooldown')) while (total() > budget && b.items.length > 1) b.items.pop();
  // 4. Sätze im Hauptteil auf 2 reduzieren
  for (const b of [...by('main')].reverse()) for (const it of b.items) if (total() > budget && it.sets > 2) it.sets -= 1;
  // 5. Aufwärmen auf 2 Übungen, Ausklang streichen
  for (const b of by('warmup')) while (total() > budget && b.items.length > 2) b.items.pop();
  for (const b of by('cooldown')) if (total() > budget) b.items = [];
  // 6. Hauptteil 2 auf 1 Satz, dann ganz streichen
  const mains = by('main');
  for (const it of mains[mains.length - 1]?.items ?? []) if (total() > budget && mains.length > 1 && it.sets > 1) it.sets -= 1;
  while (total() > budget && mains.length > 1) mains.pop()!.items = [];
  // 7. Hauptteil 1 auf 1 Satz, Aufwärmen minimal
  for (const it of mains[0]?.items ?? []) if (total() > budget && it.sets > 1) it.sets -= 1;
  for (const b of by('warmup')) while (total() > budget && b.items.length > 1) b.items.pop();
  // 8. Pausen kürzen (Minimum-Workout)
  if (total() > budget) for (const b of blocks) { b.pairRest = Math.min(b.pairRest, 10); for (const it of b.items) it.rest = Math.min(it.rest, 30); }
  // Bei viel Zeit: Ergänzung mit 3 Sätzen
  if (total() < budget * 0.75) for (const b of by('extra')) for (const it of b.items) if (total() + 60 < budget) it.sets = 3;
}

// ───────────────────────── Ablauf für den Player ─────────────────────────

export type Step =
  | { t: 'work'; block: string; blockKind: Block['kind']; exerciseId: string; path?: PathId; level?: number; set: number; sets: number; target: number; side?: 'L' | 'R'; itemIndex: number }
  | { t: 'rest'; sec: number; next: string };

export function flatten(plan: Pick<Plan, 'blocks'>): Step[] {
  const steps: Step[] = [];
  let itemIndex = 0;
  for (const b of plan.blocks) {
    const items = b.items.map((it) => ({ it, idx: itemIndex++ }));
    const rounds = Math.max(...b.items.map((i) => i.sets), 1);
    const push = (it: PlanItem, idx: number, set: number) => {
      const e = EXERCISE_MAP[it.exerciseId];
      const sides: ('L' | 'R' | undefined)[] = e.unilateral ? ['L', 'R'] : [undefined];
      sides.forEach((side, si) => {
        steps.push({ t: 'work', block: b.label, blockKind: b.kind, exerciseId: it.exerciseId, path: it.path, level: it.level, set, sets: it.sets, target: it.target, side, itemIndex: idx });
        if (side === 'L' && si === 0) steps.push({ t: 'rest', sec: b.kind === 'main' || b.kind === 'extra' ? 10 : 5, next: `${e.name} · rechts` });
      });
    };
    if (b.circuit) {
      for (let r = 1; r <= rounds; r++) {
        items.forEach(({ it, idx }, i) => {
          if (r > it.sets) return;
          push(it, idx, r);
          const isLastInRound = i === items.length - 1 || items.slice(i + 1).every(({ it: x }) => r > x.sets);
          const isLast = r === rounds && isLastInRound;
          if (!isLast) {
            const nextName = isLastInRound ? EXERCISE_MAP[items[0].it.exerciseId].name : EXERCISE_MAP[items[i + 1].it.exerciseId].name;
            steps.push({ t: 'rest', sec: isLastInRound ? it.rest : b.pairRest, next: nextName });
          }
        });
      }
    } else {
      for (const { it, idx } of items) {
        for (let s = 1; s <= it.sets; s++) {
          push(it, idx, s);
          if (s < it.sets && it.rest > 0) steps.push({ t: 'rest', sec: it.rest, next: EXERCISE_MAP[it.exerciseId].name });
        }
      }
    }
    if (b.kind === 'main' || b.kind === 'extra') steps.push({ t: 'rest', sec: 45, next: 'Nächster Block' });
  }
  // Pausen am Ende/aufeinanderfolgende Pausen bereinigen
  const out: Step[] = [];
  for (const s of steps) {
    if (s.t === 'rest' && (out.length === 0 || out[out.length - 1].t === 'rest')) continue;
    out.push(s);
  }
  while (out.length && out[out.length - 1].t === 'rest') out.pop();
  // Ziel der Pause auf die tatsächlich folgende Übung setzen
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    const n = out[i + 1];
    if (s.t === 'rest' && n && n.t === 'work') s.next = `${EXERCISE_MAP[n.exerciseId].name}${n.side ? (n.side === 'L' ? ' · links' : ' · rechts') : ''}`;
  }
  return out;
}

export function planSummary(plan: Plan): string[] {
  const names: string[] = [];
  for (const b of plan.blocks) if (b.kind === 'main' || b.kind === 'extra' || (plan.kind === 'mobility' && b.kind !== 'cooldown')) for (const it of b.items) names.push(EXERCISE_MAP[it.exerciseId].name);
  return names;
}

export { PATHS };
