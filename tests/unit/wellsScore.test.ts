import { describe, expect, it } from 'vitest';
import { computeWellsScore } from '../../server/services/scoring/wellsScore';

describe('computeWellsScore (Wells PE)', () => {
  const noRisk = { clinicalSignsDVT: false, peDiagnosisMostLikely: false, heartRate100: false, immobilizationOrSurgery: false, previousDVTPE: false, hemoptysis: false, malignancy: false };

  it('returns 0 and Low risk for no criteria', () => {
    const r = computeWellsScore(noRisk);
    expect(r.score).toBe(0);
    expect(r.riskCategory).toBe('Low');
  });

  it('returns High risk for clinical DVT signs + PE most likely (6 points)', () => {
    const r = computeWellsScore({ ...noRisk, clinicalSignsDVT: true, peDiagnosisMostLikely: true });
    expect(r.score).toBe(6);
    expect(r.riskCategory).toBe('High');
  });

  it('scores heart rate 100 as 1.5 points', () => {
    const r = computeWellsScore({ ...noRisk, heartRate100: true });
    expect(r.score).toBe(1.5);
    expect(r.riskCategory).toBe('Moderate');
  });

  it('prior DVT/PE adds 1.5 points', () => {
    const r = computeWellsScore({ ...noRisk, previousDVTPE: true });
    expect(r.score).toBe(1.5);
  });

  it('hemoptysis adds 1 point', () => {
    const r = computeWellsScore({ ...noRisk, hemoptysis: true });
    expect(r.score).toBe(1);
  });

  it('malignancy adds 1 point', () => {
    const r = computeWellsScore({ ...noRisk, malignancy: true });
    expect(r.score).toBe(1);
  });

  it('max score (all positive) is 12.5', () => {
    const r = computeWellsScore({ clinicalSignsDVT: true, peDiagnosisMostLikely: true, heartRate100: true, immobilizationOrSurgery: true, previousDVTPE: true, hemoptysis: true, malignancy: true });
    expect(r.score).toBe(12.5);
    expect(r.riskCategory).toBe('High');
  });

  it('components array has 7 entries', () => {
    const r = computeWellsScore(noRisk);
    expect(r.components).toHaveLength(7);
  });
});
