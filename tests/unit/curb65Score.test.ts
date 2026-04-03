import { describe, expect, it } from 'vitest';
import { computeCURB65Score } from '../../server/services/scoring/curb65Score';

const allNegative = {
  confusion: false,
  ureaNitrogenMgdLGreaterThan19: false,
  respiratoryRateGreaterThan30: false,
  bloodPressureLow: false,
  age65OrOlder: false,
};

describe('computeCURB65Score', () => {
  it('returns score 0 for no criteria — outpatient treatment', () => {
    const r = computeCURB65Score(allNegative);
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/outpatient/i);
  });

  it('returns score 5 for all criteria — high risk, hospital admission', () => {
    const r = computeCURB65Score({ confusion: true, ureaNitrogenMgdLGreaterThan19: true, respiratoryRateGreaterThan30: true, bloodPressureLow: true, age65OrOlder: true });
    expect(r.score).toBe(5);
    expect(r.recommendation).toMatch(/hospital/i);
    expect(r.recommendation).toMatch(/ICU/i);
  });

  it('score 2 is moderate risk — consider admission', () => {
    const r = computeCURB65Score({ ...allNegative, confusion: true, ureaNitrogenMgdLGreaterThan19: true });
    expect(r.score).toBe(2);
    expect(r.recommendation).toMatch(/moderate/i);
  });

  it('confusion alone scores 1 — low risk', () => {
    const r = computeCURB65Score({ ...allNegative, confusion: true });
    expect(r.score).toBe(1);
  });

  it('age ≥65 alone scores 1', () => {
    const r = computeCURB65Score({ ...allNegative, age65OrOlder: true });
    expect(r.score).toBe(1);
  });

  it('maxScore is 5', () => {
    const r = computeCURB65Score(allNegative);
    expect(r.maxScore).toBe(5);
  });

  it('has exactly 5 components', () => {
    const r = computeCURB65Score(allNegative);
    expect(r.components).toHaveLength(5);
  });

  it('score 3 recommends hospital admission', () => {
    const r = computeCURB65Score({ ...allNegative, confusion: true, respiratoryRateGreaterThan30: true, bloodPressureLow: true });
    expect(r.score).toBe(3);
    expect(r.recommendation).toMatch(/hospital/i);
  });
});
