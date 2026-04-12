import { describe, it, expect, beforeEach } from "vitest";

// ─── 1. FDAValidationService ──────────────────────────────────────────────────
import { fdaValidationService } from "../../server/services/fdaValidationService";
import type { GoldenCaseRunResult } from "../../server/types/clinical";

function makeRun(caseId: string, passed: boolean, mismatches: string[] = []): GoldenCaseRunResult {
  return { caseId, passed, actual: {}, mismatches, runAt: new Date().toISOString() };
}

describe("Batch30 — fdaValidationService", () => {
  it("empty run list: accuracy 0, not FDA ready", () => {
    const report = fdaValidationService.generateReport([]);
    expect(report.totalCases).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.fdaReady).toBe(false);
    expect(report.readinessGrade).toBe("F");
  });

  it("100% pass rate with no high-risk failures: FDA ready, grade A", () => {
    const runs = [makeRun("gc-1", true), makeRun("gc-2", true), makeRun("gc-3", true)];
    const report = fdaValidationService.generateReport(runs);
    expect(report.fdaReady).toBe(true);
    expect(report.readinessGrade).toBe("A");
    expect(report.accuracy).toBeCloseTo(1.0);
    expect(report.highRiskFailures).toBe(0);
  });

  it("80% pass rate with no high-risk failures: FDA ready, grade C", () => {
    const runs = [
      makeRun("gc-1", true), makeRun("gc-2", true), makeRun("gc-3", true), makeRun("gc-4", true),
      makeRun("gc-5", false, ["Expected diagnosis X, got Y"]),
    ];
    const report = fdaValidationService.generateReport(runs);
    expect(report.fdaReady).toBe(true);
    expect(report.readinessGrade).toBe("C");
    expect(report.accuracy).toBeCloseTo(0.8);
  });

  it("missed ED now counts as high-risk failure and blocks FDA readiness", () => {
    const runs = [
      makeRun("gc-1", true),
      makeRun("gc-2", false, ["Expected disposition 'ED now', got 'Home care'"]),
    ];
    const report = fdaValidationService.generateReport(runs);
    expect(report.highRiskFailures).toBe(1);
    expect(report.fdaReady).toBe(false);
    expect(report.criticalMisses).toContain("gc-2");
  });

  it("below 80% accuracy: not FDA ready, grade F", () => {
    const runs = [makeRun("gc-1", true), makeRun("gc-2", false), makeRun("gc-3", false), makeRun("gc-4", false)];
    const report = fdaValidationService.generateReport(runs);
    expect(report.fdaReady).toBe(false);
    expect(report.readinessGrade).toBe("F");
  });

  it("recommendations include corpus size warning for < 10 cases", () => {
    const runs = [makeRun("gc-1", true)];
    const report = fdaValidationService.generateReport(runs);
    expect(report.recommendations.some((r) => r.includes("10 cases"))).toBe(true);
  });

  it("recommendations include FDA-ready message when conditions met", () => {
    const runs = Array.from({ length: 10 }, (_, i) => makeRun(`gc-${i}`, true));
    const report = fdaValidationService.generateReport(runs);
    expect(report.fdaReady).toBe(true);
    expect(report.recommendations.some((r) => r.includes("FDA SaMD"))).toBe(true);
  });

  it("accuracy and counts are numerically correct", () => {
    const runs = [
      makeRun("a", true), makeRun("b", true), makeRun("c", false), makeRun("d", false), makeRun("e", false),
    ];
    const report = fdaValidationService.generateReport(runs);
    expect(report.totalCases).toBe(5);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(3);
    expect(report.accuracy).toBeCloseTo(0.4);
  });

  it("generatedAt is a valid ISO string", () => {
    const report = fdaValidationService.generateReport([makeRun("x", true)]);
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });
});

// ─── 2. HashChain ─────────────────────────────────────────────────────────────
import { auditHashChain } from "../../server/services/hashChain";

describe("Batch30 — hashChain", () => {
  it("fresh chain verifies true (empty)", () => {
    // Create an isolated instance for testing
    const { default: hc } = ((): any => {
      // Use the singleton — it should start valid
      return { default: auditHashChain };
    })();
    expect(auditHashChain.verify()).toBe(true);
  });

  it("add() returns a record with id, hash, prevHash, timestamp", () => {
    const r = auditHashChain.add({ step: "test-step", traceId: "t-001" });
    expect(r.id).toBeTypeOf("number");
    expect(r.hash).toHaveLength(64);
    expect(r.prevHash).toBeTruthy();
    expect(r.timestamp).toBeTruthy();
  });

  it("chain remains valid after multiple additions", () => {
    auditHashChain.add({ step: "step-1" });
    auditHashChain.add({ step: "step-2" });
    auditHashChain.add({ step: "step-3" });
    expect(auditHashChain.verify()).toBe(true);
  });

  it("consecutive records link via prevHash", () => {
    const r1 = auditHashChain.add({ x: 1 });
    const r2 = auditHashChain.add({ x: 2 });
    expect(r2.prevHash).toBe(r1.hash);
  });

  it("length() increases with each add", () => {
    const before = auditHashChain.length();
    auditHashChain.add({ dummy: true });
    expect(auditHashChain.length()).toBe(before + 1);
  });

  it("latest() returns the last added record", () => {
    const r = auditHashChain.add({ marker: "latest-test" });
    expect(auditHashChain.latest()?.hash).toBe(r.hash);
  });

  it("getChain() returns all records in order", () => {
    const chain = auditHashChain.getChain();
    expect(Array.isArray(chain)).toBe(true);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].id).toBeGreaterThan(chain[i - 1].id);
    }
  });

  it("first record has prevHash GENESIS", () => {
    // The very first record added to the chain (id=1) should have prevHash GENESIS
    const chain = auditHashChain.getChain();
    const first = chain[0];
    if (first) expect(first.prevHash).toBe("GENESIS");
  });
});

// ─── 3. DriftDetectionService ─────────────────────────────────────────────────
import { driftDetectionService } from "../../server/services/driftDetectionService";

describe("Batch30 — driftDetectionService", () => {
  beforeEach(() => {
    driftDetectionService.clear();
  });

  it("returns drift:false with insufficient samples (< 10)", () => {
    for (let i = 0; i < 5; i++) {
      driftDetectionService.record({ complaint: "cough", avgConfidence: 0.9, avgRisk: 0.1 });
    }
    const result = driftDetectionService.detect();
    expect(result.drift).toBe(false);
    expect(result.details).toContain("Insufficient samples");
  });

  it("returns drift:false when confidence is stable over 10 samples", () => {
    for (let i = 0; i < 10; i++) {
      driftDetectionService.record({ complaint: "cough", avgConfidence: 0.88, avgRisk: 0.1 });
    }
    const result = driftDetectionService.detect();
    expect(result.drift).toBe(false);
    expect(result.difference).toBeLessThan(0.1);
  });

  it("detects drift when confidence drops >10% over the window", () => {
    // Older 5: high confidence
    for (let i = 0; i < 5; i++) {
      driftDetectionService.record({ complaint: "cough", avgConfidence: 0.95, avgRisk: 0.1 });
    }
    // Recent 5: low confidence (drift!)
    for (let i = 0; i < 5; i++) {
      driftDetectionService.record({ complaint: "cough", avgConfidence: 0.75, avgRisk: 0.1 });
    }
    const result = driftDetectionService.detect();
    expect(result.drift).toBe(true);
    expect(result.difference).toBeGreaterThan(0.1);
    expect(result.recentAvg).toBeCloseTo(0.75, 2);
    expect(result.olderAvg).toBeCloseTo(0.95, 2);
  });

  it("complaint-specific detection ignores other complaints", () => {
    for (let i = 0; i < 5; i++) {
      driftDetectionService.record({ complaint: "cough",  avgConfidence: 0.95, avgRisk: 0.1 });
      driftDetectionService.record({ complaint: "fever",  avgConfidence: 0.5,  avgRisk: 0.8 });
    }
    // Not enough per-complaint samples for cough: 5 only
    const result = driftDetectionService.detect("cough");
    expect(result.drift).toBe(false);
  });

  it("records are tracked by history_length()", () => {
    expect(driftDetectionService.history_length()).toBe(0);
    driftDetectionService.record({ complaint: "test", avgConfidence: 0.7, avgRisk: 0.2 });
    expect(driftDetectionService.history_length()).toBe(1);
  });

  it("clear() resets history", () => {
    driftDetectionService.record({ complaint: "test", avgConfidence: 0.7, avgRisk: 0.2 });
    driftDetectionService.clear();
    expect(driftDetectionService.history_length()).toBe(0);
  });

  it("recentAvg and olderAvg returned even when no drift", () => {
    for (let i = 0; i < 10; i++) {
      driftDetectionService.record({ complaint: "sore throat", avgConfidence: 0.8, avgRisk: 0.2 });
    }
    const result = driftDetectionService.detect();
    expect(typeof result.recentAvg).toBe("number");
    expect(typeof result.olderAvg).toBe("number");
  });
});

// ─── 4. Integration: Workflow → Hash Chain Hook ────────────────────────────────
describe("Batch30 — workflow → hashChain integration", () => {
  it("running a workflow adds records to the hash chain", async () => {
    const { runClinicalWorkflow } = await import("../../server/workflows/clinicalWorkflowEngine");
    const before = auditHashChain.length();
    await runClinicalWorkflow({ patientId: "hc-test-001", complaint: "cough" });
    expect(auditHashChain.length()).toBeGreaterThan(before);
  });

  it("hash chain remains valid after workflow run", async () => {
    const { runClinicalWorkflow } = await import("../../server/workflows/clinicalWorkflowEngine");
    await runClinicalWorkflow({ patientId: "hc-test-002", complaint: "fever" });
    expect(auditHashChain.verify()).toBe(true);
  });

  it("workflow run records drift metric", async () => {
    const { runClinicalWorkflow } = await import("../../server/workflows/clinicalWorkflowEngine");
    driftDetectionService.clear();
    await runClinicalWorkflow({ patientId: "drift-test-001", complaint: "cough" });
    expect(driftDetectionService.history_length()).toBeGreaterThan(0);
  });
});

// ─── 5. Integration: runAllGoldenCases → FDA report ───────────────────────────
describe("Batch30 — goldenCases → FDA report pipeline", () => {
  it("golden case run produces FDA report with fdaReady boolean", async () => {
    const { runAllGoldenCases }  = await import("../../server/services/goldenCaseRunner");
    const suite  = await runAllGoldenCases();
    const report = fdaValidationService.generateReport(suite.results);
    expect(typeof report.fdaReady).toBe("boolean");
    expect(typeof report.accuracy).toBe("number");
    expect(report.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.accuracy).toBeLessThanOrEqual(1);
  });

  it("golden case suite passes both seeded cases (2/2)", async () => {
    const { runAllGoldenCases } = await import("../../server/services/goldenCaseRunner");
    const suite = await runAllGoldenCases();
    expect(suite.passed).toBe(suite.total);
    expect(suite.failed).toBe(0);

    const report = fdaValidationService.generateReport(suite.results);
    expect(report.passed).toBe(suite.total);
    expect(report.highRiskFailures).toBe(0);
  });
});
