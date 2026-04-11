import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Patient Memory Service ───────────────────────────────────────────────────
describe("patientMemoryService — longitudinal patient patterns", () => {
  it("extractPatientPatterns returns zero-rate for empty history", async () => {
    const { extractPatientPatterns } = await import("../../server/services/learning/patientMemoryService");
    const result = extractPatientPatterns([]);
    expect(result.antibioticResponseRate).toBe(0);
    expect(result.frequentReturner).toBe(false);
    expect(result.visitCount).toBe(0);
  });

  it("extractPatientPatterns computes correct antibioticResponseRate", async () => {
    const { extractPatientPatterns } = await import("../../server/services/learning/patientMemoryService");
    const history = [
      { id: 1, patient_id: "p1", complaint: "cough", antibiotics_given: true, improved_with_antibiotics: true,  return_visit: false, timestamp: new Date() },
      { id: 2, patient_id: "p1", complaint: "cough", antibiotics_given: true, improved_with_antibiotics: false, return_visit: false, timestamp: new Date() },
      { id: 3, patient_id: "p1", complaint: "cough", antibiotics_given: true, improved_with_antibiotics: true,  return_visit: false, timestamp: new Date() },
    ];
    const result = extractPatientPatterns(history as any);
    expect(result.antibioticResponseRate).toBeCloseTo(2 / 3);
    expect(result.visitCount).toBe(3);
    expect(result.frequentReturner).toBe(true);
  });

  it("extractPatientPatterns: frequentReturner = false for < 3 visits", async () => {
    const { extractPatientPatterns } = await import("../../server/services/learning/patientMemoryService");
    const history = [
      { id: 1, patient_id: "p1", complaint: "c", antibiotics_given: false, improved_with_antibiotics: null, return_visit: false, timestamp: new Date() },
      { id: 2, patient_id: "p1", complaint: "c", antibiotics_given: false, improved_with_antibiotics: null, return_visit: false, timestamp: new Date() },
    ];
    const result = extractPatientPatterns(history as any);
    expect(result.frequentReturner).toBe(false);
  });

  it("extractPatientPatterns: frequentReturner = true at exactly 3 visits", async () => {
    const { extractPatientPatterns } = await import("../../server/services/learning/patientMemoryService");
    const history = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1, patient_id: "p1", complaint: "c", antibiotics_given: false, improved_with_antibiotics: null, return_visit: false, timestamp: new Date(),
    }));
    const result = extractPatientPatterns(history as any);
    expect(result.frequentReturner).toBe(true);
  });

  it("getPatientHistory returns empty array gracefully when DB unavailable", async () => {
    const { getPatientHistory } = await import("../../server/services/learning/patientMemoryService");
    const result = await getPatientHistory("nonexistent-patient-xyz");
    expect(Array.isArray(result)).toBe(true);
  });

  it("antibioticResponseRate is 0 when no records have improved_with_antibiotics=true", async () => {
    const { extractPatientPatterns } = await import("../../server/services/learning/patientMemoryService");
    const history = [
      { id: 1, patient_id: "p1", complaint: "c", antibiotics_given: true, improved_with_antibiotics: false, return_visit: false, timestamp: new Date() },
      { id: 2, patient_id: "p1", complaint: "c", antibiotics_given: true, improved_with_antibiotics: null,  return_visit: false, timestamp: new Date() },
    ];
    const result = extractPatientPatterns(history as any);
    expect(result.antibioticResponseRate).toBe(0);
  });

  it("antibioticResponseRate is 1 when all records improved", async () => {
    const { extractPatientPatterns } = await import("../../server/services/learning/patientMemoryService");
    const history = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1, patient_id: "p1", complaint: "c", antibiotics_given: true, improved_with_antibiotics: true, return_visit: false, timestamp: new Date(),
    }));
    const result = extractPatientPatterns(history as any);
    expect(result.antibioticResponseRate).toBe(1);
  });
});

// ─── Population Learning Engine ───────────────────────────────────────────────
describe("populationLearningEngine — clinic-wide threshold adaptation", () => {
  it("getClinicThreshold returns 0.5 for unknown clinicId", async () => {
    const { getClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const t = getClinicThreshold("clinic-unknown-xyz-" + Math.random());
    expect(t).toBe(0.5);
  });

  it("updatePopulationStats with low success rate decreases threshold", async () => {
    const { updatePopulationStats, getClinicThreshold, resetClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const id = "clinic-low-success-" + Date.now();
    resetClinicThreshold(id, 0.5);
    await updatePopulationStats({ clinicId: id, antibioticSuccessRate: 0.1, returnVisitRate: 0.1 });
    expect(getClinicThreshold(id)).toBeLessThan(0.5);
  });

  it("updatePopulationStats with high return visit rate increases threshold", async () => {
    const { updatePopulationStats, getClinicThreshold, resetClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const id = "clinic-high-rv-" + Date.now();
    resetClinicThreshold(id, 0.5);
    await updatePopulationStats({ clinicId: id, antibioticSuccessRate: 0.6, returnVisitRate: 0.4 });
    expect(getClinicThreshold(id)).toBeGreaterThan(0.5);
  });

  it("threshold is clamped at minimum 0.3", async () => {
    const { updatePopulationStats, getClinicThreshold, resetClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const id = "clinic-clamp-min-" + Date.now();
    resetClinicThreshold(id, 0.3);
    for (let i = 0; i < 10; i++) {
      await updatePopulationStats({ clinicId: id, antibioticSuccessRate: 0.05, returnVisitRate: 0.05 });
    }
    expect(getClinicThreshold(id)).toBeGreaterThanOrEqual(0.3);
  });

  it("threshold is clamped at maximum 0.7", async () => {
    const { updatePopulationStats, getClinicThreshold, resetClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const id = "clinic-clamp-max-" + Date.now();
    resetClinicThreshold(id, 0.7);
    for (let i = 0; i < 10; i++) {
      await updatePopulationStats({ clinicId: id, antibioticSuccessRate: 0.8, returnVisitRate: 0.8 });
    }
    expect(getClinicThreshold(id)).toBeLessThanOrEqual(0.7);
  });

  it("resetClinicThreshold restores value to given level", async () => {
    const { resetClinicThreshold, getClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const id = "clinic-reset-" + Date.now();
    resetClinicThreshold(id, 0.6);
    expect(getClinicThreshold(id)).toBe(0.6);
  });
});

// ─── Personalization Engine ───────────────────────────────────────────────────
describe("personalizationEngine — comorbidity + history adjustment", () => {
  const basePattern = { antibioticResponseRate: 0, frequentReturner: false, visitCount: 1 };

  it("returns base probability when no comorbidities and default pattern", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: [], patientPattern: basePattern });
    expect(r.adjustedProbability).toBeCloseTo(0.4);
    expect(r.appliedAdjustments).toHaveLength(0);
  });

  it("immunocompromised adds +0.20", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: ["immunocompromised"], patientPattern: basePattern });
    expect(r.adjustedProbability).toBeCloseTo(0.6);
    expect(r.appliedAdjustments.some(a => a.includes("immunocompromised"))).toBe(true);
  });

  it("chronic_lung_disease adds +0.10", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: ["chronic_lung_disease"], patientPattern: basePattern });
    expect(r.adjustedProbability).toBeCloseTo(0.5);
    expect(r.appliedAdjustments.some(a => a.includes("chronic_lung_disease"))).toBe(true);
  });

  it("diabetes adds +0.10", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: ["diabetes"], patientPattern: basePattern });
    expect(r.adjustedProbability).toBeCloseTo(0.5);
  });

  it("strong antibiotic response history adds +0.10", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: [], patientPattern: { ...basePattern, antibioticResponseRate: 0.8 } });
    expect(r.adjustedProbability).toBeCloseTo(0.5);
    expect(r.appliedAdjustments.some(a => a.includes("historical antibiotic response"))).toBe(true);
  });

  it("frequentReturner adds +0.05", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: [], patientPattern: { ...basePattern, frequentReturner: true } });
    expect(r.adjustedProbability).toBeCloseTo(0.45);
    expect(r.appliedAdjustments.some(a => a.includes("frequent returner"))).toBe(true);
  });

  it("combined comorbidities stack correctly", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({
      baseProbability: 0.3,
      comorbidities: ["immunocompromised", "chronic_lung_disease"],
      patientPattern: { antibioticResponseRate: 0.8, frequentReturner: true, visitCount: 5 },
    });
    expect(r.adjustedProbability).toBeCloseTo(0.75);
  });

  it("probability is capped at 0.95", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({
      baseProbability: 0.9,
      comorbidities: ["immunocompromised", "chronic_lung_disease", "diabetes"],
      patientPattern: { antibioticResponseRate: 0.9, frequentReturner: true, visitCount: 10 },
    });
    expect(r.adjustedProbability).toBeLessThanOrEqual(0.95);
  });

  it("returns appliedAdjustments as array", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const r = personalizeDecision({ baseProbability: 0.4, comorbidities: [], patientPattern: basePattern });
    expect(Array.isArray(r.appliedAdjustments)).toBe(true);
  });
});

// ─── Simulation Engine ────────────────────────────────────────────────────────
describe("simulationEngine — synthetic population cohort", () => {
  it("runSimulation returns array of specified length", async () => {
    const { runSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(100);
    expect(results).toHaveLength(100);
  });

  it("each patient has centor, prob, decision, symptoms", async () => {
    const { runSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(10);
    for (const p of results) {
      expect(p).toHaveProperty("centor");
      expect(p).toHaveProperty("prob");
      expect(p).toHaveProperty("decision");
      expect(p).toHaveProperty("symptoms");
      expect(["ANTIBIOTIC", "NO_ANTIBIOTIC"]).toContain(p.decision);
    }
  });

  it("decision is ANTIBIOTIC when prob > 0.5", async () => {
    const { runSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(200);
    for (const p of results) {
      if (p.prob > 0.5)  expect(p.decision).toBe("ANTIBIOTIC");
      if (p.prob <= 0.5) expect(p.decision).toBe("NO_ANTIBIOTIC");
    }
  });

  it("prob is between 0 and 1 for all patients", async () => {
    const { runSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(50);
    for (const p of results) {
      expect(p.prob).toBeGreaterThanOrEqual(0);
      expect(p.prob).toBeLessThanOrEqual(1);
    }
  });

  it("age is 0-79 for all simulated patients", async () => {
    const { runSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(50);
    for (const p of results) {
      expect(p.symptoms.age).toBeGreaterThanOrEqual(0);
      expect(p.symptoms.age).toBeLessThan(80);
    }
  });

  it("summarizeSimulation returns correct totalRuns", async () => {
    const { runSimulation, summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(50);
    const summary = summarizeSimulation(results);
    expect(summary.totalRuns).toBe(50);
  });

  it("summarizeSimulation antibioticRate + noAntibioticRate ≈ 1", async () => {
    const { runSimulation, summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(100);
    const summary = summarizeSimulation(results);
    expect(summary.antibioticRate + summary.noAntibioticRate).toBeCloseTo(1, 1);
  });

  it("summarizeSimulation on empty array returns all zeros", async () => {
    const { summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const summary = summarizeSimulation([]);
    expect(summary.totalRuns).toBe(0);
    expect(summary.antibioticRate).toBe(0);
    expect(summary.meanCentorScore).toBe(0);
  });

  it("summarizeSimulation highProbabilityCount ≤ totalRuns", async () => {
    const { runSimulation, summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(100);
    const summary = summarizeSimulation(results);
    expect(summary.highProbabilityCount).toBeLessThanOrEqual(summary.totalRuns);
  });

  it("meanCentorScore is within plausible range for random cohort", async () => {
    const { runSimulation, summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const results = await runSimulation(500);
    const summary = summarizeSimulation(results);
    expect(summary.meanCentorScore).toBeGreaterThanOrEqual(0);
    expect(summary.meanCentorScore).toBeLessThanOrEqual(6);
  });

  it("larger cohort produces stable antibiotic rates (law of large numbers)", async () => {
    const { runSimulation, summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const r1 = summarizeSimulation(await runSimulation(500));
    const r2 = summarizeSimulation(await runSimulation(500));
    expect(Math.abs(r1.antibioticRate - r2.antibioticRate)).toBeLessThan(0.3);
  });
});

// ─── Drift Detection Engine ───────────────────────────────────────────────────
describe("driftDetectionEngine — real-time system drift monitoring", () => {
  it("detectDrift returns empty array when within baseline thresholds", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    expect(alerts).toHaveLength(0);
  });

  it("antibiotic rate delta > 0.1 from baseline triggers alert", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.5, returnVisitRate: 0.1 });
    expect(alerts.some(a => a.type === "antibiotic_rate_drift")).toBe(true);
  });

  it("return visit rate > baseline + 0.1 triggers alert", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.3, returnVisitRate: 0.25 });
    expect(alerts.some(a => a.type === "return_visit_rate_increased")).toBe(true);
  });

  it("antibiotic rate < 0.05 triggers low-rate alert", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.02, returnVisitRate: 0.1 });
    expect(alerts.some(a => a.type === "antibiotic_rate_low")).toBe(true);
  });

  it("critical severity when delta > 0.2", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.6, returnVisitRate: 0.1 });
    const driftAlert = alerts.find(a => a.type === "antibiotic_rate_drift");
    expect(driftAlert?.severity).toBe("critical");
  });

  it("warning severity when delta between 0.1 and 0.2", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.45, returnVisitRate: 0.1 });
    const driftAlert = alerts.find(a => a.type === "antibiotic_rate_drift");
    expect(driftAlert?.severity).toBe("warning");
  });

  it("resetBaseline updates the baseline for subsequent checks", async () => {
    const { detectDrift, resetBaseline, getBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.5, returnVisitRate: 0.2 });
    const b = getBaseline();
    expect(b.antibioticRate).toBe(0.5);
    expect(b.returnVisitRate).toBe(0.2);
    const alerts = detectDrift({ antibioticRate: 0.5, returnVisitRate: 0.2 });
    expect(alerts).toHaveLength(0);
  });

  it("each alert has type, message, delta, severity", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.6, returnVisitRate: 0.4 });
    for (const a of alerts) {
      expect(a).toHaveProperty("type");
      expect(a).toHaveProperty("message");
      expect(a).toHaveProperty("severity");
    }
  });

  it("multiple conditions trigger multiple alerts simultaneously", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const alerts = detectDrift({ antibioticRate: 0.6, returnVisitRate: 0.4 });
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Risk Governance Engine ───────────────────────────────────────────────────
describe("riskGovernanceEngine — clinical safety guard", () => {
  it("no alerts for appropriate NO_ANTIBIOTIC at low probability", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC", probability: 0.2 });
    expect(alerts).toHaveLength(0);
  });

  it("no alerts for ANTIBIOTIC at high probability", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "ANTIBIOTIC", probability: 0.8 });
    expect(alerts).toHaveLength(0);
  });

  it("under-treatment alert when NO_ANTIBIOTIC + probability > 0.7", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC", probability: 0.75 });
    expect(alerts.some(a => a.type === "under_treatment")).toBe(true);
  });

  it("over-treatment alert when ANTIBIOTIC + probability < 0.3", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "ANTIBIOTIC", probability: 0.2 });
    expect(alerts.some(a => a.type === "over_treatment")).toBe(true);
  });

  it("NO_ANTIBIOTIC_OR_DELAYED at high prob triggers under-treatment alert", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC_OR_DELAYED", probability: 0.8 });
    expect(alerts.some(a => a.type === "under_treatment")).toBe(true);
  });

  it("ANTIBIOTIC_GIVEN at very low prob triggers over-treatment alert", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "ANTIBIOTIC_GIVEN", probability: 0.1 });
    expect(alerts.some(a => a.type === "over_treatment")).toBe(true);
  });

  it("CONSIDER_ANTIBIOTIC at very low prob triggers over-treatment alert", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "CONSIDER_ANTIBIOTIC", probability: 0.05 });
    expect(alerts.some(a => a.type === "over_treatment")).toBe(true);
  });

  it("critical severity for over-treatment when probability < 0.15", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "ANTIBIOTIC", probability: 0.05 });
    const overTreat = alerts.find(a => a.type === "over_treatment");
    expect(overTreat?.severity).toBe("critical");
  });

  it("warning severity for over-treatment when probability between 0.15 and 0.3", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "ANTIBIOTIC", probability: 0.2 });
    const overTreat = alerts.find(a => a.type === "over_treatment");
    expect(overTreat?.severity).toBe("warning");
  });

  it("critical severity for under-treatment when probability > 0.85", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC", probability: 0.9 });
    const underTreat = alerts.find(a => a.type === "under_treatment");
    expect(underTreat?.severity).toBe("critical");
  });

  it("Centor ≥4 + NO_ANTIBIOTIC triggers high_confidence_mismatch alert", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC", probability: 0.45, centorScore: 4 });
    expect(alerts.some(a => a.type === "high_confidence_mismatch")).toBe(true);
  });

  it("Centor 3 + NO_ANTIBIOTIC does NOT trigger mismatch alert", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC", probability: 0.3, centorScore: 3 });
    expect(alerts.some(a => a.type === "high_confidence_mismatch")).toBe(false);
  });

  it("evaluateRisk returns alert with probability and decision fields", async () => {
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const alerts = evaluateRisk({ decision: "NO_ANTIBIOTIC", probability: 0.8 });
    for (const a of alerts) {
      expect(a).toHaveProperty("probability");
      expect(a).toHaveProperty("decision");
      expect(a).toHaveProperty("message");
    }
  });
});

// ─── Full Pipeline Integration ────────────────────────────────────────────────
describe("full learning pipeline — end-to-end decision personalization", () => {
  it("immunocompromised patient with no history crosses threshold toward antibiotic", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const { getClinicThreshold, resetClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const clinicId = "pipeline-test-" + Date.now();
    resetClinicThreshold(clinicId, 0.5);
    const threshold = getClinicThreshold(clinicId);
    const result = personalizeDecision({
      baseProbability: 0.38,
      comorbidities: ["immunocompromised"],
      patientPattern: { antibioticResponseRate: 0, frequentReturner: false, visitCount: 0 },
    });
    const decision = result.adjustedProbability > threshold ? "CONSIDER_ANTIBIOTIC" : "NO_ANTIBIOTIC";
    expect(result.adjustedProbability).toBeCloseTo(0.58);
    expect(decision).toBe("CONSIDER_ANTIBIOTIC");
  });

  it("healthy low-probability patient stays NO_ANTIBIOTIC at default threshold", async () => {
    const { personalizeDecision } = await import("../../server/services/learning/personalizationEngine");
    const { getClinicThreshold } = await import("../../server/services/learning/populationLearningEngine");
    const threshold = getClinicThreshold("default-clinic-no-adj");
    const result = personalizeDecision({
      baseProbability: 0.15,
      comorbidities: [],
      patientPattern: { antibioticResponseRate: 0.2, frequentReturner: false, visitCount: 1 },
    });
    const decision = result.adjustedProbability > threshold ? "CONSIDER_ANTIBIOTIC" : "NO_ANTIBIOTIC";
    expect(decision).toBe("NO_ANTIBIOTIC");
  });

  it("drift detection + risk governance provide layered safety net", async () => {
    const { detectDrift, resetBaseline } = await import("../../server/services/monitoring/driftDetectionEngine");
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    resetBaseline({ antibioticRate: 0.3, returnVisitRate: 0.1 });
    const driftAlerts = detectDrift({ antibioticRate: 0.6, returnVisitRate: 0.35 });
    const riskAlerts  = evaluateRisk({ decision: "ANTIBIOTIC", probability: 0.1 });
    expect(driftAlerts.length + riskAlerts.length).toBeGreaterThanOrEqual(2);
  });

  it("simulation → summarize → risk check pipeline is consistent", async () => {
    const { runSimulation, summarizeSimulation } = await import("../../server/services/simulation/simulationEngine");
    const { evaluateRisk } = await import("../../server/services/monitoring/riskGovernanceEngine");
    const results = await runSimulation(100);
    const summary = summarizeSimulation(results);
    const riskAlerts = evaluateRisk({
      decision: summary.antibioticRate > 0.5 ? "ANTIBIOTIC" : "NO_ANTIBIOTIC",
      probability: summary.meanProbability,
    });
    expect(Array.isArray(riskAlerts)).toBe(true);
  });
});
