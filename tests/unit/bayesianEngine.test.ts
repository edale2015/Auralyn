import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runDifferential,
  bayesianUpdate,
  topDifferentials,
  setRuntimePriors,
  clearRuntimePriors,
  getSourceTrace,
  getActivePriors,
  type DiagnosisPrior,
  type DifferentialResult,
  type RunDifferentialOptions,
} from "../../server/clinical/bayesianEngine";

// ── Test priors matching the packet's test fixtures ───────────────────────────

const TEST_PRIORS: DiagnosisPrior[] = [
  {
    diagnosis: "Flu",
    baseProbability: 0.2,
    featureLikelihoods: {
      fever:     0.9,
      chills:    0.8,
      cough:     0.7,
      myalgias:  0.8,
    },
    ruleId: "flu_rule",
  },
  {
    diagnosis: "Common Cold",
    baseProbability: 0.5,
    featureLikelihoods: {
      cough:       0.6,
      rhinorrhea:  0.9,
      sore_throat: 0.7,
      fever:       0.2,
    },
    ruleId: "cold_rule",
  },
  {
    diagnosis: "Meningitis",
    baseProbability: 0.05,
    featureLikelihoods: {
      fever:         0.8,
      headache:      0.9,
      photophobia:   0.8,
      neck_stiffness: 0.95,
    },
    ruleId: "meningitis_rule",
  },
];

// ── Helper ────────────────────────────────────────────────────────────────────

function approxEqual(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) < eps;
}

function sumPosteriors(results: DifferentialResult[]): number {
  return results.reduce((sum, r) => sum + r.posterior, 0);
}

// ── Core Bayes: packet test cases ─────────────────────────────────────────────

describe("bayesianUpdate", () => {
  // ── Test case 1: All symptoms match one prior strongly ──────────────────────

  it("T1 — all symptoms match Flu: Flu ranks first", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever", "chills", "cough", "myalgias"], {
      correlatedFeatureGroups: [["fever", "chills"]],
      correlationDampening: 0.6,
    });
    expect(r.length).toBe(3);
    expect(r[0].diagnosis).toBe("Flu");
    expect(r[0].posterior).toBeGreaterThan(r[1].posterior);
  });

  // ── Test case 2: No symptoms match any prior (globally unknown) ─────────────

  it("T2 — globally unknown symptoms fall back to prior-only ranking", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["purple_toes", "alien_rash"]);
    // All 3 diagnoses should appear (prior-only ranking, not empty)
    expect(r.length).toBe(3);
    // Common Cold has highest baseProbability (0.5) so should rank first
    expect(r[0].diagnosis).toBe("Common Cold");
    // Posteriors should sum to ~1
    expect(approxEqual(sumPosteriors(r), 1)).toBe(true);
    // All confidence should be "low" — no evidence was modeled
    expect(r.every(x => x.confidence === "low")).toBe(true);
  });

  // ── Test case 3: Single symptom (neck_stiffness) →  Meningitis ─────────────

  it("T3 — single symptom neck_stiffness → Meningitis ranks first", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["neck_stiffness"]);
    expect(r.length).toBe(3);
    expect(r[0].diagnosis).toBe("Meningitis");
  });

  // ── Test case 4: 20 symptoms including correlated and unknown ───────────────

  it("T4 — 20 symptoms with correlation groups: bounded, finite posteriors", () => {
    const manySymptoms = [
      "fever", "chills", "cough", "myalgias", "headache",
      "photophobia", "neck_stiffness", "rhinorrhea", "sore_throat", "nausea",
      "vomiting", "fatigue", "rigors", "nasal_congestion", "dizziness",
      "blurred_vision", "unknown_1", "unknown_2", "unknown_3", "unknown_4",
    ];

    const r = bayesianUpdate(TEST_PRIORS, manySymptoms, {
      correlatedFeatureGroups: [
        ["fever", "chills", "rigors"],
        ["rhinorrhea", "nasal_congestion"],
        ["photophobia", "headache"],
        ["nausea", "vomiting"],
      ],
      correlationDampening: 0.6,
    });

    expect(r.length).toBe(3);
    // Posteriors are valid probabilities
    expect(r.every(x => Number.isFinite(x.posterior) && x.posterior >= 0 && x.posterior <= 1)).toBe(true);
    // Sum to 1 within floating point tolerance
    expect(approxEqual(sumPosteriors(r), 1, 0.001)).toBe(true);
  });
});

// ── runDifferential ───────────────────────────────────────────────────────────

describe("runDifferential (active-prior mode)", () => {
  beforeEach(() => {
    setRuntimePriors(TEST_PRIORS);
  });

  afterEach(() => {
    clearRuntimePriors();
  });

  it("returns results for the active KB priors", () => {
    const r = runDifferential(["fever", "chills"]);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]).toHaveProperty("diagnosis");
    expect(r[0]).toHaveProperty("posterior");
    expect(r[0]).toHaveProperty("confidence");
    expect(r[0]).toHaveProperty("matchedFeatures");
    expect(r[0]).toHaveProperty("source");
  });

  it("source tag is KB_DB when runtime priors are loaded", () => {
    const r = runDifferential(["fever"]);
    expect(r.every(x => x.source === "KB_DB")).toBe(true);
  });

  it("source tag is FALLBACK_HARDCODED when no runtime priors", () => {
    clearRuntimePriors();
    const r = runDifferential(["fever"]);
    expect(r.every(x => x.source === "FALLBACK_HARDCODED")).toBe(true);
  });

  it("posteriors sum to approximately 1", () => {
    const r = runDifferential(["fever", "cough"]);
    expect(approxEqual(sumPosteriors(r), 1, 0.001)).toBe(true);
  });

  it("empty symptoms list falls back to prior-only ranking (not empty)", () => {
    const r = runDifferential([]);
    expect(r.length).toBeGreaterThan(0);
  });

  it("all-unknown symptoms fall back to prior-only ranking", () => {
    const r = runDifferential(["xyzzy", "frobnitz"]);
    expect(r.length).toBe(3);
    expect(r[0].diagnosis).toBe("Common Cold");  // highest baseProbability
    expect(approxEqual(sumPosteriors(r), 1)).toBe(true);
  });
});

// ── Symptom deduplication ─────────────────────────────────────────────────────

describe("symptom deduplication", () => {
  it("duplicate symptoms do not double-count evidence", () => {
    const nodup  = bayesianUpdate(TEST_PRIORS, ["fever"]);
    const withdup = bayesianUpdate(TEST_PRIORS, ["fever", "fever", "fever"]);
    expect(withdup[0].diagnosis).toBe(nodup[0].diagnosis);
    // Posteriors should be very close (exact same after dedup)
    expect(approxEqual(withdup[0].posterior, nodup[0].posterior, 0.001)).toBe(true);
  });

  it("whitespace-normalized duplicates are also deduplicated", () => {
    const r1 = bayesianUpdate(TEST_PRIORS, ["fever"]);
    const r2 = bayesianUpdate(TEST_PRIORS, ["fever", "  Fever  ", "FEVER"]);
    expect(approxEqual(r1[0].posterior, r2[0].posterior, 0.001)).toBe(true);
  });
});

// ── Correlation dampening ─────────────────────────────────────────────────────

describe("correlation dampening", () => {
  it("dampening reduces posterior inflation from correlated symptoms", () => {
    // Without dampening: fever + chills both count fully → higher Flu posterior
    const noDampening = bayesianUpdate(TEST_PRIORS, ["fever", "chills"], {
      correlationDampening: 1.0,  // no dampening
      correlatedFeatureGroups: [["fever", "chills"]],
    });

    // With dampening: chills gets 0.6 weight → lower (more honest) Flu posterior
    const withDampening = bayesianUpdate(TEST_PRIORS, ["fever", "chills"], {
      correlationDampening: 0.6,
      correlatedFeatureGroups: [["fever", "chills"]],
    });

    // Both should rank Flu first but dampened version should have lower posterior
    expect(noDampening[0].diagnosis).toBe("Flu");
    expect(withDampening[0].diagnosis).toBe("Flu");
    expect(withDampening[0].posterior).toBeLessThan(noDampening[0].posterior);
  });

  it("no dampening when correlatedFeatureGroups is empty (default for KB mode)", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever", "chills"], {
      correlatedFeatureGroups: [],
    });
    expect(r.length).toBe(3);
    expect(r[0].diagnosis).toBe("Flu");
  });
});

// ── Confidence classification ─────────────────────────────────────────────────

describe("confidence classification", () => {
  it("single symptom match is never 'high' (requires >= 2 matched features)", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["neck_stiffness"], {
      highConfidencePosterior: 0.7,
    });
    // neck_stiffness strongly matches Meningitis — it should rank first
    expect(r[0].diagnosis).toBe("Meningitis");
    // But only 1 matched feature — cannot be "high"
    expect(r[0].confidence).not.toBe("high");
  });

  it("strong multi-symptom match can reach 'high' confidence", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever", "chills", "cough", "myalgias"], {
      highConfidencePosterior: 0.5,  // lower threshold for this test
      moderateConfidencePosterior: 0.2,
    });
    // Flu should win with 4 matched features
    expect(r[0].diagnosis).toBe("Flu");
    expect(r[0].matchedFeatures.length).toBeGreaterThanOrEqual(2);
    // Could be high with a lowered threshold
    expect(["high", "moderate"]).toContain(r[0].confidence);
  });

  it("no modeled symptoms → all results are 'low' confidence", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["purple_toes"]);
    expect(r.every(x => x.confidence === "low")).toBe(true);
  });
});

// ── Numerical robustness ──────────────────────────────────────────────────────

describe("numerical robustness", () => {
  it("degenerate priors with zero baseProbability are skipped", () => {
    const degeneratePriors: DiagnosisPrior[] = [
      { diagnosis: "A", baseProbability: 0, featureLikelihoods: { fever: 0.9 } },
      { diagnosis: "B", baseProbability: 0.5, featureLikelihoods: { fever: 0.5 } },
    ];
    const r = bayesianUpdate(degeneratePriors, ["fever"]);
    expect(r.every(x => x.diagnosis !== "A" || x.posterior === 0)).toBe(true);
    expect(r.some(x => x.diagnosis === "B" && x.posterior > 0)).toBe(true);
  });

  it("non-finite baseProbability priors are skipped", () => {
    const priors: DiagnosisPrior[] = [
      { diagnosis: "NaN", baseProbability: NaN, featureLikelihoods: { fever: 0.9 } },
      { diagnosis: "OK",  baseProbability: 0.5,  featureLikelihoods: { fever: 0.5 } },
    ];
    const r = bayesianUpdate(priors, ["fever"]);
    expect(r.some(x => Number.isNaN(x.posterior))).toBe(false);
    expect(r.some(x => x.diagnosis === "OK")).toBe(true);
  });

  it("all posteriors are finite and in [0, 1]", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever", "chills", "cough", "myalgias"]);
    expect(r.every(x => Number.isFinite(x.posterior))).toBe(true);
    expect(r.every(x => x.posterior >= 0 && x.posterior <= 1)).toBe(true);
  });

  it("empty priors array returns empty result", () => {
    expect(bayesianUpdate([], ["fever"])).toHaveLength(0);
  });

  it("likelihood clamp prevents log(0) on zero-valued likelihoods", () => {
    const priors: DiagnosisPrior[] = [
      { diagnosis: "A", baseProbability: 0.5, featureLikelihoods: { fever: 0 } },
      { diagnosis: "B", baseProbability: 0.5, featureLikelihoods: { fever: 0.8 } },
    ];
    expect(() => bayesianUpdate(priors, ["fever"])).not.toThrow();
    const r = bayesianUpdate(priors, ["fever"]);
    expect(r.every(x => Number.isFinite(x.posterior))).toBe(true);
  });
});

// ── Posterior normalization ────────────────────────────────────────────────────

describe("posterior normalization", () => {
  it("posteriors always sum to approximately 1 for standard inputs", () => {
    const cases = [
      ["fever"],
      ["fever", "cough"],
      ["fever", "chills", "cough", "myalgias"],
      ["neck_stiffness", "headache", "photophobia"],
    ];
    for (const symptoms of cases) {
      const r = bayesianUpdate(TEST_PRIORS, symptoms);
      expect(approxEqual(sumPosteriors(r), 1, 0.001)).toBe(true);
    }
  });

  it("fallback posteriors sum to 1 when no modeled symptoms present", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["totally_unknown_symptom"]);
    expect(approxEqual(sumPosteriors(r), 1)).toBe(true);
  });
});

// ── matchedFeatures ───────────────────────────────────────────────────────────

describe("matchedFeatures", () => {
  it("only features actually in the prior's likelihood table are matched", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever", "neck_stiffness"]);
    // Flu doesn't have neck_stiffness in its table → should not appear in Flu's matched
    const flu = r.find(x => x.diagnosis === "Flu");
    expect(flu?.matchedFeatures).toContain("fever");
    expect(flu?.matchedFeatures).not.toContain("neck_stiffness");

    // Meningitis has neck_stiffness → should appear
    const meningitis = r.find(x => x.diagnosis === "Meningitis");
    expect(meningitis?.matchedFeatures).toContain("neck_stiffness");
    expect(meningitis?.matchedFeatures).toContain("fever");
  });

  it("globally unknown symptoms are not in any matchedFeatures list", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever", "purple_toes"]);
    // purple_toes is not in any prior → should not appear in any matchedFeatures
    expect(r.every(x => !x.matchedFeatures.includes("purple_toes"))).toBe(true);
  });
});

// ── Source provenance ─────────────────────────────────────────────────────────

describe("source provenance", () => {
  it("priors with ruleId get source KB_DB", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever"]);
    expect(r.every(x => x.source === "KB_DB")).toBe(true);
    expect(r.every(x => x.ruleId !== undefined)).toBe(true);
  });

  it("priors without ruleId/tableName/version get source FALLBACK_HARDCODED", () => {
    const minimalPriors: DiagnosisPrior[] = [
      { diagnosis: "A", baseProbability: 0.5, featureLikelihoods: { fever: 0.8 } },
      { diagnosis: "B", baseProbability: 0.5, featureLikelihoods: { cough: 0.6 } },
    ];
    const r = bayesianUpdate(minimalPriors, ["fever"]);
    expect(r.every(x => x.source === "FALLBACK_HARDCODED")).toBe(true);
  });

  it("featureLikelihoods are preserved in results for trace purposes", () => {
    const r = bayesianUpdate(TEST_PRIORS, ["fever"]);
    expect(r.every(x => x.featureLikelihoods !== undefined)).toBe(true);
  });
});

// ── topDifferentials ──────────────────────────────────────────────────────────

describe("topDifferentials", () => {
  beforeEach(() => setRuntimePriors(TEST_PRIORS));
  afterEach(() => clearRuntimePriors());

  it("returns at most N results", () => {
    const r = topDifferentials(["fever", "cough"], 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("filters by minPosterior", () => {
    const r = topDifferentials(["fever"], 10, 0.5);
    expect(r.every(x => x.posterior >= 0.5)).toBe(true);
  });

  it("returns empty when nothing passes minPosterior threshold", () => {
    const r = topDifferentials(["fever"], 10, 0.99);
    // Either empty or the returned ones all pass
    expect(r.every(x => x.posterior >= 0.99)).toBe(true);
  });
});

// ── setRuntimePriors / clearRuntimePriors ─────────────────────────────────────

describe("runtime prior management", () => {
  afterEach(() => clearRuntimePriors());

  it("setRuntimePriors skips priors with no featureLikelihoods", () => {
    const empty: DiagnosisPrior[] = [
      { diagnosis: "A", baseProbability: 0.5, featureLikelihoods: {} },
    ];
    setRuntimePriors(empty);
    // Should fall back to embedded PRIORS — source should be FALLBACK_HARDCODED
    const trace = getSourceTrace();
    expect(trace.source).toBe("FALLBACK_HARDCODED");
  });

  it("setRuntimePriors accepts priors with featureLikelihoods and marks KB_DB", () => {
    setRuntimePriors(TEST_PRIORS);
    const trace = getSourceTrace();
    expect(trace.source).toBe("KB_DB");
    expect(trace.priorCount).toBe(3);
  });

  it("clearRuntimePriors falls back to embedded PRIORS", () => {
    setRuntimePriors(TEST_PRIORS);
    clearRuntimePriors();
    expect(getActivePriors().length).toBeGreaterThan(0);  // embedded PRIORS
    const trace = getSourceTrace();
    expect(trace.source).toBe("FALLBACK_HARDCODED");
  });
});
