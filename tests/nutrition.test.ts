import { describe, expect, it } from 'vitest';
import { estimateTargets, screeningFor } from './helpers';
import { profile } from './fixtures';

describe('Ernährung & Geschlecht', () => {
  it('Grundumsatz weiblich liegt 166 kcal unter männlich (Mifflin-St-Jeor)', () => {
    const m = estimateTargets(profile({ sex: 'maennlich' }), 80, 40);
    const w = estimateTargets(profile({ sex: 'weiblich' }), 80, 40);
    expect(m.bmr - w.bmr).toBe(166);
    expect(w.kcal).toBeLessThan(m.kcal);
    expect(w.protein).toBe(m.protein);
  });
  it('ohne Angabe wird der männliche Wert verwendet', () => {
    expect(estimateTargets(profile({ sex: undefined }), 80, 40).bmr).toBe(estimateTargets(profile({ sex: 'maennlich' }), 80, 40).bmr);
  });
  it('Screening enthält Schwangerschaftsfrage nur bei weiblich', () => {
    expect(screeningFor('weiblich').some((q) => q.id === 'schwanger')).toBe(true);
    expect(screeningFor('maennlich').some((q) => q.id === 'schwanger')).toBe(false);
    expect(screeningFor(undefined).some((q) => q.id === 'schwanger')).toBe(false);
  });
});
