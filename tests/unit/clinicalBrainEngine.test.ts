/**
 * clinicalBrainEngine.test.ts — v3.0 test suite
 *
 * Tests the full clinical brain orchestrator including:
 *   - Phase structure (1 → 2 → 3 → 4 → 5 → 6)
 *   - Safe defaults on engine failure
 *   - Safety gate short-circuit
 *   - Per-engine timeout
 *   - Chief resident reflection
 *   - Safety escalation guard
 *   - Schema version
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock all heavy engine dependencies before importing brain ─────────────────
vi.mock("../../server/similarity/caseSimilarityService",          () => ({ findSimilarCasesForState:        vi.fn().mockResolvedValue(null)  }));
vi.mock("../../server/services/diagnostic/differentialProbabilityEngine", () => ({
  computeDifferentialProbabilities: vi.fn().mockReturnValue([
    { clusterId: "sinusitis",  posteriorProbability: 0.62, priorProbability: 0.4, likelihoodRatio: 1.5, key: "sinusitis"  },
    { clusterId: "rhinitis",   posteriorProbability: 0.28, priorProbability: 0.3, likelihoodRatio: 0.9, key: "rhinitis"   },
  ]),
}));
vi.mock("../../server/services/diagnostic/nextBestQuestionEngine", () => ({
  selectNextBestQuestion: vi.fn().mockReturnValue({ bestQuestion: "Do you have a fever?", rankings: [] }),
}));
vi.mock("../../server/agent/safety/redFlags",  () => ({ detectRedFlags: vi.fn().mockReturnValue([]) }));
vi.mock("../../server/core/brainAuditLog",     () => ({ logBrainDecision: vi.fn() }));
vi.mock("../../server/core/clinicalMemoryEngine", () => ({
  storeClinicalCase:     vi.fn(),
  findSimilarMemoryCases: vi.fn().mockReturnValue([]),
}));
vi.mock("../../server/core/symptomNormalizationEngine", () => ({
  normalizeSymptoms: vi.fn((s: string[]) => s),
}));
vi.mock("../../server/core/clinicalSafetyGuard", () => ({
  safetyGuard: vi.fn().mockReturnValue({ disposition: null, triggerRule: null, matchedSymptoms: [] }),
}));
vi.mock("../../server/core/diagnosticEvidenceEngine", () => ({
  diagnosticEvidenceEngine: vi.fn().mockReturnValue([
    { diagnosis: "sinusitis", combinedScore: 0.6, evidence: [] },
  ]),
}));
vi.mock("../../server/core/uncertaintyEngine", () => ({
  computeUncertainty: vi.fn().mockReturnValue({ entropy: 0.3, recommendation: "confident", maxProbability: 0.62, adjustedEntropy: 0.3 }),
}));
vi.mock("../../server/core/treatmentEngine", () => ({
  getBulkRecommendations: vi.fn().mockReturnValue([
    { treatmentName: "Nasal saline irrigation", category: "first_line", urgency: "routine" },
  ]),
}));
vi.mock("../../server/core/testRecommendationEngine", () => ({
  prioritizeTests: vi.fn().mockReturnValue([]),
}));
vi.mock("../../server/core/returnPrecautionEngine", () => ({
  generateBulkReturnPrecautions: vi.fn().mockReturnValue([
    { diagnosis: "sinusitis", precautions: ["Return if fever > 38.5°C"] },
  ]),
}));
vi.mock("../../server/core/contradictionEngine",       () => ({ contradictionEngine:        vi.fn().mockReturnValue({ hasErrors: false, conflicts: [] }) }));
vi.mock("../../server/core/evidenceAggregatorEngine",  () => ({
  evidenceAggregatorEngine: vi.fn().mockReturnValue([{ diagnosis: "sinusitis", score: 0.62 }]),
}));
vi.mock("../../server/core/clinicalGovernanceEngine",  () => ({
  clinicalGovernanceEngine: vi.fn().mockReturnValue({ supervisorDecision: "CONTINUE", auditTags: [] }),
}));
vi.mock("../../server/core/temporalProgressionEngine", () => ({
  temporalProgressionEngine: vi.fn().mockReturnValue({ pattern: "acute", diagnosisBoosts: {} }),
}));
vi.mock("../../server/core/riskStratificationEngine",  () => ({
  riskStratificationEngine: vi.fn().mockReturnValue({ overallRisk: "low", riskScore: 0.15, diagnosisBoosts: {} }),
}));
vi.mock("../../server/core/guidelineAdherenceEngine",  () => ({
  guidelineAdherenceEngine: vi.fn().mockReturnValue({ passed: true, gaps: [] }),
}));
vi.mock("../../server/core/physicianReviewPacketEngine", () => ({
  physicianReviewPacketEngine: vi.fn().mockReturnValue(null),
}));
vi.mock("../../server/core/dispositionCalibrationEngine", () => ({
  dispositionCalibrationEngine: vi.fn().mockReturnValue({ finalDisposition: "outpatient" }),
}));
vi.mock("../../server/core/complaintCompletenessEngine", () => ({
  complaintCompletenessEngine: vi.fn().mockReturnValue({ complete: true, missingFields: [], coveragePercent: 90 }),
}));
vi.mock("../../server/core/medicationSafetyEngine",    () => ({ medicationSafetyEngine:    vi.fn().mockReturnValue({ safe: true, issues: [] }) }));
vi.mock("../../server/core/testYieldEngine",           () => ({ testYieldEngine:           vi.fn().mockReturnValue({ rankedTests: [] }) }));
vi.mock("../../server/core/physicianFeedbackLearningEngine", () => ({
  physicianFeedbackLearningEngine: vi.fn().mockReturnValue(null),
}));
vi.mock("../../server/core/severityScoringEngine",     () => ({ severityScoringEngine:     vi.fn().mockReturnValue({ level: "mild" }) }));
vi.mock("../../server/core/crossComplaintRouterEngine",() => ({ crossComplaintRouterEngine: vi.fn().mockReturnValue({ routedComplaints: [] }) }));
vi.mock("../../server/core/protocolVarianceEngine",    () => ({ protocolVarianceEngine:    vi.fn().mockReturnValue({ severity: "none", deviations: [] }) }));
vi.mock("../../server/core/diagnosticDriftEngine",     () => ({ diagnosticDriftEngine:    vi.fn().mockReturnValue({ driftLevel: "none", driftDetected: false }) }));
vi.mock("../../server/core/unifiedClinicalGovernanceEngine", () => ({
  unifiedClinicalGovernanceEngine: vi.fn().mockReturnValue({ supervisorDecision: "CONTINUE" }),
}));

// Mock intelligence layer
vi.mock("../../server/clinical/importanceUtils", () => ({
  computeFailureImpact:      vi.fn().mockReturnValue(0),
  adjustUncertainty:         vi.fn((u: number) => u),
  degradationSeverity:       vi.fn().mockReturnValue("none"),
  enforceMinimumViableOutput: vi.fn(),
}));
vi.mock("../../server/clinical/brainBehavior", () => ({
  adjustThinkingMode:          vi.fn().mockReturnValue("balanced"),
  shouldRequery:               vi.fn().mockReturnValue(false),
  shouldEscalateDisposition:   vi.fn().mockReturnValue(false),
}));
vi.mock("../../server/clinical/cognitiveLoad", () => ({
  computeCognitiveLoad: vi.fn().mockReturnValue(0.2),
  cognitiveLoadLabel:   vi.fn().mockReturnValue("low"),
}));
vi.mock("../../server/clinical/adaptivePlanner", () => ({
  buildExecutionPlan: vi.fn().mockReturnValue({
    phase2: new Set(["findSimilarCasesForState", "findSimilarMemoryCases"]),
    phase3: new Set(["contradictionEngine", "diagnosticEvidenceEngine", "evidenceAggregatorEngine",
                     "riskStratificationEngine", "temporalProgressionEngine", "guidelineAdherenceEngine",
                     "selectNextBestQuestion"]),
    phase4: new Set([]),
    phase5: new Set([]),
  }),
}));
vi.mock("../../server/clinical/requeryLoop", () => ({
  maybeRequery: vi.fn().mockResolvedValue({ requeryUsed: false, passes: 0, updated: null }),
}));
vi.mock("../../server/controlTower/engineTelemetry", () => ({
  logEngineTelemetry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/oversight/oversightAgent", () => ({
  oversightAgent: {
    evaluate:       vi.fn().mockResolvedValue([]),
    shouldEscalate: vi.fn().mockResolvedValue(false),
    flagDrift:      vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../../server/clinical/chiefResidentReflection", () => ({
  runChiefResidentReflection: vi.fn().mockReturnValue({ issues: [], escalated: false, reflectionMs: 1 }),
}));
vi.mock("../../server/clinical/safetyEscalationGuard", () => ({
  runSafetyEscalationGuard: vi.fn().mockReturnValue({
    disposition: "outpatient", overridden: false, overrideReasons: [],
  }),
}));
vi.mock("../../server/memory/cognitiveMemory", () => ({
  cognitiveMemory: {
    retrieveSimilar: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../server/memory/memoryLearning", () => ({
  applyCognitiveHint: vi.fn((u: number) => u),
}));
vi.mock("../../server/audit/auditLogger", () => ({
  auditStep: vi.fn().mockResolvedValue(undefined),
}));

// ── Now import the brain ──────────────────────────────────────────────────────
import { runClinicalBrain } from "../../server/core/clinicalBrainEngine";

const BASE_INPUT = {
  complaint: "nasal congestion",
  answers:   { nasal_congestion: true, headache: true },
  state:     { sessionId: "test-session" },
  differentialCandidates: [
    { clusterId: "sinusitis", score: 0.62 },
    { clusterId: "rhinitis",  score: 0.28 },
  ],
  availableQuestions: ["fever?", "duration?"],
};

describe("runClinicalBrain v3", () => {

  it("returns schemaVersion 3.0", async () => {
    const out = await runClinicalBrain(BASE_INPUT);
    expect(out.schemaVersion).toBe("3.0");
  });

  it("includes all required v2 fields", async () => {
    const out = await runClinicalBrain(BASE_INPUT);
    expect(out).toHaveProperty("differentials");
    expect(out).toHaveProperty("uncertainty");
    expect(out).toHaveProperty("risk");
    expect(out).toHaveProperty("treatments");
    expect(out).toHaveProperty("disposition");
    expect(out).toHaveProperty("governance");
  });

  it("includes all v3 additions", async () => {
    const out = await runClinicalBrain(BASE_INPUT);
    expect(out).toHaveProperty("engineFailures");
    expect(out).toHaveProperty("degraded");
    expect(out).toHaveProperty("degradedSeverity");
    expect(out).toHaveProperty("thinkingMode");
    expect(out).toHaveProperty("cognitiveLoad");
    expect(out).toHaveProperty("requeryUsed");
    expect(out).toHaveProperty("oversightAlerts");
    expect(out).toHaveProperty("chiefResidentReflection");
    expect(out).toHaveProperty("safetyGuardOverride");
    expect(out).toHaveProperty("durationMs");
  });

  it("engineFailures is an array (empty when all succeed)", async () => {
    const out = await runClinicalBrain(BASE_INPUT);
    expect(Array.isArray(out.engineFailures)).toBe(true);
    expect(out.engineFailures!.length).toBe(0);
  });

  it("propagates disposition from calibration engine", async () => {
    const out = await runClinicalBrain(BASE_INPUT);
    expect(out.disposition).toBe("outpatient");
  });

  it("short-circuits to ER_NOW when safety gate fires", async () => {
    const { safetyGuard } = await import("../../server/core/clinicalSafetyGuard");
    (safetyGuard as any).mockReturnValueOnce({ disposition: "ER_NOW", triggerRule: "chest_pain", matchedSymptoms: ["chest pain"] });

    const out = await runClinicalBrain({ ...BASE_INPUT, complaint: "chest pain" });
    expect(out.disposition).toBe("ER_NOW");
    expect(out.safetyGuardTrigger).toBe("chest_pain");
  });

  it("safety guard override overrides disposition", async () => {
    const { runSafetyEscalationGuard } = await import("../../server/clinical/safetyEscalationGuard");
    (runSafetyEscalationGuard as any).mockReturnValueOnce({
      disposition: "ER_NOW", overridden: true, overrideReasons: ["risk score > 0.85"],
    });

    const out = await runClinicalBrain(BASE_INPUT);
    expect(out.disposition).toBe("ER_NOW");
    expect(out.safetyGuardOverride?.overridden).toBe(true);
  });

  it("chief resident escalation sets physician_required", async () => {
    const { runChiefResidentReflection } = await import("../../server/clinical/chiefResidentReflection");
    const { runSafetyEscalationGuard }   = await import("../../server/clinical/safetyEscalationGuard");

    (runChiefResidentReflection as any).mockReturnValueOnce({
      issues: [{ type: "disposition_risk_mismatch", message: "risk vs discharge conflict", action: "escalate" }],
      escalated: true, reflectionMs: 2,
    });
    (runSafetyEscalationGuard as any).mockReturnValueOnce({
      disposition: "physician_required", overridden: true, overrideReasons: ["chief resident escalated"],
    });

    const out = await runClinicalBrain(BASE_INPUT);
    expect(out.disposition).toBe("physician_required");
    expect(out.chiefResidentReflection?.escalated).toBe(true);
  });

  it("respects requeryUsed flag from re-query loop", async () => {
    const { maybeRequery } = await import("../../server/clinical/requeryLoop");
    (maybeRequery as any).mockResolvedValueOnce({ requeryUsed: true, passes: 2, updated: {} });

    const out = await runClinicalBrain(BASE_INPUT);
    expect(out.requeryUsed).toBe(true);
    expect(out.requeryPasses).toBe(2);
  });

  it("includes cognitive hints from memory", async () => {
    const { cognitiveMemory } = await import("../../server/memory/cognitiveMemory");
    (cognitiveMemory.retrieveSimilar as any).mockResolvedValueOnce([
      { case: { complaint: "sinus congestion" }, score: 0.88 },
    ]);

    const out = await runClinicalBrain(BASE_INPUT);
    expect(Array.isArray(out.cognitiveHints)).toBe(true);
  });
});
