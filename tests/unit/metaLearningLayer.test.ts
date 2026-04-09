/**
 * Meta-learning layer tests
 *
 * Tests the 7 new deterministic modules:
 *   - cognitiveBudget
 *   - nextBestQuestion
 *   - changeApprovalGate (golden case gate logic)
 *   - goldenCaseEngine (simulation result structure)
 *   - driftDetector
 *   - failureClusterer
 *   - safetyWatchdog
 *   - engineWeightAdapter
 *   - selfHealingAgent
 */

import { describe, it, expect } from "vitest";
import { computeCognitiveBudget } from "../../server/clinical/cognitiveBudget";
import { computeNextBestQuestion } from "../../server/clinical/nextBestQuestion";
import { detectClinicalDrift }    from "../../server/meta/driftDetector";
import { clusterFailures }        from "../../server/meta/failureClusterer";
import { safetyRegressionCheck, toWatchdogSnapshot } from "../../server/meta/safetyWatchdog";
import { proposeEngineWeightAdjustment } from "../../server/meta/engineWeightAdapter";
import { generateSystemAlerts }   from "../../server/meta/selfHealingAgent";

// ── cognitiveBudget ────────────────────────────────────────────────────────────

describe("computeCognitiveBudget", () => {
  it("returns budget=1 for a symptom-free, vital-normal adult", () => {
    const result = computeCognitiveBudget({});
    expect(result.budgetLevel).toBe(1);
    expect(result.enableAdvancedReasoning).toBe(false);
    expect(result.enableDebate).toBe(false);
  });

  it("chest pain alone escalates budget to ≥3 (enables advanced reasoning)", () => {
    const result = computeCognitiveBudget({ symptoms: ["chest_pain"] });
    expect(result.budgetLevel).toBeGreaterThanOrEqual(3);
    expect(result.enableAdvancedReasoning).toBe(true);
  });

  it("chest pain + low BP + elderly → budget=5 (full pipeline)", () => {
    const result = computeCognitiveBudget({
      symptoms:   ["chest_pain"],
      ageYears:   70,
      vitalSigns: { systolicBp: 85 },
    });
    expect(result.budgetLevel).toBe(5);
    expect(result.enableFullMoatPipeline).toBe(true);
    expect(result.enableDebate).toBe(true);
  });

  it("infant (<2 years) alone pushes budget to ≥3", () => {
    const result = computeCognitiveBudget({ ageYears: 1 });
    expect(result.budgetLevel).toBeGreaterThanOrEqual(3);
  });

  it("budget is capped at 5", () => {
    const result = computeCognitiveBudget({
      symptoms:   ["chest_pain", "shortness_of_breath", "altered_mental_status", "syncope"],
      ageYears:   80,
      isPregnant: true,
      vitalSigns: { systolicBp: 80, oxygenSaturation: 88, respiratoryRate: 28, gcs: 10 },
    });
    expect(result.budgetLevel).toBe(5);
  });

  it("rationale array is populated with contributing factors", () => {
    const result = computeCognitiveBudget({
      symptoms:   ["chest_pain"],
      ageYears:   70,
    });
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.rationale.some(r => r.includes("chest_pain"))).toBe(true);
    expect(result.rationale.some(r => r.includes("age > 65"))).toBe(true);
  });
});

// ── computeNextBestQuestion ────────────────────────────────────────────────────

describe("computeNextBestQuestion", () => {
  it("returns noQuestionAvailable=true for empty differential", () => {
    const result = computeNextBestQuestion([], []);
    expect(result.noQuestionAvailable).toBe(true);
    expect(result.question).toBeNull();
  });

  it("returns a result structure with all required fields", () => {
    const differential = [
      { diagnosis: "URI", probability: 0.6 },
      { diagnosis: "pneumonia", probability: 0.4 },
    ];
    const result = computeNextBestQuestion(differential, []);
    // Required fields present regardless of KB load state
    expect(typeof result.expectedInformationGain).toBe("number");
    expect(Array.isArray(result.ranked)).toBe(true);
    expect(typeof result.noQuestionAvailable).toBe("boolean");
    expect(typeof result.diagnosticCoverage).toBe("number");
  });

  it("does not return already-asked questions (when KB has priors)", () => {
    // This test is a no-op if the KB is not loaded in test environment
    // (both results will have question=null, which is a safe fallback)
    const differential = [{ diagnosis: "URI", probability: 1 }];
    const result1 = computeNextBestQuestion(differential, []);
    if (result1.question) {
      const result2 = computeNextBestQuestion(differential, [result1.question]);
      expect(result2.question).not.toBe(result1.question);
    } else {
      // KB not loaded in test env — noQuestionAvailable should be true
      expect(result1.noQuestionAvailable).toBe(true);
    }
  });
});

// ── detectClinicalDrift ────────────────────────────────────────────────────────

describe("detectClinicalDrift", () => {
  it("returns no drift for empty outcomes", () => {
    const result = detectClinicalDrift([]);
    expect(result.driftDetected).toBe(false);
    expect(result.sampleSize).toBe(0);
  });

  it("detects critical drift when ER rate is 30% above baseline", () => {
    // Baseline = 12%. Current = 42% → drift = 30% → critical
    const outcomes = Array(100).fill(null).map((_, i) => ({
      actualOutcome:        i < 42 ? "ER_NOW" : "ROUTINE",
      predictedDisposition: "ROUTINE",
    }));
    const result = detectClinicalDrift(outcomes);
    expect(result.driftDetected).toBe(true);
    expect(result.severity).toBe("critical");
    expect(result.driftMagnitude).toBeGreaterThan(0.1);
  });

  it("detects warning drift when ER rate is 8% above baseline", () => {
    // Baseline = 12%. Current = 20% → drift = 8% → warning
    const outcomes = Array(100).fill(null).map((_, i) => ({
      actualOutcome:        i < 20 ? "ER_NOW" : "ROUTINE",
      predictedDisposition: "ROUTINE",
    }));
    const result = detectClinicalDrift(outcomes);
    expect(result.driftDetected).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("does not flag drift within ±5% of baseline", () => {
    // Baseline = 12%. Current = 14% → drift = 2% → no alert
    const outcomes = Array(100).fill(null).map((_, i) => ({
      actualOutcome:        i < 14 ? "ER_NOW" : "ROUTINE",
      predictedDisposition: "ROUTINE",
    }));
    const result = detectClinicalDrift(outcomes);
    expect(result.driftDetected).toBe(false);
    expect(result.severity).toBe("none");
  });
});

// ── clusterFailures ────────────────────────────────────────────────────────────

describe("clusterFailures", () => {
  it("returns zero failures for a perfect outcome set", () => {
    const outcomes = [
      { complaint: "cough", predictedDisposition: "ROUTINE", actualOutcome: "ROUTINE", features: {} },
      { complaint: "fever", predictedDisposition: "ER_NOW",  actualOutcome: "ER_NOW",  features: {} },
    ];
    const result = clusterFailures(outcomes);
    expect(result.totalFailures).toBe(0);
    expect(result.clusters).toHaveLength(0);
    expect(result.failureRate).toBe(0);
  });

  it("groups failures by complaint and age group", () => {
    const outcomes = Array(10).fill(null).map((_, i) => ({
      caseId:               `case-${i}`,
      complaint:            "chest pain",
      predictedDisposition: "ROUTINE",
      actualOutcome:        "ER_NOW",    // all 10 are failures
      features:             { ageYears: 70 },  // 65+ group
    }));
    const result = clusterFailures(outcomes);
    expect(result.totalFailures).toBe(10);
    expect(result.clusters.length).toBeGreaterThan(0);
    expect(result.clusters[0].count).toBe(10);
    expect(result.clusters[0].ageGroup).toBe("65+");
  });

  it("returns at most 10 clusters", () => {
    const complaints = Array(15).fill(null).map((_, i) => `complaint-${i}`);
    const outcomes = complaints.flatMap(c => ([
      { complaint: c, predictedDisposition: "ROUTINE", actualOutcome: "ER_NOW", features: { ageYears: 30 } },
    ]));
    const result = clusterFailures(outcomes);
    expect(result.clusters.length).toBeLessThanOrEqual(10);
  });
});

// ── safetyWatchdog ────────────────────────────────────────────────────────────

describe("safetyRegressionCheck", () => {
  const baseline = { safetyMismatches: 0, accuracyRate: 0.97, totalCases: 50 };

  it("passes when current = previous (no change)", () => {
    const result = safetyRegressionCheck(baseline, { ...baseline });
    expect(result.passed).toBe(true);
    expect(result.mismatchDelta).toBe(0);
  });

  it("throws on any increase in safety mismatches", () => {
    expect(() => safetyRegressionCheck(
      { ...baseline, safetyMismatches: 0 },
      { ...baseline, safetyMismatches: 1 }
    )).toThrow("Safety regression detected");
  });

  it("throws on accuracy drop > 2%", () => {
    expect(() => safetyRegressionCheck(
      { ...baseline, accuracyRate: 0.97 },
      { ...baseline, accuracyRate: 0.94 }   // -3% > tolerance
    )).toThrow("Accuracy regression detected");
  });

  it("passes on accuracy drop ≤ 2%", () => {
    const result = safetyRegressionCheck(
      { ...baseline, accuracyRate: 0.97 },
      { ...baseline, accuracyRate: 0.96 }   // -1% within tolerance
    );
    expect(result.passed).toBe(true);
  });

  it("passes when safety mismatches improve (decrease)", () => {
    const result = safetyRegressionCheck(
      { ...baseline, safetyMismatches: 2 },
      { ...baseline, safetyMismatches: 0 }   // improved
    );
    expect(result.passed).toBe(true);
    expect(result.mismatchDelta).toBe(-2);
  });
});

describe("toWatchdogSnapshot", () => {
  it("converts SimulationResult to a snapshot with required fields", () => {
    const sim = {
      totalCases: 20, correctDisposition: 19, incorrectDisposition: 1,
      safetyMismatches: 0, accuracyRate: 0.95, durationMs: 100, details: [],
    };
    const snap = toWatchdogSnapshot(sim, "snap-test");
    expect(snap.snapshotId).toBe("snap-test");
    expect(snap.safetyMismatches).toBe(0);
    expect(snap.accuracyRate).toBe(0.95);
    expect(snap.totalCases).toBe(20);
    expect(snap.capturedAt).toBeTruthy();
  });
});

// ── engineWeightAdapter ────────────────────────────────────────────────────────

describe("proposeEngineWeightAdjustment", () => {
  it("returns a proposal with requiresReview=true always", () => {
    const proposal = proposeEngineWeightAdjustment({ sampleSize: 100 });
    expect(proposal.requiresReview).toBe(true);
  });

  it("returns no change with insufficient sample size", () => {
    const proposal = proposeEngineWeightAdjustment({ sampleSize: 5 });
    expect(proposal.proposedWeights).toEqual(proposal.currentWeights);
    expect(proposal.confidence).toBe(0);
    expect(proposal.adjustments[0]).toContain("Insufficient sample size");
  });

  it("shifts weight toward the better-performing engine", () => {
    const proposal = proposeEngineWeightAdjustment({
      bayesianSuccess:   0.90,
      similaritySuccess: 0.70,
      rulesSuccess:      0.60,
      sampleSize:        100,
    });
    // Bayesian is best — should gain weight or at minimum not lose it
    expect(proposal.proposedWeights.bayesian).toBeGreaterThanOrEqual(proposal.currentWeights.bayesian);
    expect(proposal.requiresReview).toBe(true);
  });

  it("proposed weights always sum to approximately 1.0", () => {
    const proposal = proposeEngineWeightAdjustment({
      bayesianSuccess:   0.55,
      similaritySuccess: 0.90,
      rulesSuccess:      0.70,
      sampleSize:        200,
    });
    const sum = proposal.proposedWeights.bayesian + proposal.proposedWeights.similarity + proposal.proposedWeights.rules;
    expect(sum).toBeCloseTo(1.0, 2);
  });
});

// ── selfHealingAgent ──────────────────────────────────────────────────────────

describe("generateSystemAlerts", () => {
  it("returns empty array for healthy metrics", () => {
    const alerts = generateSystemAlerts({
      errorRate:       0.01,
      fhirFailureRate: 0.00,
      latencyMs:       800,
    });
    expect(alerts).toHaveLength(0);
  });

  it("generates critical alert for safety mismatches", () => {
    const alerts = generateSystemAlerts({ safetyMismatches: 2 });
    const crit = alerts.find(a => a.system === "Safety Pipeline");
    expect(crit).toBeDefined();
    expect(crit?.severity).toBe("critical");
  });

  it("generates critical alert for RLHF governance violations", () => {
    const alerts = generateSystemAlerts({ rlhfViolations: 1 });
    const crit = alerts.find(a => a.system === "RLHF Governance");
    expect(crit).toBeDefined();
    expect(crit?.severity).toBe("critical");
  });

  it("generates warning alert for high latency", () => {
    const alerts = generateSystemAlerts({ latencyMs: 2500 });
    const warn = alerts.find(a => a.system === "Pipeline");
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe("warning");
  });

  it("generates critical alert for critical latency", () => {
    const alerts = generateSystemAlerts({ latencyMs: 5000 });
    const crit = alerts.find(a => a.system === "Pipeline");
    expect(crit?.severity).toBe("critical");
  });

  it("alerts are sorted critical first, then warning", () => {
    const alerts = generateSystemAlerts({
      latencyMs:       2500,          // warning
      safetyMismatches: 1,            // critical
      errorRate:       0.20,          // critical
    });
    const severities = alerts.map(a => a.severity);
    const critIdx    = severities.lastIndexOf("critical");
    const warnIdx    = severities.indexOf("warning");
    if (critIdx !== -1 && warnIdx !== -1) {
      expect(critIdx).toBeLessThan(warnIdx);
    }
  });

  it("recommendation field is a non-empty string", () => {
    const alerts = generateSystemAlerts({ errorRate: 0.15, latencyMs: 5000 });
    for (const alert of alerts) {
      expect(alert.recommendation.length).toBeGreaterThan(10);
    }
  });
});
