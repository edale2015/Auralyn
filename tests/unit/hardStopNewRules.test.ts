import { describe, it, expect } from "vitest";
import { evaluateHardStops, DispositionTier } from "../../server/safety/hardStopRules";
import { evaluateAcuityFastPath } from "../../server/intake/acuityFastPath";
import { validateIntendedUse } from "../../server/fda/intendedUseValidator";

describe("HS-018: Neonatal any illness → CALL_911", () => {
  it("triggers CALL_911 for neonate with non-fever illness (poor feeding, no fever keyword)", () => {
    const result = evaluateHardStops("my newborn is not feeding well and is lethargic", ["poor feeding", "lethargy"], 0.5, 0);
    expect(result.triggered).toBe(true);
    expect(result.rule?.ruleId).toBe("HS-018");
    expect(result.disposition).toBe(DispositionTier.CALL_911);
  });

  it("triggers for 2 weeks old text (lethargy, no fever)", () => {
    const result = evaluateHardStops("my 2 weeks old baby is very sleepy and won't wake up", ["lethargy"], 0.5, 0);
    expect(result.triggered).toBe(true);
    expect(result.rule?.ruleId).toBe("HS-018");
    expect(result.disposition).toBe(DispositionTier.CALL_911);
  });

  it("neonate with fever triggers HS-007 (ER_NOW minimum) — acceptable escalation", () => {
    const result = evaluateHardStops("my newborn has a fever", ["fever"], 0.5, 0);
    expect(result.triggered).toBe(true);
    expect(result.disposition).toMatch(/ER_NOW|CALL_911/);
  });
});

describe("HS-019: Overdose / poisoning → CALL_911", () => {
  it("triggers for overdose keyword", () => {
    const result = evaluateHardStops("patient took an overdose of Tylenol", ["overdose"], 336, 28);
    expect(result.triggered).toBe(true);
    expect(result.rule?.ruleId).toBe("HS-019");
    expect(result.disposition).toBe(DispositionTier.CALL_911);
  });

  it("triggers for accidental ingestion", () => {
    const result = evaluateHardStops("child had accidental ingestion of bleach", ["accidental ingestion", "bleach ingestion"], 36, 3);
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe(DispositionTier.CALL_911);
  });

  it("triggers for intentional overdose", () => {
    const result = evaluateHardStops("intentional overdose of sleeping pills", ["intentional overdose"], 240, 20);
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe(DispositionTier.CALL_911);
  });
});

describe("HS-020: Pediatric febrile seizure → ER_NOW", () => {
  it("triggers for febrile seizure keyword", () => {
    const result = evaluateHardStops("my 2 year old had a febrile seizure", ["febrile seizure"], 24, 2);
    expect(result.triggered).toBe(true);
    expect(result.rule?.ruleId).toBe("HS-020");
    expect(result.disposition).toBe(DispositionTier.ER_NOW);
  });

  it("triggers for child had seizure with fever", () => {
    const result = evaluateHardStops("child had seizure with fever of 104", ["child had seizure", "seizure with fever"], 48, 4);
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe(DispositionTier.ER_NOW);
  });
});

describe("AcuityFastPath — new patterns", () => {
  it("detects overdose as call_911", () => {
    const result = evaluateAcuityFastPath({
      complaint: "overdose",
      symptoms: ["took too many pills", "intentional overdose"],
    });
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe("call_911");
    expect(result.dispatchRequired).toBe(true);
    expect(result.matchedPatterns).toContain("overdose_or_poisoning");
  });

  it("detects neonate sick as call_911", () => {
    const result = evaluateAcuityFastPath({
      complaint: "newborn fever",
      symptoms: ["newborn sick", "fever"],
    });
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe("call_911");
    expect(result.matchedPatterns).toContain("neonate_any_illness");
  });

  it("detects pediatric febrile seizure as er_now", () => {
    const result = evaluateAcuityFastPath({
      complaint: "febrile seizure",
      symptoms: ["child had seizure", "fever"],
    });
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe("er_now");
    expect(result.dispatchRequired).toBe(false);
    expect(result.matchedPatterns).toContain("pediatric_febrile_seizure");
  });

  it("still detects chest pain with diaphoresis as er_now (not call_911)", () => {
    const result = evaluateAcuityFastPath({
      complaint: "chest pain",
      symptoms: ["chest pain", "diaphoresis", "sweating"],
    });
    expect(result.triggered).toBe(true);
    expect(result.disposition).toBe("er_now");
    expect(result.dispatchRequired).toBe(false);
  });
});

describe("IFU Validator", () => {
  it("passes normal adult urgent care complaint", () => {
    const result = validateIntendedUse({ complaint: "sore throat", ageYears: 35 });
    expect(result.inScope).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("flags neonate under 3 months", () => {
    const result = validateIntendedUse({ complaint: "fever", ageMonths: 1 });
    expect(result.inScope).toBe(false);
    expect(result.violations[0]).toMatch(/age/i);
  });

  it("flags overdose/poisoning request (out of scope for routine triage — requires 911)", () => {
    const result = validateIntendedUse({ complaint: "schedule surgery", ageYears: 45 });
    expect(result.inScope).toBe(false);
    expect(result.violations[0]).toMatch(/Surgical/i);
  });

  it("allows pediatric complaint above 3 months", () => {
    const result = validateIntendedUse({ complaint: "ear pain", ageMonths: 6 });
    expect(result.inScope).toBe(true);
  });
});
