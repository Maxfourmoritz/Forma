import { describe, expect, it } from 'vitest';
import { ALL_CONDITIONS, CONDITION_GROUPS, groupsFor, migrateProfile, profileRules, withConditions } from '../src/domain/conditions';
import { generatePlan } from '../src/domain/planner';
import { exerciseAllowed, evaluateCheckIn } from '../src/domain/safety';
import { EXERCISE_MAP } from '../src/domain/exercises';
import { profile, session, states } from './fixtures';

const today = new Date(2026, 10, 25, 7, 0);
const ctx = (p = profile(), o = {}) => ({ profile: p, states: states(), sessions: [], activities: [], today, ...o });
const items = (p: ReturnType<typeof generatePlan>) => p.blocks.flatMap((b) => b.items.map((i) => EXERCISE_MAP[i.exerciseId]));

describe('Katalog', () => {
  it('ist breit, eindeutig und vollständig beschriftet', () => {
    expect(CONDITION_GROUPS.length).toBeGreaterThanOrEqual(8);
    expect(ALL_CONDITIONS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ALL_CONDITIONS.map((c) => c.id)).size).toBe(ALL_CONDITIONS.length);
    expect(new Set(ALL_CONDITIONS.map((c) => c.label)).size).toBe(ALL_CONDITIONS.length);
    expect(ALL_CONDITIONS.every((c) => c.label.length > 3)).toBe(true);
  });
  it('geschlechtsspezifische Punkte nur bei weiblich', () => {
    const ids = (s?: 'maennlich' | 'weiblich') => groupsFor(s).flatMap((g) => g.items.map((c) => c.id));
    expect(ids('weiblich')).toContain('schwanger');
    expect(ids('maennlich')).not.toContain('schwanger');
    expect(ids(undefined)).not.toContain('wochenbett');
  });
});

describe('Regeln', () => {
  it('Bluthochdruck sperrt Kopf-unten dauerhaft, auch bei „Freigabe“', () => {
    expect(profileRules({ conditions: ['bluthochdruck'], cardioClearance: 'frei' }).noInverted).toBe(true);
  });
  it('Herzerkrankung: ohne Freigabe keine Intervalle/Kopf-unten, mit Freigabe frei', () => {
    const open = profileRules({ conditions: ['herzerkrankung'], cardioClearance: 'ausstehend' });
    expect(open.noIntervals && open.noInverted).toBe(true);
    const cleared = profileRules({ conditions: ['herzerkrankung'], cardioClearance: 'frei' });
    expect(cleared.noIntervals || cleared.noInverted).toBe(false);
  });
  it('Glaukom bleibt auch nach Freigabe gesperrt', () => {
    expect(profileRules({ conditions: ['glaukom', 'herzerkrankung'], cardioClearance: 'frei' }).noInverted).toBe(true);
  });
  it('ohne Angaben keine Einschränkung', () => {
    const r = profileRules({ conditions: [], cardioClearance: 'frei' });
    expect(r.noInverted || r.noIntervals || r.gentle || r.fallCare).toBe(false);
    expect(Object.keys(r.joints)).toHaveLength(0);
  });
  it('Auswahl hält Freigabestatus und abgeleitete Felder konsistent', () => {
    let p = withConditions(profile(), ['herzerkrankung']);
    expect(p.cardioClearance).toBe('ausstehend');
    p = { ...p, cardioClearance: 'frei' };
    p = withConditions(p, ['herzerkrankung', 'polyneuropathie', 'knie_kreuzband', 'med_betablocker']);
    expect(p.cardioClearance).toBe('frei');
    expect(p.neuropathy && p.bpMeds).toBe(true);
    expect(p.kneeHistory).toEqual(['kreuzband']);
    p = withConditions(p, []);
    expect(p.cardioClearance).toBe('frei');
    expect(p.neuropathy || p.bpMeds || p.kneeHistory.length > 0).toBe(false);
  });
  it('Essstörung blendet Kalorienfunktionen aus', () => {
    const p = withConditions(profile(), ['essstoerung']);
    expect(profileRules(p).noCalories).toBe(true);
    expect(p.nutrition.enabled).toBe(false);
  });
});

describe('Wirkung auf Übungen und Plan', () => {
  it('Schulter-Angabe sperrt anspruchsvolle Schulterübungen, lässt schonende zu', () => {
    const p = withConditions(profile(), ['schulter']);
    const safety = evaluateCheckIn(undefined);
    expect(exerciseAllowed(EXERCISE_MAP.archer_pushup, p, safety).ok).toBe(false);
    expect(exerciseAllowed(EXERCISE_MAP.wall_pushup, p, safety).ok).toBe(true);
  });
  it('Handgelenk-Angabe ersetzt Liegestütz am Boden durch wandnahe Varianten', () => {
    const p = withConditions(profile(), ['handgelenk']);
    const st = states(); st.push = { ...st.push!, level: 3 };
    for (const m of [20, 30, 45]) {
      const plan = generatePlan(ctx(p, { states: st }), { minutes: m, mode: 'kraft', location: 'zuhause' });
      expect(items(plan).every((e) => (e.joints.handgelenk ?? 0) <= 1)).toBe(true);
    }
  });
  it('Rücken-Angabe schließt Hohlkreuz-Übungen aus', () => {
    const p = withConditions(profile(), ['bandscheibe']);
    const st = states(); st.back = { ...st.back!, level: 2 };
    const plan = generatePlan(ctx(p, { states: st, sessions: [session('2026-11-23T07:00:00', 'kraft_a')] }), { minutes: 45, mode: 'auto', location: 'zuhause' });
    expect(items(plan).every((e) => (e.joints.lws ?? 0) <= 1)).toBe(true);
  });
  it('Schwangerschaft: automatisch nur sanfte Einheit, Krafttraining mit Warnhinweis; nach Freigabe normal', () => {
    const base = withConditions(profile({ sex: 'weiblich' }), ['schwanger']);
    const auto = generatePlan(ctx(base), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(auto.kind).toBe('mobility');
    expect(auto.rationale.join(' ')).toMatch(/sanfte/);
    const kraft = generatePlan(ctx(base), { minutes: 15, mode: 'kraft', location: 'zuhause' });
    expect(kraft.warnings.join(' ')).toMatch(/ärztlicher Abstimmung/);
    const cleared = generatePlan(ctx({ ...base, cardioClearance: 'frei' }), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(cleared.kind).toBe('kraft_a');
  });
  it('Pulssenkende Medikamente: Hinweis, nach Gefühl zu steuern', () => {
    const plan = generatePlan(ctx(withConditions(profile(), ['med_betablocker'])), { minutes: 15, mode: 'auto', location: 'zuhause' });
    expect(plan.cardio).toMatch(/nach Gefühl/);
  });
});

describe('Migration von Bestandsprofilen', () => {
  const old = profile({ conditions: undefined, neuropathy: true, bpMeds: true, kneeHistory: ['meniskus', 'kreuzband'], cardioClearance: 'ausstehend' });
  it('übernimmt bisherige Angaben und den Freigabestatus', () => {
    const m = migrateProfile(old)!;
    expect(m.conditions).toEqual(expect.arrayContaining(['polyneuropathie', 'med_betablocker', 'knie_meniskus', 'knie_kreuzband', 'abklaerung_offen']));
    expect(m.cardioClearance).toBe('ausstehend');
    expect(m.neuropathy && m.bpMeds).toBe(true);
    expect(profileRules(m).noIntervals).toBe(true);
  });
  it('lässt bereits migrierte Profile unverändert', () => {
    expect(migrateProfile(profile())).toBeNull();
  });
  it('Profil ohne Angaben bleibt ohne Einschränkung', () => {
    const m = migrateProfile(profile({ conditions: undefined }))!;
    expect(m.conditions).toEqual([]);
    expect(m.cardioClearance).toBe('frei');
  });
});
