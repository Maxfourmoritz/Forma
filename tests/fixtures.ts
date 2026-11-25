import type { Profile, Session } from '../src/domain/types';
import { defaultStates } from '../src/domain/assessment';

export function profile(o: Partial<Profile> = {}): Profile {
  return {
    sex: 'maennlich', birthYear: 1980, heightCm: 176, startWeightKg: 82, startWaistCm: 90,
    conditions: [], kneeHistory: [], kneeStatus: 'beschwerdefrei', neuropathy: false, cardioClearance: 'frei', bpMeds: false,
    hr: {}, equipmentHome: ['matte'], equipmentTravel: [], daysPerWeek: 5, defaultMinutes: 15,
    goals: {}, nutrition: { enabled: true }, programStart: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', ...o,
  };
}
export const states = defaultStates;
export function session(date: string, kind: Session['kind'] = 'kraft_a'): Session {
  return { id: date + kind, date, durationSec: 900, kind, title: kind, minutesPlanned: 15, location: 'zuhause', exercises: [] };
}
