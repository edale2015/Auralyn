import { describe, expect, it } from 'vitest';
import { computePERCRule } from '../../server/services/scoring/percRule';

const allNegative = {
  age50OrOlder: false,
  heartRate100OrHigher: false,
  spo2LessThan95: false,
  unilateralLegSwelling: false,
  hemoptysis: false,
  recentSurgeryOrTrauma: false,
  priorDVTorPE: false,
  estrogenUse: false,
};

describe('computePERCRule', () => {
  it('is PERC negative when all 8 criteria are absent', () => {
    const r = computePERCRule(allNegative);
    expect(r.score).toBe(0);
    expect(r.percNegative).toBe(true);
    expect(r.interpretation).toMatch(/PERC negative/i);
  });

  it('is PERC positive when any criterion is present', () => {
    const r = computePERCRule({ ...allNegative, age50OrOlder: true });
    expect(r.score).toBe(1);
    expect(r.percNegative).toBe(false);
    expect(r.interpretation).toMatch(/PERC positive/i);
  });

  it('counts all 8 criteria when all present', () => {
    const r = computePERCRule({
      age50OrOlder: true, heartRate100OrHigher: true, spo2LessThan95: true,
      unilateralLegSwelling: true, hemoptysis: true, recentSurgeryOrTrauma: true,
      priorDVTorPE: true, estrogenUse: true,
    });
    expect(r.score).toBe(8);
    expect(r.percNegative).toBe(false);
  });

  it('has exactly 8 components', () => {
    const r = computePERCRule(allNegative);
    expect(r.components).toHaveLength(8);
  });

  it('correctly identifies SpO2 <95% as a criterion', () => {
    const r = computePERCRule({ ...allNegative, spo2LessThan95: true });
    expect(r.score).toBe(1);
    expect(r.percNegative).toBe(false);
  });

  it('correctly identifies estrogen use as a criterion', () => {
    const r = computePERCRule({ ...allNegative, estrogenUse: true });
    expect(r.score).toBe(1);
    expect(r.percNegative).toBe(false);
  });
});
