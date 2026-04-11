import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── KB Validation Schemas ───────────────────────────────────────────────────
import {
  CanonicalPathwayPromotionSchema,
  CanonicalPathwayRetireSchema,
  CanonicalDraftFromCaseSchema,
} from "../../server/kb/schemas/kbValidationSchemas";

describe("kbValidationSchemas — CanonicalPathwayPromotionSchema", () => {
  const valid = {
    sourceType: "manual",
    complaintId: "sore-throat",
    syndromeId: "strep-pharyngitis",
    label: "Classic Strep Pharyngitis",
    requiredFeatures: ["fever", "exudate"],
    positiveWeights: { fever: 0.2, exudate: 0.25 },
    negativeWeights: { cough: -0.15 },
    exclusions: [],
    treatmentClass: "antibiotic",
    medicationKey: "amoxicillin",
    canonicalDisposition: "home_with_rx",
    rationale: ["Centor ≥3 — empiric antibiotic indicated"],
    actorId: "dr-smith",
    traceId: "trace-001",
  };

  it("accepts valid promotion payload", () => {
    expect(CanonicalPathwayPromotionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing actorId", () => {
    const { actorId, ...rest } = valid;
    expect(CanonicalPathwayPromotionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid treatmentClass", () => {
    expect(
      CanonicalPathwayPromotionSchema.safeParse({ ...valid, treatmentClass: "radiation" }).success
    ).toBe(false);
  });

  it("rejects invalid canonicalDisposition", () => {
    expect(
      CanonicalPathwayPromotionSchema.safeParse({ ...valid, canonicalDisposition: "send_home" }).success
    ).toBe(false);
  });

  it("rejects invalid sourceType", () => {
    expect(
      CanonicalPathwayPromotionSchema.safeParse({ ...valid, sourceType: "random" }).success
    ).toBe(false);
  });

  it("applies defaults for optional arrays", () => {
    const { requiredFeatures, positiveWeights, negativeWeights, exclusions, rationale, ...rest } = valid;
    const result = CanonicalPathwayPromotionSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiredFeatures).toEqual([]);
      expect(result.data.rationale).toEqual([]);
    }
  });
});

describe("kbValidationSchemas — CanonicalPathwayRetireSchema", () => {
  it("accepts valid retire payload", () => {
    expect(
      CanonicalPathwayRetireSchema.safeParse({
        pathwayId: "pw-001",
        actorId: "dr-jones",
        traceId: "t-456",
        reason: "Replaced by updated evidence",
      }).success
    ).toBe(true);
  });

  it("rejects reason shorter than 3 chars", () => {
    expect(
      CanonicalPathwayRetireSchema.safeParse({
        pathwayId: "pw-001", actorId: "dr-jones", traceId: "t-456", reason: "ab",
      }).success
    ).toBe(false);
  });
});

describe("kbValidationSchemas — CanonicalDraftFromCaseSchema", () => {
  it("accepts valid draft-from-case payload", () => {
    expect(
      CanonicalDraftFromCaseSchema.safeParse({
        complaint: "sore throat",
        features: { fever: true, exudate: true },
        actorId: "dr-smith",
        traceId: "t-789",
      }).success
    ).toBe(true);
  });

  it("requires complaint", () => {
    expect(
      CanonicalDraftFromCaseSchema.safeParse({
        features: {}, actorId: "dr-smith", traceId: "t-789",
      }).success
    ).toBe(false);
  });
});

// ─── Confidence Engine ────────────────────────────────────────────────────────
import {
  calculateConfidence,
  confidenceRationale,
  isHighConfidence,
  requiresAdditionalEvidence,
} from "../../server/services/clinical/confidenceEngine";

describe("confidenceEngine", () => {
  it("returns HIGH for probability > 0.8", () => {
    expect(calculateConfidence(0.85)).toBe("HIGH");
  });

  it("returns HIGH for probability < 0.2", () => {
    expect(calculateConfidence(0.1)).toBe("HIGH");
  });

  it("returns MEDIUM for probability 0.6-0.8", () => {
    expect(calculateConfidence(0.70)).toBe("MEDIUM");
  });

  it("returns MEDIUM for probability 0.2-0.4", () => {
    expect(calculateConfidence(0.30)).toBe("MEDIUM");
  });

  it("returns LOW for probability around 0.5", () => {
    expect(calculateConfidence(0.50)).toBe("LOW");
  });

  it("returns LOW for probability 0.45", () => {
    expect(calculateConfidence(0.45)).toBe("LOW");
  });

  it("isHighConfidence returns true at 0.9", () => {
    expect(isHighConfidence(0.9)).toBe(true);
  });

  it("isHighConfidence returns false at 0.5", () => {
    expect(isHighConfidence(0.5)).toBe(false);
  });

  it("requiresAdditionalEvidence returns true at 0.5", () => {
    expect(requiresAdditionalEvidence(0.5)).toBe(true);
  });

  it("requiresAdditionalEvidence returns false at 0.9", () => {
    expect(requiresAdditionalEvidence(0.9)).toBe(false);
  });

  it("confidenceRationale is a non-empty string", () => {
    expect(confidenceRationale(0.9).length).toBeGreaterThan(5);
    expect(confidenceRationale(0.5).length).toBeGreaterThan(5);
    expect(confidenceRationale(0.1).length).toBeGreaterThan(5);
  });
});

// ─── Escalation Engine ────────────────────────────────────────────────────────
import { shouldEscalate } from "../../server/services/monitoring/escalationEngine";

describe("escalationEngine", () => {
  const criticalAlert = {
    type: "over_treatment" as const,
    message: "over-treatment",
    severity: "critical" as const,
    probability: 0.05,
    decision: "ANTIBIOTIC",
  };

  const warningAlert = {
    type: "under_treatment" as const,
    message: "under-treatment",
    severity: "warning" as const,
    probability: 0.8,
    decision: "NO_ANTIBIOTIC",
  };

  it("escalates immediately when a critical alert exists", () => {
    const r = shouldEscalate({ riskAlerts: [criticalAlert], confidence: "HIGH" });
    expect(r.shouldEscalate).toBe(true);
    expect(r.escalationLevel).toBe("immediate");
  });

  it("escalates urgently when warning + LOW confidence", () => {
    const r = shouldEscalate({ riskAlerts: [warningAlert], confidence: "LOW" });
    expect(r.shouldEscalate).toBe(true);
    expect(r.escalationLevel).toBe("urgent");
  });

  it("notifies when LOW confidence alone", () => {
    const r = shouldEscalate({ riskAlerts: [], confidence: "LOW" });
    expect(r.shouldEscalate).toBe(true);
    expect(r.escalationLevel).toBe("notify");
  });

  it("no escalation when high confidence and no alerts", () => {
    const r = shouldEscalate({ riskAlerts: [], confidence: "HIGH" });
    expect(r.shouldEscalate).toBe(false);
    expect(r.escalationLevel).toBe("none");
  });

  it("no escalation when medium confidence and no alerts", () => {
    const r = shouldEscalate({ riskAlerts: [], confidence: "MEDIUM" });
    expect(r.shouldEscalate).toBe(false);
    expect(r.escalationLevel).toBe("none");
  });

  it("escalation reasons array is populated on escalate", () => {
    const r = shouldEscalate({ riskAlerts: [criticalAlert], confidence: "HIGH" });
    expect(r.escalationReasons.length).toBeGreaterThan(0);
  });

  it("escalation reasons empty when no escalation", () => {
    const r = shouldEscalate({ riskAlerts: [], confidence: "HIGH" });
    expect(r.escalationReasons.length).toBe(0);
  });
});

// ─── Consistency Engine ───────────────────────────────────────────────────────
import { checkConsistency, buildConsistencyRecord } from "../../server/services/clinical/consistencyEngine";

describe("consistencyEngine", () => {
  const makeRecord = (decision: string) => ({
    decision,
    complaint: "sore throat",
    timestamp: new Date(),
  });

  it("consistent when history is empty", () => {
    const r = checkConsistency([], "ANTIBIOTIC");
    expect(r.consistent).toBe(true);
    expect(r.mismatchCount).toBe(0);
  });

  it("consistent when all history matches new decision", () => {
    const history = [makeRecord("ANTIBIOTIC"), makeRecord("ANTIBIOTIC")];
    const r = checkConsistency(history, "ANTIBIOTIC");
    expect(r.consistent).toBe(true);
    expect(r.mismatchCount).toBe(0);
  });

  it("inconsistent when mismatch count reaches threshold", () => {
    const history = [makeRecord("ANTIBIOTIC"), makeRecord("ANTIBIOTIC")];
    const r = checkConsistency(history, "NO_ANTIBIOTIC", 2);
    expect(r.consistent).toBe(false);
    expect(r.mismatchCount).toBe(2);
    expect(r.alertRequired).toBe(true);
  });

  it("consistent when mismatches below threshold", () => {
    const history = [makeRecord("ANTIBIOTIC"), makeRecord("NO_ANTIBIOTIC")];
    const r = checkConsistency(history, "ANTIBIOTIC", 2);
    expect(r.consistent).toBe(true);
    expect(r.mismatchCount).toBe(1);
  });

  it("mismatchRate calculation is correct", () => {
    const history = [makeRecord("ANTIBIOTIC"), makeRecord("ANTIBIOTIC"), makeRecord("NO_ANTIBIOTIC")];
    const r = checkConsistency(history, "NO_ANTIBIOTIC", 5);
    expect(r.mismatchCount).toBe(2);
    expect(r.mismatchRate).toBeCloseTo(2 / 3, 2);
  });

  it("dominantDecision is the most frequent decision in history", () => {
    const history = [makeRecord("ANTIBIOTIC"), makeRecord("ANTIBIOTIC"), makeRecord("NO_ANTIBIOTIC")];
    const r = checkConsistency(history, "ANTIBIOTIC");
    expect(r.dominantDecision).toBe("ANTIBIOTIC");
  });

  it("buildConsistencyRecord returns a valid record", () => {
    const rec = buildConsistencyRecord("ANTIBIOTIC", "sore throat");
    expect(rec.decision).toBe("ANTIBIOTIC");
    expect(rec.complaint).toBe("sore throat");
    expect(rec.timestamp).toBeInstanceOf(Date);
  });
});

// ─── Override Engine ─────────────────────────────────────────────────────────
import { handleOverride } from "../../server/services/clinical/overrideEngine";

describe("overrideEngine", () => {
  it("detects discrepancy when physician overrides with antibiotic", async () => {
    const r = await handleOverride({
      physicianDecision: "ANTIBIOTIC",
      systemDecision: "NO_ANTIBIOTIC",
      reason: "Patient looks very ill, clinically indicated",
    });
    expect(r.override).toBe(true);
    expect(r.discrepancy).toBe(true);
    expect(r.learningSignal).toBe("positive_override");
  });

  it("detects negative override when physician withholds antibiotic", async () => {
    const r = await handleOverride({
      physicianDecision: "NO_ANTIBIOTIC",
      systemDecision: "ANTIBIOTIC",
      reason: "Viral presentation, no bacterial signs",
    });
    expect(r.override).toBe(true);
    expect(r.learningSignal).toBe("negative_override");
  });

  it("no override when physician aligns with system", async () => {
    const r = await handleOverride({
      physicianDecision: "ANTIBIOTIC",
      systemDecision: "ANTIBIOTIC",
      reason: "Agreed with AI recommendation",
    });
    expect(r.override).toBe(false);
    expect(r.discrepancy).toBe(false);
    expect(r.learningSignal).toBe("aligned");
  });

  it("adds warning note for brief override reason", async () => {
    const r = await handleOverride({
      physicianDecision: "ANTIBIOTIC",
      systemDecision: "NO_ANTIBIOTIC",
      reason: "gut",
    });
    expect(r.notes.some((n) => n.toLowerCase().includes("brief") || n.toLowerCase().includes("warning"))).toBe(true);
  });

  it("returns reason in result", async () => {
    const r = await handleOverride({
      physicianDecision: "NO_ANTIBIOTIC",
      systemDecision: "NO_ANTIBIOTIC",
      reason: "Aligned decision",
    });
    expect(r.reason).toBe("Aligned decision");
  });
});

// ─── Golden Case Consistency Integration ─────────────────────────────────────
import { evaluateGoldenCase, scoreGoldenMatch } from "../../server/services/goldenCaseConsistencyIntegration";
import { runClinicalConsistencyEngine } from "../../server/services/clinicalConsistencyEngine";

describe("goldenCaseConsistencyIntegration", () => {
  it("evaluateGoldenCase returns a result with phenotypeHash", () => {
    const r = evaluateGoldenCase({
      complaint: "sore throat",
      features: { fever: true, exudate: true, nodes: true, absenceOfCough: true },
    });
    expect(typeof r.phenotypeHash).toBe("string");
    expect(r.phenotypeHash.length).toBeGreaterThan(0);
  });

  it("passes when no expectations provided", () => {
    const r = evaluateGoldenCase({
      complaint: "cough",
      features: {},
    });
    expect(r.passed).toBe(true);
    expect(r.total).toBe(0);
    expect(r.accuracy).toBe(1);
  });

  it("detects syndrome mismatch correctly", () => {
    const r = evaluateGoldenCase({
      complaint: "sore throat",
      features: { fever: true },
      expectedSyndromeId: "non-existent-syndrome-xyz",
    });
    expect(r.passed).toBe(false);
    expect(r.mismatches.length).toBeGreaterThan(0);
    expect(r.mismatches[0]).toContain("non-existent-syndrome-xyz");
  });

  it("accuracy is 1.0 when all expectations match", () => {
    const canonical = runClinicalConsistencyEngine("sore throat", { fever: true, exudate: true });
    const r = evaluateGoldenCase({
      complaint: "sore throat",
      features: { fever: true, exudate: true },
      expectedDisposition: canonical.disposition.disposition,
    });
    expect(r.accuracy).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("scoreGoldenMatch counts matched expectations correctly", () => {
    const canonical = runClinicalConsistencyEngine("sore throat", { fever: true });
    const { matched, total } = scoreGoldenMatch({
      expectedDisposition: canonical.disposition.disposition,
      actual: canonical,
    });
    expect(matched).toBe(1);
    expect(total).toBe(1);
  });

  it("scoreGoldenMatch records mismatch reason", () => {
    const canonical = runClinicalConsistencyEngine("sore throat", {});
    const { reasons } = scoreGoldenMatch({
      expectedMedicationKey: "vancomycin",
      actual: canonical,
    });
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toContain("vancomycin");
  });
});

// ─── Simulation Engine (enhanced) ────────────────────────────────────────────
import { runSimulation, summarizeSimulation, runScenarios } from "../../server/services/simulation/simulationEngine";

describe("simulationEngine (enhanced)", () => {
  it("runSimulation returns n results", async () => {
    const results = await runSimulation(100);
    expect(results.length).toBe(100);
  });

  it("every result has correctDecision, confidence, riskFlags", async () => {
    const results = await runSimulation(50);
    for (const r of results) {
      expect(typeof r.correctDecision).toBe("boolean");
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(r.confidence);
      expect(Array.isArray(r.riskFlags)).toBe(true);
    }
  });

  it("summarizeSimulation includes accuracy and risk counts", async () => {
    const results = await runSimulation(200);
    const s = summarizeSimulation(results);
    expect(typeof s.accuracy).toBe("number");
    expect(s.accuracy).toBeGreaterThanOrEqual(0);
    expect(s.accuracy).toBeLessThanOrEqual(1);
    expect(typeof s.criticalRiskCount).toBe("number");
    expect(typeof s.warningRiskCount).toBe("number");
    expect(typeof s.highConfidenceRate).toBe("number");
  });

  it("summarizeSimulation returns zeroed summary for empty results", () => {
    const s = summarizeSimulation([]);
    expect(s.totalRuns).toBe(0);
    expect(s.accuracy).toBe(0);
  });

  it("antibioticRate + noAntibioticRate ≈ 1.0", async () => {
    const results = await runSimulation(500);
    const s = summarizeSimulation(results);
    expect(s.antibioticRate + s.noAntibioticRate).toBeCloseTo(1, 2);
  });

  it("runSimulation with high_acuity scenario has higher antibiotic rate", async () => {
    const defaultResults   = await runSimulation(300, "default");
    const highAcuityResults = await runSimulation(300, "high_acuity");
    const defaultS    = summarizeSimulation(defaultResults);
    const highAcuityS = summarizeSimulation(highAcuityResults);
    expect(highAcuityS.antibioticRate).toBeGreaterThan(defaultS.antibioticRate);
  });

  it("runScenarios returns 3 scenarios", async () => {
    const scenarios = await runScenarios(50);
    expect(scenarios.length).toBe(3);
    const names = scenarios.map((s) => s.scenario);
    expect(names).toContain("default");
    expect(names).toContain("high_acuity");
    expect(names).toContain("low_acuity");
  });
});

// ─── KB Admin Consistency Integration (handler logic) ────────────────────────
import {
  generateCanonicalDraftFromCaseHandler,
  previewCanonicalPromotionHandler,
} from "../../server/services/kbAdminConsistencyIntegration";

describe("kbAdminConsistencyIntegration — handler unit tests", () => {
  const makeRes = () => {
    let _body: any;
    let _status = 200;
    return {
      json: vi.fn((b: any) => { _body = b; return {} as any; }),
      status: vi.fn((s: number) => { _status = s; return { json: vi.fn((b) => { _body = b; }) } as any; }),
      get body() { return _body; },
      get statusCode() { return _status; },
    };
  };

  it("generateCanonicalDraftFromCaseHandler returns a valid draft", async () => {
    const req = {
      body: {
        complaint: "sore throat",
        features: { fever: true, exudate: true },
        actorId: "dr-test",
        traceId: "trace-test",
      },
    } as any;
    const res = makeRes();
    await generateCanonicalDraftFromCaseHandler(req, res);
    expect(res.json).toHaveBeenCalled();
    const call = res.json.mock.calls[0][0];
    expect(call.ok).toBe(true);
    expect(call.draft).toBeDefined();
    expect(call.draft.complaintId).toBe("sore throat");
    expect(typeof call.draft.treatmentClass).toBe("string");
  });

  it("generateCanonicalDraftFromCaseHandler 400 on bad body", async () => {
    const req = { body: { actorId: "x" } } as any;
    const res = makeRes();
    await generateCanonicalDraftFromCaseHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("previewCanonicalPromotionHandler returns preview with wouldCreate", async () => {
    const req = {
      body: {
        sourceType: "manual",
        complaintId: "preview-test-unique-complaintId",
        syndromeId: "preview-test-syndrome",
        label: "Preview pathway",
        treatmentClass: "supportive",
        canonicalDisposition: "home_supportive_care",
        actorId: "dr-preview",
        traceId: "trace-preview",
      },
    } as any;
    const res = makeRes();
    await previewCanonicalPromotionHandler(req, res);
    expect(res.json).toHaveBeenCalled();
    const call = res.json.mock.calls[0][0];
    expect(call.ok).toBe(true);
    expect(call.preview).toBeDefined();
    expect(typeof call.preview.wouldCreate).toBe("boolean");
  });
});

// ─── Physician Override Integration (handler unit tests) ─────────────────────
import {
  createPhysicianOverride,
  listPhysicianOverrides,
} from "../../server/services/physicianOverrideIntegration";

describe("physicianOverrideIntegration", () => {
  it("createPhysicianOverride returns a record with discrepancy=true", async () => {
    const r = await createPhysicianOverride({
      patientId: "p-unit-01",
      complaint: "sore throat",
      systemDecision: "NO_ANTIBIOTIC",
      physicianDecision: "ANTIBIOTIC",
      reason: "Clinically indicated",
      actorId: "dr-unit",
      traceId: "tr-unit",
    });
    expect(r.discrepancy).toBe(true);
    expect(r.overrideId).toBeDefined();
  });

  it("createPhysicianOverride discrepancy=false when decisions match", async () => {
    const r = await createPhysicianOverride({
      patientId: "p-unit-02",
      complaint: "sore throat",
      systemDecision: "ANTIBIOTIC",
      physicianDecision: "ANTIBIOTIC",
      reason: "Agreed",
      actorId: "dr-unit",
      traceId: "tr-unit-2",
    });
    expect(r.discrepancy).toBe(false);
  });

  it("listPhysicianOverrides returns an array", async () => {
    const list = await listPhysicianOverrides();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(0);
  });

  it("listPhysicianOverrides by actorId filters correctly (in-memory)", async () => {
    await createPhysicianOverride({
      patientId: "p-filter-01",
      complaint: "cough",
      systemDecision: "NO_ANTIBIOTIC",
      physicianDecision: "ANTIBIOTIC",
      reason: "Patient comorbidities warrant coverage",
      actorId: "dr-filter-batch26",
      traceId: "tr-filter",
    });
    const list = await listPhysicianOverrides("dr-filter-batch26");
    const match = list.some((o) => o.actorId === "dr-filter-batch26");
    expect(match).toBe(true);
  });
});
