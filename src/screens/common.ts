import type { Data } from '../state';
import type { Context } from '../domain/planner';
import { dayKey } from '../domain/util';

export function planContext(d: Data, today = new Date()): Context {
  return {
    profile: d.profile!,
    states: d.states,
    sessions: d.sessions,
    activities: d.activities,
    checkin: d.checkins.find((c) => c.date === dayKey(today)),
    focus: d.assessments[0]?.focus,
    today,
  };
}

export function age(birthYear: number, today = new Date()) {
  return today.getFullYear() - birthYear;
}

export function latestWeight(d: Data): number | undefined {
  return d.measurements.find((m) => m.weightKg !== undefined)?.weightKg ?? d.profile?.startWeightKg;
}

export function greeting(now = new Date()) {
  return now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
