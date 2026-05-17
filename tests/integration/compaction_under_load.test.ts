/**
 * T021 — Integration: compaction under load
 *
 * Simulates a 25-turn encounter and verifies:
 *   ≥ 2 compaction events fired
 *   All red flags survive every compaction
 *   All hard constraints survive every compaction
 *   Dropped differential entries became ruled_out artifacts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextCompactor, type CompactionPolicy } from "../../server/context/ContextCompactor";
import { ClinicalContextManager } from "../../server/context/ClinicalContextManager";
import type { EncounterContext, DifferentialItem } from "../../server/context/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<EncounterContext> = {}): EncounterContext {
  return {
    immutables: {
      encounterId:       "test-enc-load",
      tenantId:          "test-tenant",
      physicianId:       "physician-001",
      patient:           { ageYears: 55, sex: "M", allergies: [], currentMedications: [], relevantHistory: [], pregnancyStatus: "n/a" },
      chiefComplaint:    "chest pain",
      presentingVitals:  { spo2: 89, hr: 110, capturedAt: new Date().toISOString() },
      redFlagsIdentified: [
        { id: "RF_HYPOXIA", description: "SpO2 < 90%", identifiedAt: new Date().toISOString(), identifiedBy: "rule_engine", source: "pipeline:step6" },
      ],
      hardConstraints:   ["Require ECG before disposition"],
      encounterStartedAt: new Date().toISOString(),
    },
    working: {
      currentDifferential:   [],
      pendingQuestions:      [],
      answeredQuestions:     [],
      candidateDispositions: [],
      currentAgent:          "differential",
      step:                  0,
      estimatedTokens:       0,
    },
    artifacts: [],
    traceRefId: "s3://test/trace.jsonl",
    ...overrides,
  };
}

function makeStaleLowDx(diagnosis: string, staleSteps: number, step: number): DifferentialItem {
  return {
    diagnosis,
    likelihood:         0.03,   // below 0.05 threshold
    supportingFindings: [],
    refutingFindings:   [`refuted at step ${step - staleSteps}`],
    evidenceQuality:    "low",
    lastUpdatedStep:    step - staleSteps,   // staleSteps behind
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("compaction_under_load (T021)", () => {
  // Aggressive policy so compaction fires readily in tests
  const testPolicy: CompactionPolicy = {
    workingTokenThreshold:       200,   // very low — triggers easily
    keepRecentAnsweredQuestions: 3,
    dropDifferentialBelow:       0.05,
    staleDifferentialSteps:      2,
    pendingQuestionStaleSteps:   3,
  };

  it("fires ≥ 2 compaction events across 25 simulated steps", () => {
    const ctx     = makeCtx();
    const mgr     = new ClinicalContextManager(ctx);
    const compact = new ContextCompactor(testPolicy);

    let compactionCount = 0;

    for (let step = 1; step <= 25; step++) {
      // Add answered questions to inflate tokens
      mgr.updateWorking({
        step,
        answeredQuestions: [
          ...mgr.getContext().working.answeredQuestions,
          {
            questionId:        `q_${step}`,
            question:          `Clinical question for step ${step} about the patient's symptoms`,
            answer:            `Detailed answer at step ${step} including all relevant clinical detail`,
            answeredAt:        new Date().toISOString(),
            extractedFindings: [`finding_${step}`],
          },
        ],
        // Re-estimate tokens
        estimatedTokens: JSON.stringify(mgr.getContext().working).length,
      });

      // Add a stale differential entry every few steps
      if (step % 3 === 0) {
        mgr.upsertDifferentialItem(makeStaleLowDx(`Diagnosis_${step}`, 3, step));
      }

      if (compact.shouldCompact(mgr.getContext())) {
        const result = compact.compact(mgr.getContext());
        if (result.compacted) {
          compactionCount++;
          mgr.updateWorking(result.newWorking);
          for (const a of result.newArtifacts) mgr.recordArtifact(a);
        }
      }
    }

    expect(compactionCount).toBeGreaterThanOrEqual(2);
  });

  it("red flags identified at step 2 are present in immutables at step 25", () => {
    const ctx = makeCtx();
    const mgr = new ClinicalContextManager(ctx);
    const compact = new ContextCompactor(testPolicy);

    // Red flag is already in immutables from makeCtx()
    const initialFlags = mgr.getImmutables().redFlagsIdentified;
    expect(initialFlags.some(f => f.id === "RF_HYPOXIA")).toBe(true);

    // Run 25 steps of compaction
    for (let step = 1; step <= 25; step++) {
      mgr.updateWorking({
        step,
        answeredQuestions: [
          ...mgr.getContext().working.answeredQuestions,
          { questionId: `q${step}`, question: "Q".repeat(50), answer: "A".repeat(80), answeredAt: new Date().toISOString() },
        ],
        estimatedTokens: JSON.stringify(mgr.getContext().working).length,
      });

      if (compact.shouldCompact(mgr.getContext())) {
        const result = compact.compact(mgr.getContext());
        if (result.compacted) {
          mgr.updateWorking(result.newWorking);
          for (const a of result.newArtifacts) mgr.recordArtifact(a);
        }
      }
    }

    // Red flag must still be there
    const finalFlags = mgr.getImmutables().redFlagsIdentified;
    expect(finalFlags.some(f => f.id === "RF_HYPOXIA")).toBe(true);
  });

  it("hard constraints survive all compactions", () => {
    const ctx = makeCtx();
    const mgr = new ClinicalContextManager(ctx);
    const compact = new ContextCompactor(testPolicy);

    const initialConstraint = "Require ECG before disposition";
    expect(mgr.getImmutables().hardConstraints).toContain(initialConstraint);

    for (let step = 1; step <= 25; step++) {
      mgr.updateWorking({
        step,
        estimatedTokens: 250 + step * 10,
        answeredQuestions: [
          ...mgr.getContext().working.answeredQuestions,
          { questionId: `q${step}`, question: "X".repeat(40), answer: "Y".repeat(60), answeredAt: new Date().toISOString() },
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

    expect(mgr.getImmutables().hardConstraints).toContain(initialConstraint);
  });

  it("dropped differential entries become ruled_out artifacts", () => {
    const ctx = makeCtx();
    const mgr = new ClinicalContextManager(ctx);
    const compact = new ContextCompactor(testPolicy);

    // Add 4 stale low-likelihood differential items
    const staleDxNames = ["StaleAnxiety", "StaleCostochondritis", "StaleGERD", "StaleAnemia"];
    for (const name of staleDxNames) {
      mgr.upsertDifferentialItem({
        diagnosis:          name,
        likelihood:         0.02,
        supportingFindings: [],
        refutingFindings:   ["refuted"],
        evidenceQuality:    "low",
        lastUpdatedStep:    0,   // step 0, so will be stale at any step >= staleDifferentialSteps
      });
    }

    // Force compaction at step 5 (stale threshold = 2)
    mgr.updateWorking({ step: 5, estimatedTokens: 500 });

    const result = compact.compact(mgr.getContext());
    expect(result.compacted).toBe(true);

    // All stale+low dx should have been promoted to ruled_out artifacts
    const ruledOutArts = result.newArtifacts.filter(a => a.type === "ruled_out");
    expect(ruledOutArts.length).toBe(staleDxNames.length);

    // Count must match
    const keptDx = result.newWorking.currentDifferential;
    expect(keptDx.length).toBe(0);
  });
});
