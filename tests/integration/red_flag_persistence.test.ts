/**
 * T021 — Integration: red flag persistence
 *
 * Verifies that red flags identified early in the encounter:
 *   1. Survive compaction with forced low token threshold
 *   2. Appear in disposition prompt's top-of-prompt immutables block
 *   3. Appear in the re-stated bottom immutables block (bookend pattern)
 */

import { describe, it, expect } from "vitest";
import { ClinicalContextManager } from "../../server/context/ClinicalContextManager";
import { ContextCompactor } from "../../server/context/ContextCompactor";
import type { EncounterContext } from "../../server/context/types";

function makeCtxWithRedFlag(): EncounterContext {
  return {
    immutables: {
      encounterId: "rf-persist-001", tenantId: "t1", physicianId: "dr1",
      patient:     { ageYears: 60, sex: "F", allergies: [], currentMedications: [], relevantHistory: [] },
      chiefComplaint: "chest pain",
      redFlagsIdentified: [],
      hardConstraints:   [],
      encounterStartedAt: new Date().toISOString(),
    },
    working: {
      currentDifferential:   [],
      pendingQuestions:      [],
      answeredQuestions:     [],
      candidateDispositions: [],
      currentAgent:          "triage",
      step:                  0,
      estimatedTokens:       0,
    },
    artifacts: [],
    traceRefId: "s3://test/rf.jsonl",
  };
}

describe("red_flag_persistence (T021)", () => {
  it("red flag added at step 2 survives forced compaction", () => {
    const ctx = makeCtxWithRedFlag();
    const mgr = new ClinicalContextManager(ctx);

    // Step 2: identify red flag
    mgr.addRedFlag({
      id:           "RF_HYPOXIA",
      description:  "SpO2 < 90% — critical hypoxia",
      identifiedAt: new Date().toISOString(),
      identifiedBy: "rule_engine",
      source:       "pipeline:step6",
    });

    // Verify it's in immutables after step 2
    expect(mgr.getImmutables().redFlagsIdentified.some(f => f.id === "RF_HYPOXIA")).toBe(true);

    // Force compaction by setting threshold to 100 tokens
    const aggressivePolicy = {
      workingTokenThreshold:       100,
      keepRecentAnsweredQuestions: 2,
      dropDifferentialBelow:       0.05,
      staleDifferentialSteps:      2,
      pendingQuestionStaleSteps:   3,
    };
    const compact = new ContextCompactor(aggressivePolicy);

    // Inflate working context to trigger compaction
    mgr.updateWorking({
      step: 3,
      estimatedTokens: 500,
      answeredQuestions: Array.from({ length: 10 }, (_, i) => ({
        questionId: `q${i}`, question: `Question ${i}?`, answer: `Answer ${i}`,
        answeredAt: new Date().toISOString(),
      })),
    });

    // Run compaction
    const result = compact.compact(mgr.getContext());
    expect(result.compacted).toBe(true);
    mgr.updateWorking(result.newWorking);

    // Red flag must STILL be in immutables after compaction
    expect(mgr.getImmutables().redFlagsIdentified.some(f => f.id === "RF_HYPOXIA")).toBe(true);
  });

  it("red flag appears in BOTH top-of-prompt AND re-stated bottom block (bookend pattern)", () => {
    const ctx = makeCtxWithRedFlag();
    const mgr = new ClinicalContextManager(ctx);

    // Identify the red flag
    mgr.addRedFlag({
      id:           "RF_HYPOXIA",
      description:  "SpO2 < 90% — critical hypoxia",
      identifiedAt: new Date().toISOString(),
      identifiedBy: "rule_engine",
      source:       "pipeline:step6",
    });

    // Assemble disposition prompt
    const prompt = mgr.assemblePromptFor("disposition", "Determine patient disposition");

    // The prompt must contain the red flag description in BOTH immutables blocks
    const rfText = "SpO2 < 90%";

    // Top-of-prompt block
    expect(prompt.userPrompt).toContain("## CLINICAL IMMUTABLES (top)");
    const topBlockEnd  = prompt.userPrompt.indexOf("## WORKING CONTEXT");
    const topBlock     = prompt.userPrompt.slice(0, topBlockEnd);
    expect(topBlock).toContain(rfText);

    // Re-stated bottom block
    expect(prompt.userPrompt).toContain("## CLINICAL IMMUTABLES (re-stated)");
    const restatedIdx  = prompt.userPrompt.lastIndexOf("## CLINICAL IMMUTABLES (re-stated)");
    const restatedBlock = prompt.userPrompt.slice(restatedIdx);
    expect(restatedBlock).toContain("Red flags:");
    expect(restatedBlock).toContain(rfText);
  });

  it("red flag content is present in disposition prompt at step 12 after multiple compactions", () => {
    const ctx = makeCtxWithRedFlag();
    const mgr = new ClinicalContextManager(ctx);

    // Identify red flag early
    mgr.addRedFlag({
      id:           "RF_CRUSHING_PAIN",
      description:  "Crushing chest pain with diaphoresis — ACS pattern",
      identifiedAt: new Date().toISOString(),
      identifiedBy: "rule_engine",
      source:       "pipeline:step6",
    });

    const aggressivePolicy = {
      workingTokenThreshold: 100,
      keepRecentAnsweredQuestions: 2,
      dropDifferentialBelow: 0.05,
      staleDifferentialSteps: 2,
      pendingQuestionStaleSteps: 3,
    };
    const compact = new ContextCompactor(aggressivePolicy);

    // Simulate steps 3–12 with compaction
    for (let step = 3; step <= 12; step++) {
      mgr.updateWorking({
        step,
        estimatedTokens: 300,
        answeredQuestions: [
          ...mgr.getContext().working.answeredQuestions,
          { questionId: `q${step}`, question: `Step ${step} question`, answer: `Answer`, answeredAt: new Date().toISOString() },
        ],
      });
      if (compact.shouldCompact(mgr.getContext())) {
        const r = compact.compact(mgr.getContext());
        if (r.compacted) {
          mgr.updateWorking(r.newWorking);
          for (const a of r.newArtifacts) mgr.recordArtifact(a);
        }
      }
    }

    // Assemble disposition prompt at step 12
    const prompt = mgr.assemblePromptFor("disposition", "Finalize disposition");

    // Red flag description must appear in the prompt
    expect(prompt.userPrompt).toContain("Crushing chest pain");
    expect(prompt.userPrompt).toContain("RED FLAGS");
  });
});
