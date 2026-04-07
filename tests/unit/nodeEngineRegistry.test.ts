import { describe, it, expect } from "vitest";

import {
  NODE_ENGINE_COVERAGE,
  getNodeEngine,
  NODE_FIELD_OWNERSHIP,
  assertNodeOwnsField,
} from "../../server/clinical/nodeEngineRegistry";

import { mergeState } from "../../server/clinical/stateMerge";

import {
  assertSingleScorerModule,
  assertScorerOutputValid,
  assertScorerKnown,
  _SCORER_COVERAGE_CHECK,
  type ScoringModuleId,
} from "../../server/services/complaintEngines";

import {
  REQUIRED_GRAPH_NODES,
  type NodeId,
} from "../../server/services/complaintNodeRunner";

// ── Minimal CaseState factory for stateMerge tests ────────────────────────────
// Uses only the fields that exist in every real CaseState to avoid
// importing the full Zod schema (which needs DB in scope).

function minimalState(overrides: Record<string, any> = {}): any {
  return {
    caseId: "case-001",
    system: "urgentcare",
    normalizedComplaint: "cough",
    demographics: { age: 35, sex: "M" },
    modifiers: {},
    fhirPrefill: {},
    answers: {},
    scores: {},
    activeClusters: [],
    disposition: undefined,
    dispositionReasonCodes: [],
    candidateMeds: [],
    candidateDiagnoses: [],
    ruleTrace: [],
    scoringSystems: [],
    redFlags: [],
    differentials: [],
    recommendedActions: [],
    questionQueue: [],
    confidence: { level: "LOW", by_inference: [] },
    routing: { state: "INITIAL" },
    redFlagGate: { evaluated: false, blocked: false },
    audit: { steps: [] },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NODE_ENGINE_COVERAGE — compile-time completeness proof
// ═══════════════════════════════════════════════════════════════════════════════
describe("NODE_ENGINE_COVERAGE — completeness", () => {
  it("covers every NodeId in the union", () => {
    const allNodes: NodeId[] = [
      "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
      "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DIFF_AND_CONFIDENCE",
      "DISPOSITION_RULES", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
    ];
    for (const n of allNodes) {
      expect(NODE_ENGINE_COVERAGE[n]).toBe(true);
    }
  });

  it("has exactly 12 entries (matches NodeId union size)", () => {
    expect(Object.keys(NODE_ENGINE_COVERAGE)).toHaveLength(12);
  });

  it("covers all REQUIRED_GRAPH_NODES", () => {
    for (const r of REQUIRED_GRAPH_NODES) {
      expect(NODE_ENGINE_COVERAGE[r]).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. getNodeEngine() — runtime guard
// ═══════════════════════════════════════════════════════════════════════════════
describe("getNodeEngine — runtime guard", () => {
  it("returns true for every registered NodeId", () => {
    for (const nodeId of Object.keys(NODE_ENGINE_COVERAGE) as NodeId[]) {
      expect(getNodeEngine(nodeId)).toBe(true);
    }
  });

  it("throws for an unregistered node id", () => {
    expect(() => getNodeEngine("GHOST_NODE" as any))
      .toThrow(/No engine registered for node/i);
  });

  it("error message includes the bad nodeId", () => {
    try {
      getNodeEngine("PHANTOM" as any);
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("PHANTOM");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. NODE_FIELD_OWNERSHIP — per-node field declarations
// ═══════════════════════════════════════════════════════════════════════════════
describe("NODE_FIELD_OWNERSHIP — declarations", () => {
  it("RED_FLAG_GATE owns redFlags and routing", () => {
    const owned = NODE_FIELD_OWNERSHIP["RED_FLAG_GATE"]!;
    expect(owned).toContain("redFlags");
    expect(owned).toContain("routing");
  });

  it("SCORING owns scores", () => {
    const owned = NODE_FIELD_OWNERSHIP["SCORING"]!;
    expect(owned).toContain("scores");
  });

  it("DISPOSITION_RULES owns disposition and routing", () => {
    const owned = NODE_FIELD_OWNERSHIP["DISPOSITION_RULES"]!;
    expect(owned).toContain("disposition");
    expect(owned).toContain("routing");
  });

  it("CORE_QUESTIONS owns questionQueue", () => {
    expect(NODE_FIELD_OWNERSHIP["CORE_QUESTIONS"]).toContain("questionQueue");
  });

  it("DONE owns nothing (empty array)", () => {
    expect(NODE_FIELD_OWNERSHIP["DONE"]).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. assertNodeOwnsField — ownership enforcement
// ═══════════════════════════════════════════════════════════════════════════════
describe("assertNodeOwnsField", () => {
  it("passes when node owns the field", () => {
    expect(() => assertNodeOwnsField("SCORING", "scores")).not.toThrow();
  });

  it("throws when node does not own the field", () => {
    expect(() => assertNodeOwnsField("SCORING", "disposition"))
      .toThrow(/not authorised to write field/i);
  });

  it("error message contains node id and field", () => {
    try {
      assertNodeOwnsField("RED_FLAG_GATE", "scores");
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("RED_FLAG_GATE");
      expect(err.message).toContain("scores");
    }
  });

  it("throws for DONE writing any field (owns nothing — empty array)", () => {
    // DONE owns no fields — writing anything from DONE is a bug
    expect(() => assertNodeOwnsField("DONE", "scores"))
      .toThrow(/not authorised/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. mergeState() — unknown-field rejection
// ═══════════════════════════════════════════════════════════════════════════════
describe("mergeState — unknown-field rejection", () => {
  it("merges known field without throwing", () => {
    const current = minimalState({ scores: {} });
    const next = mergeState(current, { scores: { centor: 4 } }, "SCORING");
    expect((next as any).scores.centor).toBe(4);
  });

  it("does not mutate the original state object", () => {
    const current = minimalState({ scores: {} });
    const original = { ...current };
    mergeState(current, { scores: { centor: 4 } }, "SCORING");
    expect(current.scores).toEqual(original.scores);
  });

  it("throws for unknown field in update", () => {
    const current = minimalState();
    expect(() =>
      mergeState(current, { phantom_field: "bad" } as any, "SCORING")
    ).toThrow(/unknown field/i);
  });

  it("error message includes node id and field name", () => {
    const current = minimalState();
    try {
      mergeState(current, { rogue_key: 1 } as any, "RED_FLAG_GATE");
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("RED_FLAG_GATE");
      expect(err.message).toContain("rogue_key");
    }
  });

  it("applies multiple known fields in a single call", () => {
    const current = minimalState({ scores: {}, redFlags: [] });
    const next = mergeState(
      current,
      { scores: { centor: 3 }, redFlags: ["HIGH_FEVER"] },
      "RED_FLAG_GATE",
    );
    expect((next as any).scores.centor).toBe(3);
    expect((next as any).redFlags).toContain("HIGH_FEVER");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. mergeState() — field ownership enforcement (enforceOwnership = true)
// ═══════════════════════════════════════════════════════════════════════════════
describe("mergeState — field ownership enforcement", () => {
  it("allows SCORING to write scores when enforceOwnership=true", () => {
    const current = minimalState({ scores: {} });
    expect(() =>
      mergeState(current, { scores: { centor: 2 } }, "SCORING", true)
    ).not.toThrow();
  });

  it("blocks SCORING from writing disposition when enforceOwnership=true", () => {
    const current = minimalState({ disposition: undefined });
    expect(() =>
      mergeState(current, { disposition: "HOME" }, "SCORING", true)
    ).toThrow(/not authorised/i);
  });

  it("allows DISPOSITION_RULES to write disposition when enforceOwnership=true", () => {
    const current = minimalState({ disposition: undefined });
    expect(() =>
      mergeState(current, { disposition: "HOME" }, "DISPOSITION_RULES", true)
    ).not.toThrow();
  });

  it("does NOT enforce ownership when enforceOwnership=false (default)", () => {
    const current = minimalState({ disposition: undefined });
    expect(() =>
      mergeState(current, { disposition: "HOME" }, "SCORING", false)
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SCORER_MAP_COVERAGE — compile-time completeness proof
// ═══════════════════════════════════════════════════════════════════════════════
describe("SCORER_MAP_COVERAGE — completeness", () => {
  const allScorers: ScoringModuleId[] = [
    "CENTOR", "EARACHE_SCORE", "COUGH_SCORE", "CHEST_PAIN_SCORE",
    "DIZZINESS_SCORE", "ABD_PAIN_SCORE", "UTI_SCORE",
    "TESTICULAR_PAIN_SCORE", "PELVIC_PAIN_SCORE", "HEADACHE_SCORE",
  ];

  it("covers all 10 ScoringModuleIds", () => {
    for (const s of allScorers) {
      expect(_SCORER_COVERAGE_CHECK[s]).toBe(true);
    }
  });

  it("has exactly 10 entries", () => {
    expect(Object.keys(_SCORER_COVERAGE_CHECK)).toHaveLength(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. assertSingleScorerModule — no-array enforcement
// ═══════════════════════════════════════════════════════════════════════════════
describe("assertSingleScorerModule", () => {
  it("passes for a single string module", () => {
    expect(() => assertSingleScorerModule("CENTOR", "sore_throat")).not.toThrow();
  });

  it("throws for an array of modules", () => {
    expect(() => assertSingleScorerModule(["CENTOR", "UTI_SCORE"], "sore_throat"))
      .toThrow(/Multiple scoring modules/i);
  });

  it("error message includes the complaint id", () => {
    try {
      assertSingleScorerModule(["CENTOR", "HEADACHE_SCORE"], "headache");
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("headache");
    }
  });

  it("throws for empty array", () => {
    expect(() => assertSingleScorerModule([], "cough"))
      .toThrow(/Multiple scoring modules/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. assertScorerOutputValid — output validation
// ═══════════════════════════════════════════════════════════════════════════════
describe("assertScorerOutputValid", () => {
  it("passes for a valid scorer output object", () => {
    expect(() =>
      assertScorerOutputValid({ centor: 3, inputsUsed: [] }, "CENTOR", "sore_throat")
    ).not.toThrow();
  });

  it("throws for null output", () => {
    expect(() => assertScorerOutputValid(null, "CENTOR", "sore_throat"))
      .toThrow(/invalid output/i);
  });

  it("throws for undefined output", () => {
    expect(() => assertScorerOutputValid(undefined, "CENTOR", "sore_throat"))
      .toThrow(/invalid output/i);
  });

  it("throws for number output", () => {
    expect(() => assertScorerOutputValid(42, "UTI_SCORE", "uti_simple"))
      .toThrow(/invalid output/i);
  });

  it("throws for string output", () => {
    expect(() => assertScorerOutputValid("HOME", "ABD_PAIN_SCORE", "abd_pain"))
      .toThrow(/invalid output/i);
  });

  it("error message includes module and complaint id", () => {
    try {
      assertScorerOutputValid(null, "COUGH_SCORE", "cough");
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("COUGH_SCORE");
      expect(err.message).toContain("cough");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. assertScorerKnown — integration with the three new guards
// ═══════════════════════════════════════════════════════════════════════════════
describe("combined scorer guards integration", () => {
  it("all three guards pass for a clean CENTOR usage", () => {
    const module = "CENTOR";
    const ccId = "sore_throat";
    const output = { centor: 4, inputsUsed: ["fever", "exudate"] };

    expect(() => assertSingleScorerModule(module, ccId)).not.toThrow();
    expect(() => assertScorerKnown(module, ccId)).not.toThrow();
    expect(() => assertScorerOutputValid(output, module, ccId)).not.toThrow();
  });

  it("single-scorer guard fires before known-scorer guard", () => {
    expect(() => assertSingleScorerModule(["CENTOR", "BOGUS"], "cough"))
      .toThrow(/Multiple scoring modules/i);
  });

  it("known-scorer guard fires after single-scorer passes", () => {
    assertSingleScorerModule("UNKNOWN_MODULE", "cough");
    expect(() => assertScorerKnown("UNKNOWN_MODULE", "cough"))
      .toThrow(/Unknown scoring module/i);
  });
});
