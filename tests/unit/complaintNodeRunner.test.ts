import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePriorBundle,
  validateDiagnosisPrior,
  assemblePriorBundle,
  validateScorerCompatibility,
  _injectPriorCacheForTest,
  invalidatePriorCache,
  loadComplaintPriors,
  registerPriorLoader,
  type PriorBundle,
  type DiagnosisPrior,
  type RawPriorRow,
} from "../../server/clinical/diagnosisPriorLoader";

import {
  analyzePosterior,
  applyRiskOverride,
  deriveDisposition,
  computeEntropy,
  type DifferentialResult,
} from "../../server/clinical/posteriorAnalysis";

import {
  validateRegistry,
  resolveComplaint,
  invalidateComplaintResolverCache,
} from "../../server/clinical/complaintResolver";

import {
  REQUIRED_GRAPH_NODES,
  type NodeId,
} from "../../server/services/complaintNodeRunner";

import {
  assertScorerKnown,
} from "../../server/services/complaintEngines";

vi.mock("../../server/data/registry", () => ({
  getTable: vi.fn(),
}));

import { getTable } from "../../server/data/registry";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function goodBundle(overrides: Partial<PriorBundle> = {}): PriorBundle {
  return {
    ccId: "cough",
    version: 1,
    loadedAt: new Date().toISOString(),
    source: "KB_DB",
    priors: [
      {
        diagnosis: "flu",
        baseProbability: 0.3,
        featureLikelihoods: { fever: 0.8, cough: 0.7, fatigue: 0.6 },
      },
      {
        diagnosis: "covid",
        baseProbability: 0.2,
        featureLikelihoods: { fever: 0.75, cough: 0.9, anosmia: 0.6 },
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REQUIRED_GRAPH_NODES — constant integrity
// ═══════════════════════════════════════════════════════════════════════════════
describe("REQUIRED_GRAPH_NODES", () => {
  it("contains RED_FLAG_GATE", () => {
    expect(REQUIRED_GRAPH_NODES).toContain("RED_FLAG_GATE");
  });

  it("contains CORE_QUESTIONS", () => {
    expect(REQUIRED_GRAPH_NODES).toContain("CORE_QUESTIONS");
  });

  it("contains SCORING", () => {
    expect(REQUIRED_GRAPH_NODES).toContain("SCORING");
  });

  it("contains DISPOSITION_RULES", () => {
    expect(REQUIRED_GRAPH_NODES).toContain("DISPOSITION_RULES");
  });

  it("has exactly 4 required nodes", () => {
    expect(REQUIRED_GRAPH_NODES).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. assertScorerKnown — scorer completeness enforcement
// ═══════════════════════════════════════════════════════════════════════════════
describe("assertScorerKnown", () => {
  it("passes for CENTOR", () => {
    expect(() => assertScorerKnown("CENTOR", "sore_throat")).not.toThrow();
  });

  it("passes for all 10 registered scorers", () => {
    const modules = [
      "CENTOR", "EARACHE_SCORE", "COUGH_SCORE", "CHEST_PAIN_SCORE",
      "DIZZINESS_SCORE", "ABD_PAIN_SCORE", "UTI_SCORE",
      "TESTICULAR_PAIN_SCORE", "PELVIC_PAIN_SCORE", "HEADACHE_SCORE",
    ];
    for (const m of modules) {
      expect(() => assertScorerKnown(m, "test_cc")).not.toThrow();
    }
  });

  it("throws for unknown scorer module", () => {
    expect(() => assertScorerKnown("MYSTERY_SCORER", "cough"))
      .toThrow(/Unknown scoring module/i);
  });

  it("throws for empty string scorer", () => {
    expect(() => assertScorerKnown("", "cough"))
      .toThrow(/Unknown scoring module/i);
  });

  it("error message contains the module name and complaint id", () => {
    try {
      assertScorerKnown("BOGUS", "sore_throat");
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("BOGUS");
      expect(err.message).toContain("sore_throat");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. validateRegistry — registry integrity
// ═══════════════════════════════════════════════════════════════════════════════
describe("validateRegistry", () => {
  it("passes for a valid registry", () => {
    const registry = [
      { ccId: "cough", aliases: [], enabled: true, scoringModule: "COUGH_SCORE", version: 1 },
      { ccId: "sore_throat", aliases: ["strep"], enabled: true, scoringModule: "CENTOR", version: 1 },
    ];
    expect(() => validateRegistry(registry)).not.toThrow();
  });

  it("throws for duplicate ccId", () => {
    const registry = [
      { ccId: "cough", aliases: [], enabled: true, scoringModule: "COUGH_SCORE", version: 1 },
      { ccId: "cough", aliases: [], enabled: true, scoringModule: "COUGH_SCORE", version: 2 },
    ];
    expect(() => validateRegistry(registry)).toThrow(/[Dd]uplicate/);
  });

  it("throws for missing scoringModule", () => {
    const registry = [
      { ccId: "cough", aliases: [], enabled: true, scoringModule: "", version: 1 },
    ];
    expect(() => validateRegistry(registry as any)).toThrow(/scoringModule/);
  });

  it("throws for missing ccId", () => {
    const registry = [
      { ccId: "", aliases: [], enabled: true, scoringModule: "CENTOR", version: 1 },
    ];
    expect(() => validateRegistry(registry as any)).toThrow(/ccId/);
  });

  it("throws for invalid scoring module in registry entry", () => {
    const registry = [
      { ccId: "chest_pain", aliases: [], enabled: true, scoringModule: "unknown_module", version: 1 },
    ];
    expect(() => assertScorerKnown("unknown_module", "chest_pain")).toThrow(/Unknown scoring module/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. resolveComplaint — canonical complaint mapping
// ═══════════════════════════════════════════════════════════════════════════════
describe("resolveComplaint", () => {
  beforeEach(() => {
    invalidateComplaintResolverCache();
    vi.mocked(getTable).mockResolvedValue([
      { CC_ID: "cough", ALIASES: "dry cough;wet cough", ENABLED: "true", SCORING_MODULE: "COUGH_SCORE", VERSION: "1" },
      { CC_ID: "uti_simple", ALIASES: "urinary infection;uti", ENABLED: "true", SCORING_MODULE: "UTI_SCORE", VERSION: "1" },
      { CC_ID: "sore_throat", ALIASES: "strep throat", ENABLED: "true", SCORING_MODULE: "CENTOR", VERSION: "1" },
      { CC_ID: "disabled_complaint", ALIASES: "", ENABLED: "false", SCORING_MODULE: "CENTOR", VERSION: "1" },
    ]);
  });

  it("resolves exact primary match", async () => {
    const res = await resolveComplaint({ primary: "cough" });
    expect(res.ccId).toBe("cough");
    expect(res.source).toBe("primary");
    expect(res.confidence).toBe("high");
  });

  it("resolves alias match", async () => {
    const res = await resolveComplaint({ primary: "urinary infection" });
    expect(res.ccId).toBe("uti_simple");
    expect(res.source).toBe("alias");
    expect(res.confidence).toBe("low");
  });

  it("normalises hyphenated input to underscore", async () => {
    const res = await resolveComplaint({ primary: "sore-throat" });
    expect(res.ccId).toBe("sore_throat");
    expect(res.source).toBe("primary");
  });

  it("falls back to general_symptom for unknown complaint", async () => {
    const res = await resolveComplaint({ primary: "alien_disease" });
    expect(res.ccId).toBe("general_symptom");
    expect(res.source).toBe("fallback");
    expect(res.confidence).toBe("low");
  });

  it("treats disabled complaint as unresolvable → fallback", async () => {
    const res = await resolveComplaint({ primary: "disabled_complaint" });
    expect(res.ccId).toBe("general_symptom");
    expect(res.source).toBe("fallback");
  });

  it("falls back to general_symptom when parsed is null", async () => {
    const res = await resolveComplaint(null);
    expect(res.ccId).toBe("general_symptom");
    expect(res.source).toBe("fallback");
  });

  it("throws for critical complaint that cannot be resolved", async () => {
    // chest_pain is not in the registry (or disabled) — should throw
    vi.mocked(getTable).mockResolvedValue([]);
    invalidateComplaintResolverCache();
    await expect(resolveComplaint({ primary: "chest_pain" })).rejects.toThrow(/Critical complaint/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. validateDiagnosisPrior — per-diagnosis validation
// ═══════════════════════════════════════════════════════════════════════════════
describe("validateDiagnosisPrior", () => {
  function prior(overrides: Partial<DiagnosisPrior> = {}): DiagnosisPrior {
    return {
      diagnosis: "flu",
      baseProbability: 0.3,
      featureLikelihoods: { fever: 0.8, cough: 0.7, fatigue: 0.6 },
      ...overrides,
    };
  }

  it("passes for a valid prior", () => {
    expect(() => validateDiagnosisPrior(prior(), "cough")).not.toThrow();
  });

  it("throws for missing diagnosis name", () => {
    expect(() => validateDiagnosisPrior(prior({ diagnosis: "" }), "cough"))
      .toThrow(/missing diagnosis/i);
  });

  it("throws for baseProbability = 0", () => {
    expect(() => validateDiagnosisPrior(prior({ baseProbability: 0 }), "cough"))
      .toThrow(/invalid baseProbability/i);
  });

  it("throws for baseProbability > 1", () => {
    expect(() => validateDiagnosisPrior(prior({ baseProbability: 1.5 }), "cough"))
      .toThrow(/invalid baseProbability/i);
  });

  it("throws for baseProbability = NaN", () => {
    expect(() => validateDiagnosisPrior(prior({ baseProbability: NaN }), "cough"))
      .toThrow(/invalid baseProbability/i);
  });

  it("throws for negative baseProbability", () => {
    expect(() => validateDiagnosisPrior(prior({ baseProbability: -0.1 }), "cough"))
      .toThrow(/invalid baseProbability/i);
  });

  it("accepts baseProbability = 1.0 (exact boundary)", () => {
    expect(() => validateDiagnosisPrior(prior({ baseProbability: 1.0 }), "cough")).not.toThrow();
  });

  it("throws for missing featureLikelihoods object", () => {
    expect(() => validateDiagnosisPrior(prior({ featureLikelihoods: undefined as any }), "cough"))
      .toThrow(/featureLikelihoods/i);
  });

  it("throws for empty featureLikelihoods", () => {
    expect(() => validateDiagnosisPrior(prior({ featureLikelihoods: {} }), "cough"))
      .toThrow(/no modeled features/i);
  });

  it("throws for invalid likelihood value (0)", () => {
    expect(() =>
      validateDiagnosisPrior(prior({ featureLikelihoods: { fever: 0 } }), "cough")
    ).toThrow(/invalid likelihood/i);
  });

  it("throws for likelihood > 1", () => {
    expect(() =>
      validateDiagnosisPrior(prior({ featureLikelihoods: { fever: 1.1 } }), "cough")
    ).toThrow(/invalid likelihood/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. validatePriorBundle — bundle-level validation
// ═══════════════════════════════════════════════════════════════════════════════
describe("validatePriorBundle", () => {
  it("passes for a valid bundle", () => {
    expect(() => validatePriorBundle(goodBundle())).not.toThrow();
  });

  it("throws for empty priors array", () => {
    expect(() => validatePriorBundle(goodBundle({ priors: [] }))).toThrow(/no priors/i);
  });

  it("throws for invalid version (0)", () => {
    expect(() => validatePriorBundle(goodBundle({ version: 0 }))).toThrow(/invalid version/i);
  });

  it("throws for negative version", () => {
    expect(() => validatePriorBundle(goodBundle({ version: -1 }))).toThrow(/invalid version/i);
  });

  it("throws for missing ccId", () => {
    expect(() => validatePriorBundle(goodBundle({ ccId: "" }))).toThrow(/Missing ccId/i);
  });

  it("throws for duplicate diagnosis names (case-insensitive)", () => {
    const bundle = goodBundle({
      priors: [
        { diagnosis: "flu", baseProbability: 0.3, featureLikelihoods: { fever: 0.8, cough: 0.7, fatigue: 0.5 } },
        { diagnosis: "FLU", baseProbability: 0.2, featureLikelihoods: { fever: 0.7, cough: 0.6, fatigue: 0.4 } },
      ],
    });
    expect(() => validatePriorBundle(bundle)).toThrow(/duplicate diagnosis/i);
  });

  it("does NOT throw for sparse features (only warns)", () => {
    const bundle = goodBundle({
      priors: [
        { diagnosis: "flu", baseProbability: 0.5, featureLikelihoods: { fever: 0.8 } },
      ],
    });
    expect(() => validatePriorBundle(bundle)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. assemblePriorBundle — complaint-boundary enforcement
// ═══════════════════════════════════════════════════════════════════════════════
describe("assemblePriorBundle", () => {
  const goodRows: RawPriorRow[] = [
    { ccId: "cough", diagnosis: "flu", baseProbability: 0.3, feature: "fever", likelihood: 0.8, version: 1 },
    { ccId: "cough", diagnosis: "flu", baseProbability: 0.3, feature: "cough", likelihood: 0.7, version: 1 },
    { ccId: "cough", diagnosis: "flu", baseProbability: 0.3, feature: "fatigue", likelihood: 0.6, version: 1 },
    { ccId: "cough", diagnosis: "covid", baseProbability: 0.2, feature: "fever", likelihood: 0.75, version: 1 },
    { ccId: "cough", diagnosis: "covid", baseProbability: 0.2, feature: "anosmia", likelihood: 0.6, version: 1 },
    { ccId: "cough", diagnosis: "covid", baseProbability: 0.2, feature: "cough", likelihood: 0.9, version: 1 },
  ];

  it("assembles a valid bundle from clean rows", () => {
    const bundle = assemblePriorBundle("cough", goodRows);
    expect(bundle.ccId).toBe("cough");
    expect(bundle.priors).toHaveLength(2);
    expect(bundle.priors.find(p => p.diagnosis === "flu")?.featureLikelihoods.fever).toBe(0.8);
  });

  it("throws on complaint contamination", () => {
    const contaminatedRows: RawPriorRow[] = [
      { ccId: "sore_throat", diagnosis: "strep", baseProbability: 0.4, feature: "fever", likelihood: 0.6, version: 1 },
    ];
    expect(() => assemblePriorBundle("cough", contaminatedRows)).toThrow(/[Cc]ontamination/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. loadComplaintPriors — last-known-good cache fallback
// ═══════════════════════════════════════════════════════════════════════════════
describe("loadComplaintPriors — last-known-good fallback", () => {
  beforeEach(() => {
    invalidatePriorCache();
  });

  it("returns cached bundle if loader subsequently fails", async () => {
    const bundle = goodBundle();
    _injectPriorCacheForTest("cough", bundle);

    registerPriorLoader(async () => {
      throw new Error("simulated registry failure");
    });

    const result = await loadComplaintPriors("cough");
    expect(result).toBe(bundle);
  });

  it("throws when no cached bundle exists and loader fails", async () => {
    registerPriorLoader(async () => {
      throw new Error("simulated registry failure");
    });

    await expect(loadComplaintPriors("no_cache_complaint")).rejects.toThrow(/simulated registry failure/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. validateScorerCompatibility — scorer/prior contract
// ═══════════════════════════════════════════════════════════════════════════════
describe("validateScorerCompatibility", () => {
  it("throws when bayesian scorer has 0 priors", () => {
    const bundle = goodBundle({ priors: [] as any });
    expect(() => validateScorerCompatibility("bayesian", { ...bundle, priors: [] }))
      .toThrow(/Bayesian scorer requires/i);
  });

  it("passes when bayesian scorer has priors", () => {
    expect(() => validateScorerCompatibility("bayesian", goodBundle())).not.toThrow();
  });

  it("warns (but does not throw) when non-bayesian scorer has priors", () => {
    expect(() => validateScorerCompatibility("rule_based", goodBundle())).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. analyzePosterior — uncertainty detection
// ═══════════════════════════════════════════════════════════════════════════════
describe("analyzePosterior", () => {
  it("throws for empty differential", () => {
    expect(() => analyzePosterior([])).toThrow(/empty differential/i);
  });

  it("marks close diagnoses as uncertain", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.42 },
      { diagnosis: "covid", posterior: 0.39 },
    ];
    const analysis = analyzePosterior(diff);
    expect(analysis.isUncertain).toBe(true);
    expect(analysis.margin).toBeCloseTo(0.03, 2);
  });

  it("marks clear winner as not uncertain", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.82 },
      { diagnosis: "cold", posterior: 0.12 },
    ];
    const analysis = analyzePosterior(diff);
    expect(analysis.isUncertain).toBe(false);
    expect(analysis.topDiagnosis).toBe("flu");
    expect(analysis.topPosterior).toBeCloseTo(0.82, 3);
  });

  it("sorts differential by posterior descending", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "cold", posterior: 0.15 },
      { diagnosis: "flu", posterior: 0.65 },
    ];
    const analysis = analyzePosterior(diff);
    expect(analysis.differential[0].diagnosis).toBe("flu");
  });

  it("computes entropy > 0 for non-degenerate distribution", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.5 },
      { diagnosis: "cold", posterior: 0.3 },
      { diagnosis: "covid", posterior: 0.2 },
    ];
    expect(computeEntropy(diff)).toBeGreaterThan(0);
  });

  it("entropy = 0 when one diagnosis has posterior = 1", () => {
    const diff: DifferentialResult[] = [{ diagnosis: "flu", posterior: 1.0 }];
    expect(computeEntropy(diff)).toBeCloseTo(0, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. applyRiskOverride — high-risk diagnosis escalation
// ═══════════════════════════════════════════════════════════════════════════════
describe("applyRiskOverride", () => {
  it("returns true when PE is present above floor (0.05)", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "uri", posterior: 0.6 },
      { diagnosis: "pulmonary_embolism", posterior: 0.08 },
    ];
    expect(applyRiskOverride(analyzePosterior(diff))).toBe(true);
  });

  it("returns false when PE is below floor threshold", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "uri", posterior: 0.9 },
      { diagnosis: "pulmonary_embolism", posterior: 0.02 },
    ];
    expect(applyRiskOverride(analyzePosterior(diff))).toBe(false);
  });

  it("returns true for meningitis even at low posterior", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "headache", posterior: 0.7 },
      { diagnosis: "meningitis", posterior: 0.06 },
    ];
    expect(applyRiskOverride(analyzePosterior(diff))).toBe(true);
  });

  it("returns false when no high-risk diagnosis present", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.7 },
      { diagnosis: "cold", posterior: 0.2 },
    ];
    expect(applyRiskOverride(analyzePosterior(diff))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. deriveDisposition — full decision logic
// ═══════════════════════════════════════════════════════════════════════════════
describe("deriveDisposition", () => {
  it("returns ER_NOW when high-risk diagnosis present", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "uri", posterior: 0.6 },
      { diagnosis: "pulmonary_embolism", posterior: 0.08 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["cough", "chest pain"]);
    expect(decision.disposition).toBe("ER_NOW");
  });

  it("returns NEEDS_MORE_DATA when symptoms count is too low", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.75 },
      { diagnosis: "cold", posterior: 0.2 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["cough"]);
    expect(decision.disposition).toBe("NEEDS_MORE_DATA");
  });

  it("returns NEEDS_MORE_DATA when differential is uncertain", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.42 },
      { diagnosis: "covid", posterior: 0.39 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["fever", "cough"]);
    expect(decision.disposition).toBe("NEEDS_MORE_DATA");
  });

  it("returns HOME for clear high-confidence winner", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.82 },
      { diagnosis: "cold", posterior: 0.12 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["fever", "cough"]);
    expect(decision.disposition).toBe("HOME");
  });

  it("returns URGENT_CARE for moderate confidence", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "strep", posterior: 0.65 },
      { diagnosis: "viral_pharyngitis", posterior: 0.25 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["sore throat", "fever"]);
    expect(decision.disposition).toBe("URGENT_CARE");
  });

  it("risk override takes priority over symptom count check", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "headache", posterior: 0.7 },
      { diagnosis: "meningitis", posterior: 0.08 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["headache"]);
    expect(decision.disposition).toBe("ER_NOW");
  });

  it("populates reasoning array with explanation", () => {
    const diff: DifferentialResult[] = [
      { diagnosis: "flu", posterior: 0.82 },
      { diagnosis: "cold", posterior: 0.12 },
    ];
    const decision = deriveDisposition(analyzePosterior(diff), ["fever", "cough"]);
    expect(decision.reasoning.length).toBeGreaterThan(0);
    expect(decision.primaryDiagnosis).toBe("flu");
  });
});
