import { describe, expect, it } from 'vitest';
import { computeOttawaAnkleRule, computeOttawaKneeRule } from '../../server/services/scoring/ottawaRules';

describe('Ottawa Ankle Rule', () => {
  const allNegative = {
    bonyTendernessPosteriorTipOrEdgeLateralMalleolus: false,
    bonyTendernessPosteriorTipOrEdgeMedialMalleolus: false,
    bonyTendernessBaseOf5thMetatarsal: false,
    bonyTendernessNavicular: false,
    inabilityToBearWeight4Steps: false,
    ageUnder18OrOver55: false,
  };

  it('returns Ottawa negative (no X-rays needed) when all criteria absent', () => {
    const r = computeOttawaAnkleRule(allNegative);
    expect(r.ankleXrayIndicated).toBe(false);
    expect(r.footXrayIndicated).toBe(false);
    expect(r.interpretation).toMatch(/NOT required/i);
  });

  it('indicates ankle X-ray for lateral malleolus tenderness', () => {
    const r = computeOttawaAnkleRule({ ...allNegative, bonyTendernessPosteriorTipOrEdgeLateralMalleolus: true });
    expect(r.ankleXrayIndicated).toBe(true);
    expect(r.ankleFindings).toHaveLength(1);
  });

  it('indicates foot X-ray for 5th metatarsal tenderness', () => {
    const r = computeOttawaAnkleRule({ ...allNegative, bonyTendernessBaseOf5thMetatarsal: true });
    expect(r.footXrayIndicated).toBe(true);
    expect(r.ankleXrayIndicated).toBe(false);
  });

  it('indicates both ankle and foot X-ray when unable to bear weight', () => {
    const r = computeOttawaAnkleRule({ ...allNegative, inabilityToBearWeight4Steps: true });
    expect(r.ankleXrayIndicated).toBe(true);
    expect(r.footXrayIndicated).toBe(true);
  });

  it('indicates foot X-ray for navicular tenderness', () => {
    const r = computeOttawaAnkleRule({ ...allNegative, bonyTendernessNavicular: true });
    expect(r.footXrayIndicated).toBe(true);
  });
});

describe('Ottawa Knee Rule', () => {
  const allNegative = {
    age55OrOlder: false,
    isolatedPatellaTenderness: false,
    tendernessFibularHead: false,
    inabilityToFlexTo90Degrees: false,
    inabilityToBearWeight4Steps: false,
  };

  it('returns Ottawa negative (no X-ray needed) when all criteria absent', () => {
    const r = computeOttawaKneeRule(allNegative);
    expect(r.kneeXrayIndicated).toBe(false);
    expect(r.interpretation).toMatch(/NOT required/i);
  });

  it('indicates X-ray for age ≥55', () => {
    const r = computeOttawaKneeRule({ ...allNegative, age55OrOlder: true });
    expect(r.kneeXrayIndicated).toBe(true);
    expect(r.positiveFindings).toContain('Age ≥55');
  });

  it('indicates X-ray when unable to bear weight', () => {
    const r = computeOttawaKneeRule({ ...allNegative, inabilityToBearWeight4Steps: true });
    expect(r.kneeXrayIndicated).toBe(true);
  });

  it('indicates X-ray for fibular head tenderness', () => {
    const r = computeOttawaKneeRule({ ...allNegative, tendernessFibularHead: true });
    expect(r.kneeXrayIndicated).toBe(true);
  });

  it('reports all positive findings', () => {
    const r = computeOttawaKneeRule({ age55OrOlder: true, isolatedPatellaTenderness: true, tendernessFibularHead: true, inabilityToFlexTo90Degrees: true, inabilityToBearWeight4Steps: true });
    expect(r.positiveFindings).toHaveLength(5);
    expect(r.kneeXrayIndicated).toBe(true);
  });
});
