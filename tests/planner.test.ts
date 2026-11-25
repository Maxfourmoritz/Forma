import { describe, expect, it } from 'vitest';
import { estimatePlanSec, flatten, generatePlan } from '../src/domain/planner';
import { EXERCISE_MAP } from '../src/domain/exercises';
import { profile, session, states } from './fixtures';

const today = new Date(2026, 10, 25, 7, 0);
const ctx = (o = {}) => ({ profile: profile(), states: states(), sessions: [], activities: [], today, ...o });

describe('Tagesplan', () => {
  it('erste Einheit ist Kraft A', () => {
    const p = generatePlan(ctx(), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(p.kind).toBe('kraft_a');
    expect(p.blocks.some((b) => b.kind === 'main')).toBe(true);
  });

  for (const m of [5, 10, 15, 20, 30, 45]) {
    it(`passt ins Zeitbudget ${m} min (±25 %)`, () => {
      const p = generatePlan(ctx(), { minutes: m, mode: 'kraft', location: 'zuhause' });
      const est = estimatePlanSec(p.blocks);
      expect(est).toBeLessThanOrEqual(m * 60 * 1.25);
      if (m >= 10) expect(est).toBeGreaterThanOrEqual(m * 60 * 0.5);
      expect(flatten(p).filter((s) => s.t === 'work').length).toBeGreaterThan(1);
    });
  }

  it('Tag nach Kraft → Mobilität', () => {
    const p = generatePlan(ctx({ sessions: [session('2026-11-24T07:00:00')] }), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(p.kind).toBe('mobility');
  });

  it('48 h nach Kraft A → Kraft B', () => {
    const p = generatePlan(ctx({ sessions: [session('2026-11-23T07:00:00', 'kraft_a')] }), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(p.kind).toBe('kraft_b');
  });

  it('Wiedereinstieg nach langer Pause wird erklärt', () => {
    const p = generatePlan(ctx({ sessions: [session('2026-11-10T07:00:00', 'kraft_a')] }), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(p.rationale.join(' ')).toMatch(/Wiedereinstieg/);
  });

  it('Warnsymptom → keine Einheit', () => {
    const p = generatePlan(ctx({ checkin: { date: '2026-11-25', sleepQuality: 4, energy: 4, soreness: 0, pains: [], warnings: ['brustschmerz'] } }), { minutes: 15, mode: 'kraft', location: 'zuhause' });
    expect(p.kind).toBe('pause');
    expect(p.blocks.length).toBe(0);
  });

  it('Knieschmerz 5/10 → keine Übung mit Kniebelastung', () => {
    const p = generatePlan(ctx({ checkin: { date: '2026-11-25', sleepQuality: 4, energy: 4, soreness: 0, pains: [{ joint: 'knie', intensity: 5 }], warnings: [] } }), { minutes: 30, mode: 'kraft', location: 'zuhause' });
    for (const b of p.blocks) for (const it of b.items) expect(EXERCISE_MAP[it.exerciseId].joints.knie ?? 0).toBe(0);
  });

  it('schlechte Tagesform → Mobilität', () => {
    const p = generatePlan(ctx({ checkin: { date: '2026-11-25', sleepQuality: 1, energy: 2, soreness: 1, pains: [], warnings: [] } }), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(p.kind).toBe('mobility');
  });

  it('Kopf-unten-Übungen gesperrt bis kardiologische Freigabe', () => {
    const st = states();
    st.pike = { ...st.pike!, level: 2 };
    const p = generatePlan(ctx({ profile: profile({ conditions: ['abklaerung_offen'], cardioClearance: 'ausstehend' }), states: st, sessions: [session('2026-11-23T07:00:00', 'kraft_a')] }), { minutes: 30, mode: 'auto', location: 'zuhause' });
    const ids = p.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).not.toContain('pike_pushup');
    expect(ids).toContain('incline_pike');
  });

  it('Hotel: nur Equipment, das im Zimmer vorhanden ist', () => {
    const p = generatePlan(ctx(), { minutes: 20, mode: 'hotel', location: 'hotel' });
    for (const b of p.blocks) for (const it of b.items) for (const q of EXERCISE_MAP[it.exerciseId].equipment) expect(['matte', 'wand', 'stuhl', 'handtuch', 'tuer', 'bank']).toContain(q);
  });

  it('Ablauf hat keine doppelten oder abschließenden Pausen', () => {
    const steps = flatten(generatePlan(ctx(), { minutes: 30, mode: 'kraft', location: 'zuhause' }));
    expect(steps[steps.length - 1].t).toBe('work');
    for (let i = 1; i < steps.length; i++) expect(steps[i].t === 'rest' && steps[i - 1].t === 'rest').toBe(false);
  });
});
