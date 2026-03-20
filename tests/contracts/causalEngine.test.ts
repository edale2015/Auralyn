import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
  subscribeToTower: vi.fn(),
}));

import {
  estimateImpact,
  buildCausalReport,
  getRecentCausalReports,
  PatientOutcome,
  CausalInput,
} from "../../server/rwe/causalEngine";

const perfectAI: PatientOutcome[] = Array.from({ length: 10 }, (_, i) => ({
  patientId: `a${i}`,
  recovered: true,
  resolutionDays: 3,
  escalated: false,
}));

const poorControl: PatientOutcome[] = Array.from({ length: 10 }, (_, i) => ({
  patientId: `c${i}`,
  recovered: i < 5,
  resolutionDays: 7,
  escalated: i >= 5,
}));

const zeroAI: PatientOutcome[] = Array.from({ length: 5 }, (_, i) => ({
  patientId: `a${i}`,
  recovered: false,
  resolutionDays: 10,
  escalated: true,
}));

describe("Causal Engine — estimateImpact", () => {
  it("calculates positive uplift when AI group recovers more", () => {
    const metrics = estimateImpact({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(metrics.uplift).toBeGreaterThan(0);
    expect(metrics.aiRecoveryRate).toBe(1.0);
    expect(metrics.controlRecoveryRate).toBe(0.5);
  });

  it("calculates zero uplift when groups are equal", () => {
    const same = poorControl;
    const metrics = estimateImpact({ aiGroup: same, controlGroup: same });
    expect(metrics.uplift).toBe(0);
  });

  it("calculates negative uplift when AI is worse", () => {
    const metrics = estimateImpact({ aiGroup: zeroAI, controlGroup: perfectAI });
    expect(metrics.uplift).toBeLessThan(0);
  });

  it("computes NNT as ceiling of 1/uplift", () => {
    const metrics = estimateImpact({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(metrics.numberNeededToTreat).toBe(2);
  });

  it("returns null NNT when uplift is zero or negative", () => {
    const metrics = estimateImpact({ aiGroup: zeroAI, controlGroup: perfectAI });
    expect(metrics.numberNeededToTreat).toBeNull();
  });

  it("computes median resolution days delta", () => {
    const metrics = estimateImpact({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(metrics.aiMedianDays).toBe(3);
    expect(metrics.controlMedianDays).toBe(7);
    expect(metrics.daysDelta).toBe(4);
  });

  it("returns null daysDelta when no resolutionDays provided", () => {
    const nodays: PatientOutcome[] = [{ patientId: "x", recovered: true }];
    const metrics = estimateImpact({ aiGroup: nodays, controlGroup: nodays });
    expect(metrics.daysDelta).toBeNull();
  });

  it("computes escalation reduction", () => {
    const metrics = estimateImpact({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(metrics.escalationReduction).toBeGreaterThan(0);
  });

  it("handles empty groups without crashing", () => {
    const metrics = estimateImpact({ aiGroup: [], controlGroup: [] });
    expect(metrics.aiRecoveryRate).toBe(0);
    expect(metrics.uplift).toBe(0);
  });

  it("relativeLift is 0 when control recovery is 0", () => {
    const metrics = estimateImpact({ aiGroup: perfectAI, controlGroup: zeroAI });
    expect(metrics.relativeLift).toBe(0);
  });
});

describe("Causal Engine — buildCausalReport", () => {
  it("returns required fields", () => {
    const report = buildCausalReport({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(report).toHaveProperty("studyLabel");
    expect(report).toHaveProperty("evaluatedAt");
    expect(report).toHaveProperty("sampleSizes");
    expect(report).toHaveProperty("metrics");
    expect(report).toHaveProperty("interpretation");
    expect(report).toHaveProperty("confidence");
    expect(report).toHaveProperty("warningFlags");
  });

  it("uses custom studyLabel when provided", () => {
    const report = buildCausalReport({
      aiGroup: perfectAI,
      controlGroup: poorControl,
      studyLabel: "Test Study",
    });
    expect(report.studyLabel).toBe("Test Study");
  });

  it("evaluatedAt is valid ISO timestamp", () => {
    const report = buildCausalReport({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(new Date(report.evaluatedAt).getTime()).toBeGreaterThan(0);
  });

  it("confidence is INSUFFICIENT for tiny groups", () => {
    const tiny: PatientOutcome[] = [{ patientId: "x", recovered: true }];
    const report = buildCausalReport({ aiGroup: tiny, controlGroup: tiny, minSampleSize: 30 });
    expect(report.confidence).toBe("INSUFFICIENT");
  });

  it("confidence is HIGH for large groups", () => {
    const large: PatientOutcome[] = Array.from({ length: 120 }, (_, i) => ({ patientId: `p${i}`, recovered: true }));
    const report = buildCausalReport({ aiGroup: large, controlGroup: large, minSampleSize: 5 });
    expect(report.confidence).toBe("HIGH");
  });

  it("adds warning flags for imbalanced groups", () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ patientId: `b${i}`, recovered: true }));
    const small = [{ patientId: "s1", recovered: true }, { patientId: "s2", recovered: false }];
    const report = buildCausalReport({ aiGroup: big, controlGroup: small, minSampleSize: 1 });
    const imbalanceWarning = report.warningFlags.find((w) => w.match(/imbalance/i));
    expect(imbalanceWarning).toBeDefined();
  });

  it("interpretation mentions uplift when positive", () => {
    const report = buildCausalReport({ aiGroup: perfectAI, controlGroup: poorControl });
    expect(report.interpretation).toMatch(/recovered/i);
  });

  it("interpretation mentions no improvement when uplift is 0 or negative", () => {
    const report = buildCausalReport({ aiGroup: zeroAI, controlGroup: perfectAI });
    expect(report.interpretation).toMatch(/no improvement/i);
  });
});

describe("Causal Engine — getRecentCausalReports", () => {
  it("stores and retrieves recent reports", () => {
    buildCausalReport({ aiGroup: perfectAI, controlGroup: poorControl, studyLabel: "Stored" });
    const reports = getRecentCausalReports(10);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[reports.length - 1].studyLabel).toBe("Stored");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      buildCausalReport({ aiGroup: perfectAI, controlGroup: poorControl, studyLabel: `S${i}` });
    }
    const reports = getRecentCausalReports(2);
    expect(reports.length).toBeLessThanOrEqual(2);
  });
});
