import { describe, it, expect } from "vitest";
import { ContextCompactor, DEFAULT_POLICY, type CompactionPolicy } from "../../server/context/ContextCompactor";
import type {
  EncounterContext,
  ClinicalImmutables,
  WorkingContext,
  Artifact,
  DifferentialItem,
  AdaptiveQuestion,
  AnsweredQuestion,
} from "../../server/context/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeImmutables(overrides: Partial<ClinicalImmutables> = {}): ClinicalImmutables {
  return {
    encounterId:       "enc_test_001",
    tenantId:          "tenant_test",
    physicianId:       "phys_test",
    patient: {
      ageYears:          45,
      sex:               "M",
      allergies:         ["penicillin"],
      currentMedications: ["lisinopril 10mg"],
      relevantHistory:   ["HTN"],
    },
    chiefComplaint:       "Chest pain",
    presentingVitals: {
      hr: 88, sbp: 140, dbp: 85, spo2: 98, capturedAt: new Date().toISOString(),
    },
    redFlagsIdentified: [],
    hardConstraints:    [],
    encounterStartedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeWorking(overrides: Partial<WorkingContext> = {}): WorkingContext {
  return {
    currentDifferential: [],
    pendingQuestions:    [],
    answeredQuestions:   [],
    candidateDispositions: [],
    currentAgent:        "differential",
    step:                10,
    estimatedTokens:     DEFAULT_POLICY.workingTokenThreshold + 1000,
    ...overrides,
  };
}

function makeContext(
  working: Partial<WorkingContext> = {},
  immutableOverrides: Partial<ClinicalImmutables> = {},
): EncounterContext {
  return {
    immutables: makeImmutables(immutableOverrides),
    working:    makeWorking(working),
    artifacts:  [],
    traceRefId: "s3://auralyn-audit/test/trace.jsonl",
  };
}

function makeDiffItem(diagnosis: string, likelihood: number, staleSteps: number, currentStep: number): DifferentialItem {
  return {
    diagnosis,
    likelihood,
    supportingFindings:  ["finding_a"],
    refutingFindings:    ["finding_b"],
    evidenceQuality:     "moderate",
    lastUpdatedStep:     currentStep - staleSteps,
  };
}

function makeAnsweredQ(id: string, q: string, a: string): AnsweredQuestion {
  return {
    questionId: id, question: q, answer: a,
    answeredAt: new Date().toISOString(),
    extractedFindings: [`finding_from_${id}`],
  };
}

function makePendingQ(id: string, createdAtStep: number): AdaptiveQuestion {
  return { id, text: `Question ${id}`, purpose: "test purpose", discriminatesBetween: [], createdAtStep };
}

// ─── T1: Compactor NEVER modifies immutables ──────────────────────────────────

describe("T1 — Immutables are never touched", () => {
  it("preserves chief complaint after compaction", () => {
    const ctx = makeContext();
    const compactor = new ContextCompactor();
    const before = ctx.immutables.chiefComplaint;
    compactor.compact(ctx);
    expect(ctx.immutables.chiefComplaint).toBe(before);
  });

  it("preserves allergies after compaction", () => {
    const ctx = makeContext();
    const allergies = [...ctx.immutables.patient.allergies];
    compactor.compact(ctx);
    expect(ctx.immutables.patient.allergies).toEqual(allergies);
  });

  it("preserves vitals after compaction", () => {
    const ctx = makeContext();
    const vitals = { ...ctx.immutables.presentingVitals };
    compactor.compact(ctx);
    expect(ctx.immutables.presentingVitals).toEqual(vitals);
  });

  it("preserves red flags that were in immutables before compaction", () => {
    const ctx = makeContext({}, {
      redFlagsIdentified: [{
        id: "rf_1", description: "ACS typical presentation",
        identifiedAt: new Date().toISOString(),
        identifiedBy: "rule_engine", source: "test",
      }],
    });
    const compactor = new ContextCompactor();
    compactor.compact(ctx);
    expect(ctx.immutables.redFlagsIdentified).toHaveLength(1);
    expect(ctx.immutables.redFlagsIdentified[0].id).toBe("rf_1");
  });

  it("preserves hard constraints", () => {
    const ctx = makeContext({}, { hardConstraints: ["ECG required before discharge"] });
    const compactor = new ContextCompactor();
    compactor.compact(ctx);
    expect(ctx.immutables.hardConstraints).toContain("ECG required before discharge");
  });

  const compactor = new ContextCompactor();
});

// ─── T2: Stale + low-likelihood → ruled_out artifacts ────────────────────────

describe("T2 — Stale low-likelihood differentials become ruled_out artifacts", () => {
  it("drops stale+low-likelihood item and emits ruled_out artifact", () => {
    const currentStep = 10;
    const ctx = makeContext({
      step: currentStep,
      currentDifferential: [
        makeDiffItem("GERD", 0.03, DEFAULT_POLICY.staleDifferentialSteps + 1, currentStep),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.compacted).toBe(true);
    expect(result.newWorking.currentDifferential).toHaveLength(0);

    const ruledOut = result.newArtifacts.filter((a) => a.type === "ruled_out");
    expect(ruledOut).toHaveLength(1);
    expect((ruledOut[0].payload as any).diagnosis).toBe("GERD");
  });

  it("does NOT drop a stale item if likelihood is above threshold", () => {
    const currentStep = 10;
    const ctx = makeContext({
      step: currentStep,
      currentDifferential: [
        makeDiffItem("Pneumonia", 0.4, DEFAULT_POLICY.staleDifferentialSteps + 1, currentStep),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.currentDifferential).toHaveLength(1);
    const ruledOut = result.newArtifacts.filter((a) => a.type === "ruled_out");
    expect(ruledOut).toHaveLength(0);
  });

  it("does NOT drop a fresh low-likelihood item (not yet stale)", () => {
    const currentStep = 10;
    const ctx = makeContext({
      step: currentStep,
      currentDifferential: [
        makeDiffItem("Costochondritis", 0.02, 1, currentStep),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.currentDifferential).toHaveLength(1);
  });
});

// ─── T3: Stale pending questions → uncertainty artifacts ─────────────────────

describe("T3 — Stale pending questions become uncertainty artifacts", () => {
  it("converts old pending question to uncertainty artifact", () => {
    const currentStep = 10;
    const ctx = makeContext({
      step: currentStep,
      pendingQuestions: [
        makePendingQ("q1", currentStep - DEFAULT_POLICY.pendingQuestionStaleSteps - 1),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.pendingQuestions).toHaveLength(0);
    const uncertainties = result.newArtifacts.filter((a) => a.type === "uncertainty");
    expect(uncertainties).toHaveLength(1);
    expect((uncertainties[0].payload as any).question).toBe("Question q1");
  });

  it("keeps fresh pending questions intact", () => {
    const currentStep = 10;
    const ctx = makeContext({
      step: currentStep,
      pendingQuestions: [
        makePendingQ("q_fresh", currentStep - 1),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.pendingQuestions).toHaveLength(1);
    const uncertainties = result.newArtifacts.filter((a) => a.type === "uncertainty");
    expect(uncertainties).toHaveLength(0);
  });
});

// ─── T4: High-likelihood entries are NEVER dropped ───────────────────────────

describe("T4 — High-likelihood differentials are never dropped", () => {
  it("keeps high-likelihood item even when stale for many steps", () => {
    const currentStep = 50;
    const ctx = makeContext({
      step: currentStep,
      currentDifferential: [
        makeDiffItem("ACS", 0.75, 40, currentStep),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.currentDifferential).toHaveLength(1);
    expect(result.newWorking.currentDifferential[0].diagnosis).toBe("ACS");
  });

  it("keeps moderate-likelihood item (> threshold) even when stale", () => {
    const currentStep = 20;
    const ctx = makeContext({
      step: currentStep,
      currentDifferential: [
        makeDiffItem("PE", 0.10, DEFAULT_POLICY.staleDifferentialSteps + 5, currentStep),
      ],
    });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.currentDifferential).toHaveLength(1);
  });
});

// ─── T5: Most recent N answered questions preserved verbatim ─────────────────

describe("T5 — Recent answered questions preserved verbatim", () => {
  it("keeps the last N answered questions when there are more", () => {
    const N = DEFAULT_POLICY.keepRecentAnsweredQuestions;
    const allQuestions = Array.from({ length: N + 5 }, (_, i) =>
      makeAnsweredQ(`q${i}`, `Question ${i}`, `Answer ${i}`),
    );

    const ctx = makeContext({ answeredQuestions: allQuestions });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.answeredQuestions).toHaveLength(N);
    const keptIds = result.newWorking.answeredQuestions.map((q) => q.questionId);
    const lastNIds = allQuestions.slice(-N).map((q) => q.questionId);
    expect(keptIds).toEqual(lastNIds);
  });

  it("keeps all questions when count is below threshold", () => {
    const questions = [makeAnsweredQ("q1", "Q1", "A1"), makeAnsweredQ("q2", "Q2", "A2")];
    const ctx = makeContext({ answeredQuestions: questions });

    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    expect(result.newWorking.answeredQuestions).toHaveLength(2);
  });
});

// ─── T6: Compactor is deterministic ──────────────────────────────────────────

describe("T6 — Compaction is deterministic", () => {
  it("produces identical output across 10 runs with the same input", () => {
    const currentStep = 10;
    const ctx = () =>
      makeContext({
        step: currentStep,
        currentDifferential: [
          makeDiffItem("GERD", 0.02, DEFAULT_POLICY.staleDifferentialSteps + 2, currentStep),
          makeDiffItem("ACS",  0.60, 1,                                          currentStep),
        ],
        answeredQuestions: Array.from({ length: DEFAULT_POLICY.keepRecentAnsweredQuestions + 3 }, (_, i) =>
          makeAnsweredQ(`q${i}`, `Q${i}`, `A${i}`),
        ),
      });

    const compactor = new ContextCompactor();
    const results = Array.from({ length: 10 }, () => compactor.compact(ctx()));

    const firstJSON = JSON.stringify({
      keptDiff: results[0].newWorking.currentDifferential.map((d) => d.diagnosis),
      artifactTypes: results[0].newArtifacts.map((a) => a.type),
      answeredCount: results[0].newWorking.answeredQuestions.length,
    });

    for (const r of results.slice(1)) {
      const compareJSON = JSON.stringify({
        keptDiff: r.newWorking.currentDifferential.map((d) => d.diagnosis),
        artifactTypes: r.newArtifacts.map((a) => a.type),
        answeredCount: r.newWorking.answeredQuestions.length,
      });
      expect(compareJSON).toBe(firstJSON);
    }
  });
});

// ─── T7: compaction_summary artifact emitted when summarization occurs ────────

describe("T7 — compaction_summary artifact emitted on summarization", () => {
  it("emits a compaction_summary when answered questions are trimmed", () => {
    const N = DEFAULT_POLICY.keepRecentAnsweredQuestions;
    const questions = Array.from({ length: N + 3 }, (_, i) =>
      makeAnsweredQ(`q${i}`, `Q${i}`, `A${i}`),
    );

    const ctx = makeContext({ answeredQuestions: questions });
    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    const summaries = result.newArtifacts.filter((a) => a.type === "compaction_summary");
    expect(summaries).toHaveLength(1);
    const payload = summaries[0].payload as any;
    expect(payload.highlights).toBeDefined();
    expect(Array.isArray(payload.highlights)).toBe(true);
  });

  it("does NOT emit compaction_summary when nothing is trimmed", () => {
    const ctx = makeContext({
      answeredQuestions: [makeAnsweredQ("q1", "Q1", "A1")],
      currentDifferential: [],
      pendingQuestions: [],
    });
    const compactor = new ContextCompactor();
    const result = compactor.compact(ctx);

    const summaries = result.newArtifacts.filter((a) => a.type === "compaction_summary");
    expect(summaries).toHaveLength(0);
  });
});

// ─── Additional: shouldCompact threshold ─────────────────────────────────────

describe("shouldCompact threshold", () => {
  it("returns false when under threshold", () => {
    const ctx = makeContext({ estimatedTokens: DEFAULT_POLICY.workingTokenThreshold - 1 });
    const compactor = new ContextCompactor();
    expect(compactor.shouldCompact(ctx)).toBe(false);
  });

  it("returns true when at or above threshold", () => {
    const ctx = makeContext({ estimatedTokens: DEFAULT_POLICY.workingTokenThreshold });
    const compactor = new ContextCompactor();
    expect(compactor.shouldCompact(ctx)).toBe(true);
  });
});
