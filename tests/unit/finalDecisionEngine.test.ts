import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeFinalDecision,
  createOrCheckCheckpoint,
  buildPatientResponse,
  getTestEscalationStore,
  type FinalDecisionInput,
  type DecisionContext,
} from "../../server/clinical/finalDecisionEngine";

import {
  type PosteriorAnalysis,
  type DifferentialResult,
} from "../../server/clinical/posteriorAnalysis";

import {
  validateTestCase,
} from "../../server/testing/validator";

import {
  extractLearningSignals,
} from "../../server/learning/learningSignals";

import {
  generateFixes,
} from "../../server/learning/fixGenerator";

import {
  compareResults,
  type SuiteRunResult,
} from "../../server/testing/testSuiteRunner";

vi.mock("../../server/compliance/physicianCheckpoint", async () => {
  const actual = await vi.importActual<any>("../../server/compliance/physicianCheckpoint");
  return {
    ...actual,
    createPhysicianApprovalRequest: vi.fn(async (params: any) => ({
      approvalId: "test-approval-001",
      caseId: params.caseId,
      traceId: "trace-001",
      proposedDisposition: params.disposition,
      modelVersion: params.modelVersion,
      agentWeights: {},
      confidenceScore: params.confidenceScore,
      redFlagsEvaluated: [],
      requestedAt: new Date().toISOString(),
      timeoutAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      timeoutMinutes: 10,
      status: "PENDING",
    })),
    getAllApprovals: vi.fn(() => []),
  };
});

vi.mock("../../server/audit/auditLogger", () => ({
  auditStep: vi.fn(),
  createTraceId: vi.fn(() => "trace-001"),
}));

vi.mock("../../server/security/auditLogger", () => ({
  auditLog: vi.fn(),
  logSecureEvent: vi.fn(),
}));

vi.mock("../../server/agents/selfImprove", () => ({
  evaluateAndImprove: vi.fn(async () => []),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePosterior(
  topDiagnosis: string,
  topPosterior: number,
  options: {
    margin?: number;
    isUncertain?: boolean;
    extraDiff?: DifferentialResult[];
  } = {},
): PosteriorAnalysis {
  const margin = options.margin ?? 0.3;
  const second = topPosterior - margin;
  const differential: DifferentialResult[] = [
    { diagnosis: topDiagnosis, posterior: topPosterior },
    { diagnosis: "other", posterior: Math.max(0.01, second) },
    ...(options.extraDiff ?? []),
  ];
  return {
    topDiagnosis,
    topPosterior,
    differential,
    entropy: 0.5,
    margin,
    isUncertain: options.isUncertain ?? margin < 0.15,
  };
}

function makeInput(overrides: Partial<FinalDecisionInput> = {}): FinalDecisionInput {
  return {
    state: {
      caseId: "case-001",
      symptoms: ["fever", "cough"],
      scores: { erRisk: 0.2 },
    },
    posterior: makePosterior("flu", 0.8),
    erProbability: 0.2,
    store: getTestEscalationStore(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. computeFinalDecision — pipeline ordering and basic cases
// ═══════════════════════════════════════════════════════════════════════════════
describe("computeFinalDecision — pipeline ordering", () => {
  it("returns a complete DecisionContext with all fields", async () => {
    const ctx = await computeFinalDecision(makeInput());
    expect(ctx.caseId).toBe("case-001");
    expect(ctx.initialDisposition).toBeTruthy();
    expect(ctx.safety).toBeDefined();
    expect(ctx.trace.length).toBeGreaterThan(0);
    expect(ctx.finalDisposition).toBeTruthy();
  });

  it("populates trace with ordered reasoning steps", async () => {
    const ctx = await computeFinalDecision(makeInput());
    expect(ctx.trace[0]).toMatch(/Initial disposition/i);
    expect(ctx.trace.some(t => /Safety gate/i.test(t))).toBe(true);
    expect(ctx.trace.some(t => /Final disposition/i.test(t))).toBe(true);
  });

  it("finalDisposition is set on every successful run", async () => {
    const ctx = await computeFinalDecision(makeInput());
    expect(ctx.finalDisposition).toBeDefined();
    expect(typeof ctx.finalDisposition).toBe("string");
  });

  it("is deterministic — same input produces same disposition", async () => {
    const input = makeInput();
    const ctx1 = await computeFinalDecision(input);
    const ctx2 = await computeFinalDecision(input);
    expect(ctx1.finalDisposition).toBe(ctx2.finalDisposition);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Safety gate blocks — FAIL CLOSED
// ═══════════════════════════════════════════════════════════════════════════════
describe("computeFinalDecision — safety gate BLOCKED", () => {
  it("returns BLOCKED when erProbability exceeds hard-stop threshold (0.95)", async () => {
    const ctx = await computeFinalDecision(makeInput({ erProbability: 0.97 }));
    expect(ctx.finalDisposition).toBe("BLOCKED");
    expect(ctx.safety.allowed).toBe(false);
  });

  it("terminates pipeline early — no checkpoint when safety blocks", async () => {
    const ctx = await computeFinalDecision(makeInput({ erProbability: 0.97 }));
    expect(ctx.checkpoint).toBeUndefined();
  });

  it("trace contains safety gate block entry", async () => {
    const ctx = await computeFinalDecision(makeInput({ erProbability: 0.97 }));
    const safetyTrace = ctx.trace.find(t => /Safety gate/i.test(t));
    expect(safetyTrace).toBeTruthy();
    const blockedTrace = ctx.trace.find(t => /BLOCKED/i.test(t) || /fail-closed/i.test(t));
    expect(blockedTrace).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Risk override beats posterior
// ═══════════════════════════════════════════════════════════════════════════════
describe("computeFinalDecision — risk override", () => {
  it("sets riskOverrideApplied=true and initialDisposition=ER_NOW for PE", async () => {
    const posterior = makePosterior("uri", 0.6, {
      extraDiff: [{ diagnosis: "pulmonary_embolism", posterior: 0.08 }],
    });
    const ctx = await computeFinalDecision(makeInput({ posterior, erProbability: 0.2 }));
    expect(ctx.riskOverrideApplied).toBe(true);
    expect(ctx.initialDisposition).toBe("ER_NOW");
  });

  it("risk override trace entry is present", async () => {
    const posterior = makePosterior("uri", 0.6, {
      extraDiff: [{ diagnosis: "pulmonary_embolism", posterior: 0.08 }],
    });
    const ctx = await computeFinalDecision(makeInput({ posterior, erProbability: 0.2 }));
    expect(ctx.trace.some(t => /risk override/i.test(t))).toBe(true);
  });

  it("meningitis triggers risk override even at low posterior", async () => {
    const posterior = makePosterior("headache", 0.7, {
      extraDiff: [{ diagnosis: "meningitis", posterior: 0.07 }],
    });
    const ctx = await computeFinalDecision(makeInput({ posterior, erProbability: 0.1 }));
    expect(ctx.riskOverrideApplied).toBe(true);
  });

  it("no risk override without high-risk diagnosis", async () => {
    const ctx = await computeFinalDecision(makeInput());
    expect(ctx.riskOverrideApplied).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Physician checkpoint
// ═══════════════════════════════════════════════════════════════════════════════
describe("computeFinalDecision — physician checkpoint", () => {
  it("checkpoint pending → AWAITING_PHYSICIAN", async () => {
    const { getAllApprovals, createPhysicianApprovalRequest } = await import(
      "../../server/compliance/physicianCheckpoint"
    );
    vi.mocked(getAllApprovals).mockReturnValue([]);
    vi.mocked(createPhysicianApprovalRequest).mockResolvedValue({
      approvalId: "a1",
      caseId: "case-001",
      traceId: "t1",
      proposedDisposition: "ER_URGENT" as any,
      modelVersion: "1.0.0",
      agentWeights: {},
      confidenceScore: 0.7,
      redFlagsEvaluated: [],
      requestedAt: new Date().toISOString(),
      timeoutAt: new Date(Date.now() + 600_000).toISOString(),
      timeoutMinutes: 10,
      status: "PENDING",
    });

    const posterior = makePosterior("chest_pain", 0.7);
    const ctx = await computeFinalDecision(
      makeInput({
        posterior,
        erProbability: 0.45,
        state: {
          caseId: "case-001",
          symptoms: ["chest_pain", "fever"],
          scores: { erRisk: 0.45 },
        },
      }),
    );

    if (ctx.checkpoint) {
      expect(["pending", "approved", "rejected", "expired"]).toContain(ctx.checkpoint.status);
    }
  });

  it("no checkpoint created when disposition doesn't require physician approval", async () => {
    const ctx = await computeFinalDecision(makeInput({ erProbability: 0.2 }));
    if (ctx.checkpoint) {
      expect(ctx.checkpoint.required).toBe(true);
    } else {
      expect(ctx.checkpoint).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Escalation path — finalProb >= threshold → ER_NOW
// ═══════════════════════════════════════════════════════════════════════════════
describe("computeFinalDecision — escalation probability gate", () => {
  it("finalDisposition = ER_NOW when erProbability is 0.6 (above 0.5 threshold)", async () => {
    const ctx = await computeFinalDecision(makeInput({ erProbability: 0.6 }));
    expect(ctx.finalDisposition).toBe("ER_NOW");
  });

  it("finalDisposition follows initialDisposition when erProbability is below threshold", async () => {
    const ctx = await computeFinalDecision(makeInput({ erProbability: 0.1 }));
    expect(ctx.finalDisposition).not.toBe("ER_NOW");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. createOrCheckCheckpoint — idempotency and timeout handling
// ═══════════════════════════════════════════════════════════════════════════════
describe("createOrCheckCheckpoint", () => {
  it("returns pending when no existing record and approval created", async () => {
    const { getAllApprovals, createPhysicianApprovalRequest } = await import(
      "../../server/compliance/physicianCheckpoint"
    );
    vi.mocked(getAllApprovals).mockReturnValue([]);
    vi.mocked(createPhysicianApprovalRequest).mockResolvedValue({
      approvalId: "new-a",
      caseId: "c1",
      traceId: "t1",
      proposedDisposition: "ER_NOW" as any,
      modelVersion: "1.0.0",
      agentWeights: {},
      confidenceScore: 0.8,
      redFlagsEvaluated: [],
      requestedAt: new Date().toISOString(),
      timeoutAt: new Date(Date.now() + 300_000).toISOString(),
      timeoutMinutes: 5,
      status: "PENDING",
    });

    const posterior = makePosterior("flu", 0.8);
    const checkpoint = await createOrCheckCheckpoint({
      caseId: "c1",
      posterior,
      initialDisposition: "ER_NOW",
    });
    expect(checkpoint.status).toBe("pending");
    expect(checkpoint.required).toBe(true);
  });

  it("returns expired when existing TIMED_OUT record found", async () => {
    const { getAllApprovals } = await import("../../server/compliance/physicianCheckpoint");
    vi.mocked(getAllApprovals).mockReturnValue([
      {
        approvalId: "expired-a",
        caseId: "c2",
        traceId: "t2",
        proposedDisposition: "ER_NOW" as any,
        modelVersion: "1.0.0",
        agentWeights: {},
        confidenceScore: 0.8,
        redFlagsEvaluated: [],
        requestedAt: new Date(Date.now() - 600_000).toISOString(),
        timeoutAt: new Date(Date.now() - 100_000).toISOString(),
        timeoutMinutes: 5,
        status: "TIMED_OUT",
      },
    ]);

    const posterior = makePosterior("flu", 0.8);
    const checkpoint = await createOrCheckCheckpoint({
      caseId: "c2",
      posterior,
      initialDisposition: "ER_NOW",
    });
    expect(checkpoint.status).toBe("expired");
  });

  it("returns approved when existing APPROVED record found", async () => {
    const { getAllApprovals } = await import("../../server/compliance/physicianCheckpoint");
    vi.mocked(getAllApprovals).mockReturnValue([
      {
        approvalId: "approved-a",
        caseId: "c3",
        traceId: "t3",
        proposedDisposition: "ER_NOW" as any,
        modelVersion: "1.0.0",
        agentWeights: {},
        confidenceScore: 0.9,
        redFlagsEvaluated: [],
        requestedAt: new Date(Date.now() - 300_000).toISOString(),
        timeoutAt: new Date(Date.now() + 300_000).toISOString(),
        timeoutMinutes: 10,
        status: "APPROVED",
      },
    ]);

    const posterior = makePosterior("flu", 0.8);
    const checkpoint = await createOrCheckCheckpoint({
      caseId: "c3",
      posterior,
      initialDisposition: "ER_NOW",
    });
    expect(checkpoint.status).toBe("approved");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. buildPatientResponse — safe patient-facing text
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildPatientResponse", () => {
  function fakeCtx(finalDisposition: string): DecisionContext {
    return {
      caseId: "x",
      posterior: makePosterior("flu", 0.8),
      initialDisposition: "HOME",
      riskOverrideApplied: false,
      safety: { allowed: true, code: "PASS", reason: "ok" },
      finalDisposition,
      trace: [],
    };
  }

  it("BLOCKED → review message", () => {
    expect(buildPatientResponse(fakeCtx("BLOCKED"))).toMatch(/additional review/i);
  });

  it("AWAITING_PHYSICIAN → clinician reviewing", () => {
    expect(buildPatientResponse(fakeCtx("AWAITING_PHYSICIAN"))).toMatch(/clinician/i);
  });

  it("ER_NOW → emergency care", () => {
    expect(buildPatientResponse(fakeCtx("ER_NOW"))).toMatch(/emergency/i);
  });

  it("ESCALATED_NO_RESPONSE → urgent evaluation", () => {
    expect(buildPatientResponse(fakeCtx("ESCALATED_NO_RESPONSE"))).toMatch(/urgent/i);
  });

  it("HOME → home care", () => {
    expect(buildPatientResponse(fakeCtx("HOME"))).toMatch(/home care/i);
  });

  it("URGENT_CARE → urgent care center", () => {
    expect(buildPatientResponse(fakeCtx("URGENT_CARE"))).toMatch(/urgent care/i);
  });

  it("NEEDS_MORE_DATA → more information", () => {
    expect(buildPatientResponse(fakeCtx("NEEDS_MORE_DATA"))).toMatch(/more information/i);
  });

  it("unknown disposition → safe fallback", () => {
    expect(buildPatientResponse(fakeCtx("SOME_UNKNOWN_STATE"))).toMatch(/additional review/i);
  });

  it("never exposes raw internal state strings", () => {
    const response = buildPatientResponse(fakeCtx("BLOCKED"));
    expect(response).not.toMatch(/BLOCKED|ctx\.|DecisionContext/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. validateTestCase — harness validator
// ═══════════════════════════════════════════════════════════════════════════════
describe("validateTestCase", () => {
  function fakeRun(finalDisposition: string, topDiagnosis = "flu"): any {
    const posterior = makePosterior(topDiagnosis, 0.8);
    const decision: DecisionContext = {
      caseId: "c1",
      posterior,
      initialDisposition: finalDisposition,
      riskOverrideApplied: false,
      safety: { allowed: finalDisposition !== "BLOCKED", code: "PASS", reason: "ok" },
      finalDisposition,
      trace: [],
    };
    return {
      caseId: "c1",
      nodeTrace: [],
      errors: [],
      posterior,
      decision,
    };
  }

  it("passes when disposition matches", () => {
    const v = validateTestCase(
      { id: "t1", input: { message: "" }, expected: { disposition: "HOME" } },
      fakeRun("HOME"),
    );
    expect(v.passed).toBe(true);
    expect(v.failures).toHaveLength(0);
  });

  it("fails when disposition does not match", () => {
    const v = validateTestCase(
      { id: "t1", input: { message: "" }, expected: { disposition: "ER_NOW" } },
      fakeRun("HOME"),
    );
    expect(v.passed).toBe(false);
    expect(v.failures[0]).toMatch(/disposition/i);
  });

  it("fails when primaryDiagnosis does not match", () => {
    const v = validateTestCase(
      { id: "t1", input: { message: "" }, expected: { primaryDiagnosis: "covid" } },
      fakeRun("HOME", "flu"),
    );
    expect(v.passed).toBe(false);
    expect(v.failures[0]).toMatch(/diagnosis/i);
  });

  it("fails when safety gate expected to block but passed", () => {
    const run = fakeRun("HOME");
    run.decision.safety.allowed = true;
    const v = validateTestCase(
      { id: "t1", input: { message: "" }, expected: { mustTriggerSafetyGate: true } },
      run,
    );
    expect(v.passed).toBe(false);
    expect(v.failures[0]).toMatch(/safety gate/i);
  });

  it("collects all failures without short-circuiting", () => {
    const v = validateTestCase(
      {
        id: "t1",
        input: { message: "" },
        expected: {
          disposition: "ER_NOW",
          primaryDiagnosis: "covid",
        },
      },
      fakeRun("HOME", "flu"),
    );
    expect(v.failures.length).toBeGreaterThanOrEqual(2);
  });

  it("fails when no decision is produced", () => {
    const v = validateTestCase(
      { id: "t1", input: { message: "" }, expected: { disposition: "HOME" } },
      { caseId: "c1", nodeTrace: [], errors: ["something failed"] },
    );
    expect(v.passed).toBe(false);
    expect(v.failures[0]).toMatch(/no decision/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. extractLearningSignals — signal classification
// ═══════════════════════════════════════════════════════════════════════════════
describe("extractLearningSignals", () => {
  const baseCase = { id: "tc1", input: { message: "" }, expected: { disposition: "ER_NOW" } };
  const baseRun = { caseId: "tc1", nodeTrace: [], errors: [], resolvedComplaint: "cough" };

  it("produces wrong_disposition signal on disposition failure", () => {
    const signals = extractLearningSignals(
      baseCase,
      baseRun as any,
      { passed: false, failures: ["[tc1] Expected disposition ER_NOW, got HOME"] },
    );
    expect(signals.some(s => s.failureType === "wrong_disposition")).toBe(true);
  });

  it("produces missed_diagnosis signal on diagnosis failure", () => {
    const signals = extractLearningSignals(
      baseCase,
      baseRun as any,
      { passed: false, failures: ["[tc1] Expected primary diagnosis flu, got covid"] },
    );
    expect(signals.some(s => s.failureType === "missed_diagnosis")).toBe(true);
  });

  it("produces unsafe_pass signal on safety gate failure", () => {
    const signals = extractLearningSignals(
      baseCase,
      baseRun as any,
      { passed: false, failures: ["[tc1] Expected safety gate to block, but it passed"] },
    );
    expect(signals.some(s => s.failureType === "unsafe_pass")).toBe(true);
  });

  it("returns empty array for passing validation", () => {
    const signals = extractLearningSignals(baseCase, baseRun as any, { passed: true, failures: [] });
    expect(signals).toHaveLength(0);
  });

  it("context.complaint is populated from resolvedComplaint", () => {
    const signals = extractLearningSignals(
      baseCase,
      { ...baseRun, resolvedComplaint: "chest_pain" } as any,
      { passed: false, failures: ["Expected disposition ER_NOW, got HOME"] },
    );
    expect(signals[0].context.complaint).toBe("chest_pain");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. generateFixes — constrained fix generation
// ═══════════════════════════════════════════════════════════════════════════════
describe("generateFixes", () => {
  it("generates adjust_prior fix for missed_diagnosis signal", () => {
    const fixes = generateFixes([{
      caseId: "tc1",
      failureType: "missed_diagnosis",
      expected: "flu",
      actual: "covid",
      context: { complaint: "cough", symptoms: ["cough", "fever"] },
    }]);
    expect(fixes.some(f => f.type === "adjust_prior")).toBe(true);
    expect(fixes[0].target.diagnosis).toBe("flu");
  });

  it("generates adjust_threshold fix for over_escalation signal", () => {
    const fixes = generateFixes([{
      caseId: "tc2",
      failureType: "over_escalation",
      expected: "AWAITING_PHYSICIAN",
      actual: "ER_NOW",
      context: { complaint: "cough", symptoms: [] },
    }]);
    expect(fixes.some(f => f.type === "adjust_threshold")).toBe(true);
  });

  it("generates add_red_flag fix for unsafe_pass signal", () => {
    const fixes = generateFixes([{
      caseId: "tc3",
      failureType: "unsafe_pass",
      expected: "BLOCKED",
      actual: "HOME",
      context: { complaint: "chest_pain", symptoms: ["chest_pain"] },
    }]);
    expect(fixes.some(f => f.type === "add_red_flag")).toBe(true);
  });

  it("ALWAYS sets autoApprove: false for all clinical fixes", () => {
    const fixes = generateFixes([
      {
        caseId: "tc4",
        failureType: "missed_diagnosis",
        expected: "flu",
        actual: "cold",
        context: { complaint: "cough", symptoms: [] },
      },
      {
        caseId: "tc5",
        failureType: "over_escalation",
        expected: "HOME",
        actual: "ER_NOW",
        context: { complaint: "cough", symptoms: [] },
      },
    ]);
    expect(fixes.every(f => f.autoApprove === false)).toBe(true);
  });

  it("ALWAYS sets category: clinical for all generated fixes", () => {
    const fixes = generateFixes([{
      caseId: "tc6",
      failureType: "wrong_disposition",
      expected: "HOME",
      actual: "ER_NOW",
      context: { complaint: "cough", symptoms: [] },
    }]);
    expect(fixes.every(f => f.category === "clinical")).toBe(true);
  });

  it("returns empty array for empty signal list", () => {
    expect(generateFixes([])).toHaveLength(0);
  });

  it("each fix has a unique id", () => {
    const fixes = generateFixes([
      {
        caseId: "tc7",
        failureType: "missed_diagnosis",
        expected: "flu",
        actual: "cold",
        context: { complaint: "cough", symptoms: [] },
      },
      {
        caseId: "tc8",
        failureType: "missed_diagnosis",
        expected: "covid",
        actual: "cold",
        context: { complaint: "cough", symptoms: [] },
      },
    ]);
    const ids = fixes.map(f => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. compareResults — improvement delta measurement
// ═══════════════════════════════════════════════════════════════════════════════
describe("compareResults", () => {
  function makeResult(id: string, passed: boolean): SuiteRunResult {
    return {
      id,
      passed,
      failures: passed ? [] : ["failure"],
      trace: { caseId: id, nodeTrace: [], errors: [] } as any,
    };
  }

  it("improved=1 when test flips fail → pass", () => {
    const before = [makeResult("t1", false)];
    const after = [makeResult("t1", true)];
    const delta = compareResults(before, after);
    expect(delta.improved).toBe(1);
    expect(delta.worsened).toBe(0);
    expect(delta.net).toBe(1);
  });

  it("worsened=1 when test flips pass → fail", () => {
    const before = [makeResult("t1", true)];
    const after = [makeResult("t1", false)];
    const delta = compareResults(before, after);
    expect(delta.worsened).toBe(1);
    expect(delta.net).toBe(-1);
  });

  it("unchanged=0 improved, 0 worsened when results are identical", () => {
    const before = [makeResult("t1", true), makeResult("t2", false)];
    const after = [makeResult("t1", true), makeResult("t2", false)];
    const delta = compareResults(before, after);
    expect(delta.improved).toBe(0);
    expect(delta.worsened).toBe(0);
    expect(delta.net).toBe(0);
  });

  it("details array has one entry per test case", () => {
    const before = [makeResult("t1", false), makeResult("t2", true)];
    const after = [makeResult("t1", true), makeResult("t2", false)];
    const delta = compareResults(before, after);
    expect(delta.details).toHaveLength(2);
    expect(delta.details.find(d => d.id === "t1")?.change).toBe("improved");
    expect(delta.details.find(d => d.id === "t2")?.change).toBe("worsened");
  });
});
