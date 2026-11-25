import { describe, expect, it } from 'vitest';
import { updatePath, initialState, nextStep, resolve } from '../src/domain/progression';
import { deriveLevels } from '../src/domain/assessment';
import { EXERCISE_MAP } from '../src/domain/exercises';
import type { ExerciseLog } from '../src/domain/types';
import { profile } from './fixtures';

const eq = ['matte', 'wand', 'stuhl', 'handtuch', 'tuer', 'bank'] as const;
const log = (id: string, reps: number[], o: Partial<ExerciseLog> = {}): ExerciseLog => ({ exerciseId: id, path: 'push', level: 1, sets: reps.map((r) => ({ reps: r, target: 10 })), rir: 2, form: 'sauber', ...o });

describe('Progression', () => {
  it('Ziel erreicht mit Reserve → +1', () => {
    const s = { ...initialState('push', 1), target: 10 };
    const u = updatePath('push', s, log('incline_pushup_high', [10, 11]), EXERCISE_MAP.incline_pushup_high, [...eq, 'tisch']);
    expect(u.state.target).toBe(11);
    expect(u.change).toBe('ziel+');
  });
  it('am Limit (RIR 0) → Ziel bleibt', () => {
    const s = { ...initialState('push', 1), target: 10 };
    expect(updatePath('push', s, log('incline_pushup_high', [10, 10], { rir: 0 }), EXERCISE_MAP.incline_pushup_high, [...eq]).state.target).toBe(10);
  });
  it('Obergrenze + 3 Einheiten → nächste Stufe', () => {
    let s = { ...initialState('push', 1), target: 15, sessionsAtLevel: 2 };
    const u = updatePath('push', s, log('incline_pushup_high', [15, 15]), EXERCISE_MAP.incline_pushup_high, [...eq, 'tisch']);
    expect(u.change).toBe('hoch');
    expect(u.state.level).toBe(2);
    s = u.state;
    expect(s.target).toBeGreaterThanOrEqual(EXERCISE_MAP.incline_pushup_low.range[0]);
  });
  it('Obergrenze, aber zu wenige Einheiten → bleibt', () => {
    const s = { ...initialState('push', 1), target: 15, sessionsAtLevel: 0 };
    expect(updatePath('push', s, log('incline_pushup_high', [15, 15]), EXERCISE_MAP.incline_pushup_high, [...eq]).state.level).toBe(1);
  });
  it('Beschwerden → sofort leichter', () => {
    const s = { ...initialState('push', 2), target: 10 };
    const u = updatePath('push', s, log('incline_pushup_low', [10, 10], { pain: true, level: 2 }), EXERCISE_MAP.incline_pushup_low, [...eq]);
    expect(u.state.level).toBe(1);
    expect(u.change).toBe('runter');
  });
  it('2× unsaubere Technik → leichter', () => {
    let s = { ...initialState('push', 2), target: 10 };
    s = updatePath('push', s, log('incline_pushup_low', [10], { form: 'unsauber' }), EXERCISE_MAP.incline_pushup_low, [...eq]).state;
    expect(s.level).toBe(2);
    s = updatePath('push', s, log('incline_pushup_low', [10], { form: 'unsauber' }), EXERCISE_MAP.incline_pushup_low, [...eq]).state;
    expect(s.level).toBe(1);
  });
  it('2× deutlich unter Minimum → leichter', () => {
    let s = { ...initialState('push', 3), target: 8 };
    s = updatePath('push', s, log('pushup', [4, 3]), EXERCISE_MAP.pushup, [...eq]).state;
    s = updatePath('push', s, log('pushup', [4, 3]), EXERCISE_MAP.pushup, [...eq]).state;
    expect(s.level).toBe(2);
  });
  it('Equipment-Auflösung: Klimmzug ohne Stange → Bauchlage-Latzug', () => {
    expect(resolve('vpull', 4, [...eq])!.exercise.id).toBe('prone_towel_pulldown');
    expect(nextStep('vpull', 0, [...eq])?.needs).toContain('stange');
  });
  it('Standortbestimmung leitet Stufen konservativ ab', () => {
    const fit = { pushVariant: 'boden', pushReps: 25, chairStand30s: 26, plankSec: 70, sidePlankKnees: false, sidePlankL: 50, sidePlankR: 48, singleLegL: 45, singleLegR: 45, eyesClosedL: 20, eyesClosedR: 20, bridgeSingleL: 15, bridgeSingleR: 15, proneYHoldSec: 45, toeTouch: 'boden' } as const;
    const open = deriveLevels(fit, profile(), [...eq]);
    expect(open.levels.push).toBe(4);
    expect(open.levels.squat).toBe(3);
    expect(open.levels.balance).toBe(3); // Einstieg ist generell nach oben begrenzt (kein Start mit Augen-zu/frei)
    const knee = deriveLevels(fit, profile({ conditions: ['knie_kreuzband'], kneeHistory: ['kreuzband'] }), [...eq]);
    expect(knee.levels.squat).toBeLessThanOrEqual(3); // Knie-OP → kein Split Squat zum Start
    const nerve = deriveLevels(fit, profile({ conditions: ['polyneuropathie'], neuropathy: true }), [...eq]);
    expect(nerve.levels.balance).toBeLessThanOrEqual(3); // Gefühlsstörungen → Balance begrenzt
  });
});
