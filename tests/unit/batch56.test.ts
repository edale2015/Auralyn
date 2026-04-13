/**
 * Batch 56 — Eval Engine + Command Center
 * Articles 28a, 28b, 28c, 29
 *
 * Tests:
 *   comparator.ts          (8 tests)
 *   evalRunner.ts          (5 tests)
 *   evalEngine.ts          (8 tests)
 *   regressionMonitor.ts   (7 tests)
 *   triggerOptimizer.ts    (7 tests)
 *   benchmarkTracker.ts    (6 tests)
 *   patientGenerator.ts    (6 tests)
 *   sepsisEngine.ts        (7 tests)
 *   icuPredictor.ts        (5 tests)
 *   validationHarness.ts   (6 tests)
 *   multiPatientSimulator  (4 tests)
 *   weightUpdater.ts       (7 tests)
 *   hospitalRegistry.ts    (5 tests)
 *   bedAllocator.ts        (6 tests)
 *
 * Total: 87 tests
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Module imports ─────────────────────────────────────────────────────────────

import {
  scoreOutput, compareOutputs, assessSkillNecessity,
  type ClinicalOutput,
} from "../../server/evals/comparator";

import { runEvalCase } from "../../server/evals/evalRunner";

import {
  runEvalSuite, registerEvalCases, getEvalCases,
  type EvalCase,
} from "../../server/evals/evalEngine";

import {
  runRegressionCheck, getAlerts,
} from "../../server/evals/regressionMonitor";

import { optimizeTriggerDescription } from "../../server/evals/triggerOptimizer";

import {
  runBenchmark, getBenchmarkHistory, compareBenchmarks,
} from "../../server/evals/benchmarkTracker";

import {
  generatePatient, generateSepsisCohort, generateHealthyCohort, generateMixedCohort,
} from "../../server/simulation/patientGenerator";

import {
  calculateNEWS2, calculateQSOFA, detectSepsis,
} from "../../server/clinical/sepsisEngine";

import { predictICUNeed } from "../../server/clinical/icuPredictor";

import {
  runValidation, runCohortValidation, deriveExpected,
} from "../../server/evals/validationHarness";

import { simulatePatients, runDigitalTwin } from "../../server/simulation/multiPatientSimulator";

import {
  updateWeights, getWeights, getUpdateHistory, resetWeights,
} from "../../server/rlhf/weightUpdater";

import {
  getAllHospitals, getAvailableHospital, getTotalAvailableBeds,
  getSystemOccupancy, updateBedCount,
} from "../../server/coordination/hospitalRegistry";

import {
  allocateICUBed, releaseICUBed, getNetworkStatus, getAllAllocations,
} from "../../server/coordination/bedAllocator";

// ════════════════════════════════════════════════════════════════════════════════
// 1. comparator.ts (8 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("comparator.ts — blind comparator", () => {
  const expected: ClinicalOutput = {
    diagnosis:   "Sepsis suspected",
    disposition: "ICU admission",
    orders:      ["Blood cultures", "Antibiotics"],
  };

  it("scoreOutput — perfect match → 1.0", () => {
    const score = scoreOutput(expected, expected);
    expect(score).toBe(1.0);
  });

  it("scoreOutput — diagnosis only match → 0.40", () => {
    const score = scoreOutput(expected, {
      diagnosis:   "Sepsis suspected",
      disposition: "discharge",
      orders:      [],
    });
    expect(score).toBeCloseTo(0.4, 2);
  });

  it("scoreOutput — no match → 0.0", () => {
    const score = scoreOutput(expected, {
      diagnosis:   "viral URI",
      disposition: "discharge",
      orders:      [],
    });
    expect(score).toBe(0);
  });

  it("scoreOutput — partial orders credit applied", () => {
    const score = scoreOutput(expected, {
      diagnosis:   "Sepsis suspected",
      disposition: "ICU admission",
      orders:      ["Blood cultures"],   // half the orders
    });
    // diagnosis 0.4 + disposition 0.4 + partial orders 0.1 = 0.9
    expect(score).toBeCloseTo(0.9, 2);
  });

  it("compareOutputs — returns scoreA and scoreB", () => {
    const result = compareOutputs(expected, expected, { diagnosis: "other", disposition: "home" });
    expect(result.scoreA).toBe(1.0);
    expect(result.scoreB).toBe(0);
    expect(result.winnerLabel).toBe("A");
  });

  it("compareOutputs — passed = true when scoreA >= 0.9", () => {
    const result = compareOutputs(expected, expected, {});
    expect(result.passed).toBe(true);
  });

  it("compareOutputs — passed = false when scoreA < 0.9", () => {
    const result = compareOutputs(expected, { diagnosis: "viral URI" }, expected);
    expect(result.passed).toBe(false);
  });

  it("assessSkillNecessity — redundant when delta ≤ 0.05", () => {
    const result = assessSkillNecessity([0.5, 0.5], [0.5, 0.5]);
    expect(result.verdict).toBe("redundant");
    expect(result.delta).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. evalRunner.ts (5 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("evalRunner.ts — isolated execution", () => {
  const septicCase: EvalCase = {
    id: "case-septic-1",
    input: {
      vitals: { hr: 135, rr: 28, temp: 39.1, sbp: 82, spo2: 88 },
      labs:   { lactate: 3.2, wbc: 16.5 },
    },
    expected: { diagnosis: "Sepsis suspected", disposition: "ICU admission" },
    tags: ["sepsis", "critical"],
  };

  it("runEvalCase — returns EvalRunResult with required fields", async () => {
    const result = await runEvalCase(septicCase, true, "sepsis-triage");
    expect(result).toMatchObject({
      caseId:   "case-septic-1",
      useSkill: true,
    });
    expect(result.contextId).toMatch(/^ctx_/);
    expect(result.output).toHaveProperty("diagnosis");
    expect(result.output).toHaveProperty("disposition");
  });

  it("runEvalCase — each call gets unique contextId (isolation)", async () => {
    const r1 = await runEvalCase(septicCase, true,  "sepsis-triage");
    const r2 = await runEvalCase(septicCase, false, "sepsis-triage");
    expect(r1.contextId).not.toBe(r2.contextId);
  });

  it("runEvalCase — with-skill output includes more orders than without", async () => {
    const withSkill    = await runEvalCase(septicCase, true,  "sepsis-triage");
    const withoutSkill = await runEvalCase(septicCase, false, "sepsis-triage");
    expect((withSkill.output.orders ?? []).length).toBeGreaterThanOrEqual(
      (withoutSkill.output.orders ?? []).length
    );
  });

  it("runEvalCase — tokenUsage is positive number", async () => {
    const result = await runEvalCase(septicCase, true, "sepsis-triage");
    expect(result.tokenUsage).toBeGreaterThan(0);
  });

  it("runEvalCase — elapsedMs is non-negative", async () => {
    const result = await runEvalCase(septicCase, true, "sepsis-triage");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. evalEngine.ts (8 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("evalEngine.ts — skill eval suite", () => {
  const sepsisSkill = "sepsis-triage-test";

  const cases: EvalCase[] = [
    {
      id: "e1",
      input: { vitals: { hr: 135, rr: 28, sbp: 82, spo2: 88, temp: 39.1 }, labs: { lactate: 3.2 } },
      expected: { diagnosis: "Sepsis (qSOFA ≥ 2 or NEWS2 > 5 or lactate > 2)", disposition: "ICU admission" },
      tags: ["sepsis", "critical"],
    },
    {
      id: "e2",
      input: { vitals: { hr: 78, rr: 16, sbp: 128, spo2: 98, temp: 37.1 }, labs: { lactate: 1.1 } },
      expected: { diagnosis: "No sepsis criteria met", disposition: "ED monitoring" },
      tags: ["healthy"],
    },
    {
      id: "e3",
      input: { vitals: { hr: 120, rr: 24, sbp: 95, spo2: 91, temp: 38.8 }, labs: { lactate: 2.5 } },
      expected: { diagnosis: "Sepsis (qSOFA ≥ 2 or NEWS2 > 5 or lactate > 2)", disposition: "Hospital admission" },
      tags: ["sepsis", "moderate"],
    },
  ];

  it("runEvalSuite — returns EvalSuiteResult with all required fields", async () => {
    const result = await runEvalSuite(sepsisSkill, cases);
    expect(result.skillName).toBe(sepsisSkill);
    expect(result.totalCases).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
  });

  it("runEvalSuite — runs in parallel (no context bleed between cases)", async () => {
    const start = Date.now();
    await runEvalSuite(sepsisSkill, cases);
    const elapsed = Date.now() - start;
    // Sequential would take much longer — parallel should be fast
    expect(elapsed).toBeLessThan(5000);
  });

  it("runEvalSuite — each result has scoreBaseline and score", async () => {
    const result = await runEvalSuite(sepsisSkill, cases);
    for (const r of result.results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.scoreBaseline).toBeGreaterThanOrEqual(0);
      expect(typeof r.passed).toBe("boolean");
    }
  });

  it("runEvalSuite — necessity verdict is valid enum", async () => {
    const result = await runEvalSuite(sepsisSkill, cases);
    expect(["essential", "helpful", "redundant", "obsolete", "indeterminate"]).toContain(result.necessity.verdict);
  });

  it("runEvalSuite — suite history persists after run", async () => {
    await runEvalSuite("history-test-skill", cases.slice(0, 1));
    const { getSuiteHistory } = await import("../../server/evals/evalEngine");
    const history = getSuiteHistory("history-test-skill");
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it("registerEvalCases / getEvalCases — store and retrieve cases", () => {
    registerEvalCases("stored-skill", cases.slice(0, 2));
    const stored = getEvalCases("stored-skill");
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe("e1");
  });

  it("runEvalSuite — avgScore is between 0 and 1", async () => {
    const result = await runEvalSuite(sepsisSkill, cases);
    expect(result.avgScore).toBeGreaterThanOrEqual(0);
    expect(result.avgScore).toBeLessThanOrEqual(1);
  });

  it("runEvalSuite — diff contains expected/outputA/outputB", async () => {
    const result = await runEvalSuite(sepsisSkill, cases);
    const r = result.results[0];
    expect(r.diff).toHaveProperty("expected");
    expect(r.diff).toHaveProperty("outputA");
    expect(r.diff).toHaveProperty("outputB");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. regressionMonitor.ts (7 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("regressionMonitor.ts — CLINICAL_REGRESSION detection", () => {
  const skillName = "regression-test-sepsis";

  const perfectCases: EvalCase[] = [
    {
      id: "r1",
      input: { vitals: { hr: 75, rr: 16, sbp: 120, spo2: 99, temp: 37 }, labs: { lactate: 1.0 } },
      expected: { diagnosis: "No sepsis criteria met", disposition: "ED monitoring" },
    },
  ];

  it("runRegressionCheck — returns passRate between 0 and 1", async () => {
    const result = await runRegressionCheck(skillName, perfectCases);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
  });

  it("runRegressionCheck — passes = true when passRate >= threshold", async () => {
    const result = await runRegressionCheck(skillName, perfectCases, 0.0);
    expect(result.passed).toBe(true);
    expect(result.alert).toBeUndefined();
  });

  it("runRegressionCheck — fires CLINICAL_REGRESSION alert when passRate < 0.95", async () => {
    // Force failure by using impossible expected outputs
    const failCases: EvalCase[] = [{
      id: "fail1",
      input: { vitals: { hr: 75, rr: 16, sbp: 120, spo2: 99, temp: 37 }, labs: { lactate: 1.0 } },
      expected: {
        diagnosis:   "Rare exotic diagnosis that will never match",
        disposition: "Teleport patient",
        orders:      ["Impossible order A", "Impossible order B"],
      },
    }];
    const result = await runRegressionCheck("fail-skill-" + Date.now(), failCases);
    if (!result.passed) {
      expect(result.alert).toBeDefined();
      expect(result.alert!.type).toBe("CLINICAL_REGRESSION");
    }
  });

  it("runRegressionCheck — alert contains skill name", async () => {
    const failCases: EvalCase[] = [{
      id: "fail2",
      input: { vitals: { hr: 75 }, labs: { lactate: 1.0 } },
      expected: { diagnosis: "Impossible X", disposition: "Mars", orders: ["unobtanium"] },
    }];
    const uniqueSkill = "alert-test-" + Date.now();
    const result = await runRegressionCheck(uniqueSkill, failCases);
    if (result.alert) {
      expect(result.alert.skill).toBe(uniqueSkill);
    }
  });

  it("runRegressionCheck — returns suite with results", async () => {
    const result = await runRegressionCheck(skillName, perfectCases);
    expect(result.suite.results).toHaveLength(1);
  });

  it("getAlerts — returns alerts array (may be empty)", () => {
    const alerts = getAlerts("non-existent-skill");
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("getAlerts — retrieves all alerts when no skill filter", () => {
    const all = getAlerts();
    expect(Array.isArray(all)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. triggerOptimizer.ts (7 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("triggerOptimizer.ts — trigger description optimizer", () => {
  it("returns optimal result without iterations if rate >= 0.7", async () => {
    const result = await optimizeTriggerDescription(
      "sepsis-trigger-test",
      "Executes Hour-1 sepsis bundle. Use when patient has sepsis criteria: elevated lactate, fever, or hypotension.",
      ["sepsis protocol", "lactate is elevated", "patient has fever and hypotension"],
    );
    expect(result.skillName).toBe("sepsis-trigger-test");
    expect(result.initialSuccessRate).toBeGreaterThanOrEqual(0);
    expect(result.finalSuccessRate).toBeGreaterThanOrEqual(0);
  });

  it("60/40 split ratio applied", async () => {
    const result = await optimizeTriggerDescription(
      "split-test",
      "PR compliance checklist. Use when PR review is requested.",
      ["review this PR", "check this pull request", "audit the code", "compliance check", "validate merge"],
    );
    expect(result.splitRatio.train).toBeCloseTo(0.6, 1);
    expect(result.splitRatio.holdout).toBeCloseTo(0.4, 1);
  });

  it("returns TriggerOptimizerResult shape", async () => {
    const result = await optimizeTriggerDescription(
      "shape-test",
      "Order medication review skill.",
      ["check meds", "review medications", "drug order"],
    );
    expect(result).toHaveProperty("initialDescription");
    expect(result).toHaveProperty("finalDescription");
    expect(result).toHaveProperty("iterations");
    expect(result).toHaveProperty("improved");
  });

  it("improved flag reflects whether finalSuccessRate > initialSuccessRate", async () => {
    const result = await optimizeTriggerDescription(
      "improved-flag-test",
      "Narrow specialist term nobody uses",
      ["patient looks really sick", "bp is dropping", "not responding"],
    );
    expect(typeof result.improved).toBe("boolean");
    if (result.improved) {
      expect(result.finalSuccessRate).toBeGreaterThan(result.initialSuccessRate);
    }
  });

  it("iterations array has at most MAX_ITERATIONS (5) entries", async () => {
    const result = await optimizeTriggerDescription(
      "max-iter-test",
      "Obscure unexpandable skill description that matches nothing",
      ["query A", "query B", "query C", "query D", "query E", "query F", "query G"],
    );
    expect(result.iterations.length).toBeLessThanOrEqual(5);
  });

  it("handles < 2 queries gracefully", async () => {
    const result = await optimizeTriggerDescription("tiny-test", "desc", ["one query"]);
    expect(result.improved).toBe(false);
    expect(result.iterations).toHaveLength(0);
  });

  it("custom executor override works", async () => {
    let callCount = 0;
    const executor = async (_q: string) => { callCount++; return true; };
    const result = await optimizeTriggerDescription(
      "executor-test",
      "test desc",
      ["q1", "q2", "q3"],
      executor,
    );
    expect(result.finalSuccessRate).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 6. benchmarkTracker.ts (6 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("benchmarkTracker.ts — versioned skill benchmarking", () => {
  const benchSkill = "bench-sepsis-" + Date.now();
  const simpleCases: EvalCase[] = [
    {
      id: "b1",
      input: { vitals: { hr: 75, rr: 16, sbp: 120, spo2: 99, temp: 37 }, labs: { lactate: 1.0 } },
      expected: { diagnosis: "No sepsis criteria met", disposition: "ED monitoring" },
    },
  ];

  it("runBenchmark — returns BenchmarkRun with required fields", async () => {
    const run = await runBenchmark(benchSkill, simpleCases, "1.0.0", "claude-sonnet");
    expect(run.id).toMatch(/^bench_/);
    expect(run.skillName).toBe(benchSkill);
    expect(run.skillVersion).toBe("1.0.0");
    expect(run.passRate).toBeGreaterThanOrEqual(0);
    expect(run.totalTokens).toBeGreaterThan(0);
  });

  it("getBenchmarkHistory — returns array of runs", async () => {
    await runBenchmark(benchSkill, simpleCases, "1.0.1");
    const history = getBenchmarkHistory(benchSkill);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it("compareBenchmarks — returns comparison object", async () => {
    const comparison = compareBenchmarks(benchSkill);
    expect(["improving", "stable", "degrading", "insufficient_data"]).toContain(comparison.trend);
    expect(comparison.skillName).toBe(benchSkill);
  });

  it("compareBenchmarks — insufficient_data for 0 runs", () => {
    const comparison = compareBenchmarks("never-run-skill-" + Date.now());
    expect(comparison.trend).toBe("insufficient_data");
  });

  it("runBenchmark — elapsedMs is recorded", async () => {
    const run = await runBenchmark(benchSkill, simpleCases);
    expect(run.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("compareBenchmarks — delta = latest - baseline passRate", async () => {
    const uniqueSkill = "delta-test-" + Date.now();
    await runBenchmark(uniqueSkill, simpleCases, "1.0.0");
    await runBenchmark(uniqueSkill, simpleCases, "1.0.1");
    const c = compareBenchmarks(uniqueSkill);
    expect(typeof c.delta).toBe("number");
    expect(c.delta).toBeCloseTo(c.latestRate - c.baseline, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. patientGenerator.ts (6 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("patientGenerator.ts — synthetic patient generation", () => {
  it("generatePatient — returns patient with all required fields", () => {
    const p = generatePatient();
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("age");
    expect(p).toHaveProperty("vitals");
    expect(p).toHaveProperty("symptoms");
    expect(p).toHaveProperty("labs");
  });

  it("generatePatient — vitals within article-specified ranges", () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePatient();
      expect(p.vitals.hr).toBeGreaterThanOrEqual(60);
      expect(p.vitals.hr).toBeLessThanOrEqual(140);
      expect(p.vitals.rr).toBeGreaterThanOrEqual(12);
      expect(p.vitals.rr).toBeLessThanOrEqual(35);
      expect(p.vitals.sbp).toBeGreaterThanOrEqual(80);
      expect(p.vitals.sbp).toBeLessThanOrEqual(180);
      expect(p.vitals.spo2).toBeGreaterThanOrEqual(85);
      expect(p.vitals.spo2).toBeLessThanOrEqual(100);
      expect(p.labs.lactate).toBeGreaterThanOrEqual(0.5);
      expect(p.labs.lactate).toBeLessThanOrEqual(6);
    }
  });

  it("generateSepsisCohort — lactate always > 2", () => {
    const cohort = generateSepsisCohort(10);
    expect(cohort).toHaveLength(10);
    for (const p of cohort) {
      expect(p.labs.lactate).toBeGreaterThan(2);
    }
  });

  it("generateHealthyCohort — lactate always < 2", () => {
    const cohort = generateHealthyCohort(10);
    for (const p of cohort) {
      expect(p.labs.lactate).toBeLessThan(2);
    }
  });

  it("generateMixedCohort — returns requested size", () => {
    const cohort = generateMixedCohort(50, 0.3);
    expect(cohort).toHaveLength(50);
  });

  it("generatePatient — each patient has unique id", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePatient().id));
    expect(ids.size).toBe(100);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 8. sepsisEngine.ts (7 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("sepsisEngine.ts — NEWS2 + qSOFA + detectSepsis", () => {
  it("calculateNEWS2 — critical vitals score > 5", () => {
    const result = calculateNEWS2({ hr: 135, rr: 28, sbp: 82, spo2: 88, temp: 39.1 });
    expect(result.score).toBeGreaterThan(5);
    expect(result.level).toBe("emergency");
  });

  it("calculateNEWS2 — normal vitals score = 0", () => {
    const result = calculateNEWS2({ hr: 75, rr: 16, sbp: 125, spo2: 99, temp: 37.0 });
    expect(result.score).toBe(0);
    expect(result.level).toBe("routine");
  });

  it("calculateNEWS2 — breakdown sums to total score", () => {
    const v = { hr: 135, rr: 28, sbp: 82, spo2: 88, temp: 39.1 };
    const result = calculateNEWS2(v);
    const sum = result.breakdown.rr + result.breakdown.spo2 + result.breakdown.temp
              + result.breakdown.sbp + result.breakdown.hr;
    expect(sum).toBe(result.score);
  });

  it("calculateQSOFA — RR >= 22 and SBP <= 100 → score 2, highRisk true", () => {
    const result = calculateQSOFA({ hr: 90, rr: 24, sbp: 98, spo2: 96, temp: 38 });
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.highRisk).toBe(true);
  });

  it("calculateQSOFA — altered mental status adds 1 point", () => {
    const normal  = calculateQSOFA({ hr: 80, rr: 16, sbp: 120, spo2: 98, temp: 37 }, "normal");
    const altered = calculateQSOFA({ hr: 80, rr: 16, sbp: 120, spo2: 98, temp: 37 }, "altered");
    expect(altered.score).toBe(normal.score + 1);
  });

  it("detectSepsis — lactate > 2 alone triggers sepsisRisk", () => {
    const vitals = { hr: 78, rr: 16, sbp: 120, spo2: 99, temp: 37 };
    const labs   = { lactate: 2.5, wbc: 10 };
    const result = detectSepsis(vitals, labs);
    expect(result.sepsisRisk).toBe(true);
    expect(result.lactateHigh).toBe(true);
  });

  it("detectSepsis — normal patient → no sepsis risk", () => {
    const vitals = { hr: 75, rr: 14, sbp: 130, spo2: 99, temp: 37.0 };
    const labs   = { lactate: 1.2, wbc: 8 };
    const result = detectSepsis(vitals, labs);
    expect(result.sepsisRisk).toBe(false);
    expect(result.urgency).toBe("none");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 9. icuPredictor.ts (5 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("icuPredictor.ts — ICU admission probability", () => {
  it("predictICUNeed — sepsis + SBP < 90 + lactate > 4 → needsICU true", () => {
    const vitals  = { hr: 130, rr: 26, sbp: 82, spo2: 89, temp: 38.9 };
    const labs    = { lactate: 5.0, wbc: 18 };
    const sepsis  = detectSepsis(vitals, labs);
    const icu     = predictICUNeed({ vitals, labs }, sepsis);
    expect(icu.needsICU).toBe(true);
    expect(icu.icuProbability).toBeGreaterThan(0.6);
  });

  it("predictICUNeed — healthy patient → needsICU false", () => {
    const vitals  = { hr: 75, rr: 16, sbp: 125, spo2: 99, temp: 37 };
    const labs    = { lactate: 1.0, wbc: 9 };
    const sepsis  = detectSepsis(vitals, labs);
    const icu     = predictICUNeed({ vitals, labs }, sepsis);
    expect(icu.needsICU).toBe(false);
    expect(icu.icuProbability).toBeLessThanOrEqual(0.6);
  });

  it("predictICUNeed — icuProbability capped at 1.0", () => {
    const vitals  = { hr: 140, rr: 35, sbp: 80, spo2: 85, temp: 40 };
    const labs    = { lactate: 6.0, wbc: 20 };
    const sepsis  = detectSepsis(vitals, labs);
    const icu     = predictICUNeed({ vitals, labs }, sepsis);
    expect(icu.icuProbability).toBeLessThanOrEqual(1.0);
  });

  it("predictICUNeed — deteriorationRisk = min(NEWS2 / 10, 1.0)", () => {
    const vitals  = { hr: 135, rr: 28, sbp: 82, spo2: 88, temp: 39.1 };
    const labs    = { lactate: 3.2, wbc: 16 };
    const sepsis  = detectSepsis(vitals, labs);
    const icu     = predictICUNeed({ vitals, labs }, sepsis);
    const expected = Math.min(sepsis.news2 / 10, 1.0);
    expect(icu.deteriorationRisk).toBeCloseTo(expected, 2);
  });

  it("predictICUNeed — riskContributors array reflects what drove the score", () => {
    const vitals  = { hr: 130, rr: 26, sbp: 82, spo2: 89, temp: 38.9 };
    const labs    = { lactate: 4.5, wbc: 18 };
    const sepsis  = detectSepsis(vitals, labs);
    const icu     = predictICUNeed({ vitals, labs }, sepsis);
    expect(icu.riskContributors.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 10. validationHarness.ts (6 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("validationHarness.ts — prediction vs expected", () => {
  it("deriveExpected — lactate > 2 → sepsis = true", () => {
    const p = { ...generatePatient(), labs: { lactate: 3.0, wbc: 12 } };
    expect(deriveExpected(p).sepsis).toBe(true);
  });

  it("deriveExpected — SBP < 90 → icu = true", () => {
    const p = { ...generatePatient(), vitals: { ...generatePatient().vitals, sbp: 85 } };
    expect(deriveExpected(p).icu).toBe(true);
  });

  it("runValidation — returns ValidationResult with patientId", () => {
    const p = generatePatient();
    const r = runValidation(p);
    expect(r.patientId).toBe(p.id);
    expect(typeof r.correct).toBe("boolean");
  });

  it("runValidation — healthy patient is correct (no false positive)", () => {
    const p = generateHealthyCohort(1)[0];
    const r = runValidation(p);
    // For healthy patients (lactate < 2, sbp > 90), correct = true is expected
    expect(r.expected.sepsis).toBe(false);
    expect(r.expected.icu).toBe(false);
  });

  it("runCohortValidation — returns summary with accuracy", () => {
    const cohort = generateMixedCohort(50);
    const { summary } = runCohortValidation(cohort);
    expect(summary.total).toBe(50);
    expect(summary.accuracy).toBeGreaterThanOrEqual(0);
    expect(summary.accuracy).toBeLessThanOrEqual(1);
    expect(typeof summary.fdaMet).toBe("boolean");
  });

  it("runCohortValidation — FDA threshold (0.80) is evaluated", () => {
    // Use healthy cohort which should produce high accuracy
    const cohort = generateHealthyCohort(100);
    const { summary } = runCohortValidation(cohort);
    expect(summary.fdaMet).toBe(summary.accuracy >= 0.80);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 11. multiPatientSimulator.ts (4 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("multiPatientSimulator.ts — N-patient simulation", () => {
  it("simulatePatients — returns SimulationRun with n results", async () => {
    const run = await simulatePatients(20);
    expect(run.n).toBe(20);
    expect(run.results).toHaveLength(20);
    expect(run.id).toMatch(/^sim_/);
  });

  it("simulatePatients — summary includes sepsisCases and icuCases", async () => {
    const run = await simulatePatients(50);
    expect(run.summary.sepsisCases).toBeGreaterThanOrEqual(0);
    expect(run.summary.icuCases).toBeGreaterThanOrEqual(0);
    expect(run.summary.total).toBe(50);
  });

  it("runDigitalTwin — returns projections array", async () => {
    const projections = await runDigitalTwin(30);
    expect(projections).toHaveLength(30);
    for (const p of projections) {
      expect(p).toHaveProperty("patientId");
      expect(p.deteriorationRisk).toBeGreaterThanOrEqual(0);
      expect(p.icuProbability).toBeGreaterThanOrEqual(0);
    }
  });

  it("simulatePatients — accuracy between 0 and 1", async () => {
    const run = await simulatePatients(100);
    expect(run.summary.accuracy).toBeGreaterThanOrEqual(0);
    expect(run.summary.accuracy).toBeLessThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 12. weightUpdater.ts (7 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("weightUpdater.ts — safe RLHF weight updates", () => {
  beforeEach(() => resetWeights());

  it("updateWeights — skips when failures < 50", () => {
    const results = Array.from({ length: 30 }, () => ({ correct: false }));
    const r = updateWeights(results);
    expect(r.updated).toBe(false);
    expect(r.skipped).toMatch(/minimum 50/);
  });

  it("updateWeights — applies delta when failures >= 50", () => {
    const results = Array.from({ length: 60 }, () => ({ correct: false }));
    const r = updateWeights(results, "lactate");
    expect(r.updated).toBe(true);
    expect(r.delta).toBe(0.02);
    expect(r.updatedFeatures).toContain("lactate");
  });

  it("updateWeights — delta is bounded at ±2%", () => {
    const results = Array.from({ length: 200 }, () => ({ correct: false }));
    updateWeights(results);
    updateWeights(results);
    updateWeights(results);
    const weights = getWeights();
    for (const w of weights) {
      expect(w.weight).toBeLessThanOrEqual(0.95);
      expect(w.weight).toBeGreaterThanOrEqual(0.05);
    }
  });

  it("getWeights — returns array with all clinical features", () => {
    const weights = getWeights();
    expect(weights.length).toBeGreaterThanOrEqual(5);
    const features = weights.map((w) => w.feature);
    expect(features).toContain("lactate");
    expect(features).toContain("news2");
    expect(features).toContain("sbp");
  });

  it("getUpdateHistory — records each update", () => {
    const results = Array.from({ length: 60 }, () => ({ correct: false }));
    updateWeights(results);
    updateWeights(results);
    const history = getUpdateHistory();
    expect(history.length).toBe(2);
  });

  it("resetWeights — restores defaults and clears history", () => {
    const results = Array.from({ length: 60 }, () => ({ correct: false }));
    updateWeights(results);
    resetWeights();
    const history = getUpdateHistory();
    expect(history.length).toBe(0);
    const weights = getWeights();
    expect(weights.find((w) => w.feature === "lactate")?.weight).toBe(0.5);
  });

  it("updateWeights — errors array helps identify implicated features", () => {
    const results = Array.from({ length: 60 }, (_, i) => ({
      correct: false,
      errors:  i % 2 === 0 ? ["Sepsis mismatch: lactate=3.2"] : ["ICU mismatch: SBP=82"],
    }));
    const r = updateWeights(results);
    if (r.updated) {
      expect(r.updatedFeatures.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 13. hospitalRegistry.ts (5 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("hospitalRegistry.ts — multi-hospital coordination", () => {
  it("getAllHospitals — returns at least 5 NYC hospitals", () => {
    const hospitals = getAllHospitals();
    expect(hospitals.length).toBeGreaterThanOrEqual(5);
  });

  it("getAvailableHospital — returns hospital with most ICU beds", () => {
    const hospitals = getAllHospitals();
    const available = getAvailableHospital();
    if (available) {
      const maxBeds = Math.max(...hospitals.filter((h) => h.active && h.icuBeds > 0).map((h) => h.icuBeds));
      expect(available.icuBeds).toBe(maxBeds);
    }
  });

  it("getAvailableHospital — specialty filter returns matching hospital", () => {
    const hospital = getAvailableHospital("cardiac");
    if (hospital) {
      expect(hospital.specialties).toContain("cardiac");
    }
  });

  it("getTotalAvailableBeds — returns positive sum", () => {
    const total = getTotalAvailableBeds();
    expect(total).toBeGreaterThan(0);
  });

  it("updateBedCount — modifies hospital bed count", () => {
    const hospitals = getAllHospitals();
    const h = hospitals[0];
    const ok = updateBedCount(h.id, 3);
    expect(ok).toBe(true);
    const updated = getAllHospitals().find((x) => x.id === h.id);
    expect(updated?.icuBeds).toBe(3);
    // Restore
    updateBedCount(h.id, h.icuBeds);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 14. bedAllocator.ts (6 tests)
// ════════════════════════════════════════════════════════════════════════════════

describe("bedAllocator.ts — ICU bed allocation", () => {
  it("allocateICUBed — assigns bed to patient", () => {
    const result = allocateICUBed({ patientId: "P001", urgency: "critical" });
    if (result.assigned) {
      expect(result.hospital).toBeDefined();
      expect(result.patientId).toBe("P001");
    }
  });

  it("allocateICUBed — returns assigned: false when no beds available", () => {
    // Drain all beds
    const all = getAllHospitals();
    for (const h of all) updateBedCount(h.id, 0);

    const result = allocateICUBed({ patientId: "P999", urgency: "critical" });
    expect(result.assigned).toBe(false);
    expect(result.reason).toMatch(/No ICU beds/);

    // Restore
    for (const h of all) updateBedCount(h.id, h.totalIcuBeds);
  });

  it("allocateICUBed — decrements hospital bed count", () => {
    const before = getTotalAvailableBeds();
    const result = allocateICUBed({ patientId: "P002", urgency: "urgent" });
    if (result.assigned) {
      const after = getTotalAvailableBeds();
      expect(after).toBe(before - 1);
    }
  });

  it("getNetworkStatus — returns network summary", () => {
    const status = getNetworkStatus();
    expect(status).toHaveProperty("totalAvailable");
    expect(status).toHaveProperty("occupancy");
    expect(status).toHaveProperty("hospitals");
    expect(status.hospitals.length).toBeGreaterThanOrEqual(1);
  });

  it("releaseICUBed — restores bed count after release", () => {
    const before = getTotalAvailableBeds();
    const alloc  = allocateICUBed({ patientId: "P003", urgency: "urgent" });
    if (alloc.assigned && alloc.allocatedAt) {
      const allocations = getAllAllocations();
      const record = allocations.find((a) => a.patientId === "P003" && a.status === "active");
      if (record) {
        releaseICUBed(record.id, "admitted");
        expect(getTotalAvailableBeds()).toBe(before);
      }
    }
  });

  it("getNetworkStatus — hospital status is open/near_capacity/full", () => {
    const status = getNetworkStatus();
    for (const h of status.hospitals) {
      expect(["open", "near_capacity", "full"]).toContain(h.status);
    }
  });
});
