/**
 * T021 + T023 — Integration: KV-cache prefix stability
 *
 * Verifies that getPromptPrefixHash(role) is:
 *   - Deterministic within an encounter (same inputs → same hash)
 *   - Stable when working context changes but immutables don't
 *   - Changes exactly once per role when immutables are updated (red flag added)
 *   - Takes at most 2 distinct values per role across a 13-step encounter
 *     that changes immutables exactly once (at step 2)
 */

import { describe, it, expect } from "vitest";
import { ClinicalContextManager } from "../../server/context/ClinicalContextManager";
import type { EncounterContext } from "../../server/context/types";

function baseCtx(encId = "prefix-test-001"): EncounterContext {
  return {
    immutables: {
      encounterId: encId, tenantId: "t1", physicianId: "dr1",
      patient:     { ageYears: 50, sex: "M", allergies: [], currentMedications: [], relevantHistory: [] },
      chiefComplaint: "chest pain",
      redFlagsIdentified: [], hardConstraints: [],
      encounterStartedAt: new Date().toISOString(),
    },
    working: {
      currentDifferential: [], pendingQuestions: [], answeredQuestions: [],
      candidateDispositions: [], currentAgent: "triage", step: 0, estimatedTokens: 0,
    },
    artifacts:  [],
    traceRefId: "s3://test/prefix.jsonl",
  };
}

describe("prefix_stability (T021 + T023)", () => {
  it("getPromptPrefixHash returns a non-empty string", () => {
    const mgr  = new ClinicalContextManager(baseCtx());
    const hash = mgr.getPromptPrefixHash("triage");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("hash is identical on two consecutive calls with no state change", () => {
    const mgr   = new ClinicalContextManager(baseCtx());
    const hash1 = mgr.getPromptPrefixHash("disposition");
    const hash2 = mgr.getPromptPrefixHash("disposition");
    expect(hash1).toBe(hash2);
  });

  it("hash is stable when working context changes but immutables stay the same", () => {
    const mgr = new ClinicalContextManager(baseCtx());

    const hashBefore = mgr.getPromptPrefixHash("differential");

    // Mutate working context heavily
    mgr.updateWorking({
      step: 7,
      currentAgent: "differential",
      estimatedTokens: 3500,
      answeredQuestions: Array.from({ length: 15 }, (_, i) => ({
        questionId: `q${i}`, question: `Q${i}`, answer: `A${i}`, answeredAt: new Date().toISOString(),
      })),
    });
    for (let i = 0; i < 5; i++) {
      mgr.upsertDifferentialItem({
        diagnosis: `Dx${i}`, likelihood: 0.2 + i * 0.1, supportingFindings: [`sf${i}`],
        refutingFindings: [], evidenceQuality: "moderate", lastUpdatedStep: i,
      });
    }

    const hashAfter = mgr.getPromptPrefixHash("differential");

    // Hash must be unchanged — working context doesn't affect the prefix
    expect(hashBefore).toBe(hashAfter);
  });

  it("hash changes exactly once when a red flag is added", () => {
    const mgr = new ClinicalContextManager(baseCtx());

    const h1 = mgr.getPromptPrefixHash("disposition");

    // Add a red flag (mutates immutables)
    mgr.addRedFlag({
      id: "RF_001", description: "SpO2 critical", identifiedAt: new Date().toISOString(),
      identifiedBy: "rule_engine", source: "step6",
    });

    const h2 = mgr.getPromptPrefixHash("disposition");

    // Must have changed
    expect(h2).not.toBe(h1);

    // Second call with no further changes must return same value
    const h3 = mgr.getPromptPrefixHash("disposition");
    expect(h3).toBe(h2);
  });

  it("takes at most 2 distinct hash values across a 13-step encounter with one immutable change", () => {
    const mgr = new ClinicalContextManager(baseCtx());
    const roles = ["triage", "differential", "disposition", "billing", "supervisor"] as const;

    const hashHistory: Record<string, string[]> = {
      triage: [], differential: [], disposition: [], billing: [], supervisor: [],
    };

    for (let step = 1; step <= 13; step++) {
      // Red flag fires ONCE at step 2
      if (step === 2) {
        mgr.addRedFlag({
          id: "RF_STEP2", description: "Red flag at step 2",
          identifiedAt: new Date().toISOString(), identifiedBy: "rule_engine", source: "step2",
        });
      }

      // Update working context every step (should NOT affect hash)
      mgr.updateWorking({ step, estimatedTokens: step * 50 });

      for (const role of roles) {
        hashHistory[role].push(mgr.getPromptPrefixHash(role));
      }
    }

    for (const role of roles) {
      const distinctValues = new Set(hashHistory[role]);
      // Exactly 2 distinct values: before red flag and after red flag
      expect(
        distinctValues.size,
        `Role '${role}' had ${distinctValues.size} distinct prefix hashes (expected ≤ 2)`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it("different roles produce different prefix hashes (role specialisation)", () => {
    const mgr  = new ClinicalContextManager(baseCtx());
    const hashes = new Set([
      mgr.getPromptPrefixHash("triage"),
      mgr.getPromptPrefixHash("differential"),
      mgr.getPromptPrefixHash("disposition"),
      mgr.getPromptPrefixHash("billing"),
      mgr.getPromptPrefixHash("supervisor"),
    ]);
    // All 5 roles must produce distinct hashes
    expect(hashes.size).toBe(5);
  });
});
