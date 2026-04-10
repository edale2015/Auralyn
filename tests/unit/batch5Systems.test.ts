import { describe, it, expect, beforeEach } from "vitest";

// ── Epic Full Flow ────────────────────────────────────────────────────────────
import { epicFullFlow } from "../../server/integrations/epicFullFlow";

describe("epicFullFlow — no FHIR_BASE configured", () => {
  it("returns local triage result when env vars absent", async () => {
    const r = await epicFullFlow("P001", "");
    expect(r.patientId).toBe("P001");
    expect(typeof r.disposition).toBe("string");
    expect(r.observationPosted).toBe(false);
    expect(r.error).toContain("not configured");
  });

  it("returns numeric confidence between 0 and 1", async () => {
    const r = await epicFullFlow("P002", "");
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it("returns a topDiagnosis string", async () => {
    const r = await epicFullFlow("P003", "");
    expect(typeof r.topDiagnosis).toBe("string");
  });
});

// ── Pilot Stats ───────────────────────────────────────────────────────────────
import {
  liveStats, updateStats, resetStats, aggregateStats,
} from "../../server/simulation/pilotStats";

describe("pilotStats — updateStats() / aggregateStats()", () => {
  beforeEach(() => resetStats());

  it("aggregateStats() returns zero-state after reset", () => {
    const s = aggregateStats();
    expect(s.patients).toBe(0);
    expect(s.er).toBe(0);
    expect(s.erRate).toBe(0);
  });

  it("updateStats() increments patient counter", () => {
    updateStats({ patientId: "A", disposition: "ROUTINE", latencyMs: 50 });
    expect(aggregateStats().patients).toBe(1);
  });

  it("updateStats() counts ER_NOW dispositions", () => {
    updateStats({ patientId: "B", disposition: "ER_NOW", latencyMs: 10 });
    updateStats({ patientId: "C", disposition: "ROUTINE", latencyMs: 20 });
    const s = aggregateStats();
    expect(s.er).toBe(1);
    expect(s.erRate).toBeCloseTo(0.5, 4);
  });

  it("avgLatencyMs is mean of recorded latencies", () => {
    [10, 20, 30].forEach(ms =>
      updateStats({ patientId: "X", disposition: "ROUTINE", latencyMs: ms })
    );
    expect(aggregateStats().avgLatencyMs).toBe(20);
  });

  it("p50 <= p95 <= p99 ordering", () => {
    for (let i = 1; i <= 100; i++)
      updateStats({ patientId: `P${i}`, disposition: "ROUTINE", latencyMs: i });
    const s = aggregateStats();
    expect(s.p50Ms).toBeLessThanOrEqual(s.p95Ms);
    expect(s.p95Ms).toBeLessThanOrEqual(s.p99Ms);
  });

  it("minLatencyMs and maxLatencyMs are correct", () => {
    [5, 50, 200].forEach(ms =>
      updateStats({ patientId: "Q", disposition: "ROUTINE", latencyMs: ms })
    );
    const s = aggregateStats();
    expect(s.minLatencyMs).toBe(5);
    expect(s.maxLatencyMs).toBe(200);
  });

  it("resetStats() clears all counters", () => {
    updateStats({ patientId: "R", disposition: "ER_NOW", latencyMs: 99 });
    resetStats();
    const s = aggregateStats();
    expect(s.patients).toBe(0);
    expect(s.er).toBe(0);
    expect(s.latency?.length ?? liveStats.latency.length).toBe(0);
  });
});

// ── AWS Autoscale ─────────────────────────────────────────────────────────────
import {
  computeScale, chooseRegion, lambdaFallback,
  computeScaleStep, getScaleRecommendation,
} from "../../server/infra/awsAutoscale";

describe("awsAutoscale — computeScale()", () => {
  it("returns 2 for low queue depth (<=50)", () => {
    expect(computeScale(0)).toBe(2);
    expect(computeScale(50)).toBe(2);
  });

  it("returns 5 for medium queue depth (51-100)", () => {
    expect(computeScale(51)).toBe(5);
    expect(computeScale(100)).toBe(5);
  });

  it("returns 10 for high queue depth (>100)", () => {
    expect(computeScale(101)).toBe(10);
    expect(computeScale(500)).toBe(10);
  });
});

describe("awsAutoscale — chooseRegion()", () => {
  it("picks region with lowest latency", () => {
    expect(chooseRegion({ a: 100, b: 20, c: 50 })).toBe("b");
  });

  it("returns default region for empty map", () => {
    expect(chooseRegion({})).toBe("us-east-1");
  });
});

describe("awsAutoscale — lambdaFallback()", () => {
  it("returns null when LAMBDA_URL is not set", async () => {
    expect(await lambdaFallback({ test: true })).toBeNull();
  });
});

describe("awsAutoscale — computeScaleStep()", () => {
  it("returns scale_up when target > current", () => {
    const r = computeScaleStep(2, 5);
    expect(r.action).toBe("scale_up");
    expect(r.delta).toBe(3);
  });

  it("returns scale_down when target < current", () => {
    const r = computeScaleStep(10, 2);
    expect(r.action).toBe("scale_down");
    expect(r.delta).toBe(8);
  });

  it("returns no_change when equal", () => {
    const r = computeScaleStep(5, 5);
    expect(r.action).toBe("no_change");
    expect(r.delta).toBe(0);
  });
});

describe("awsAutoscale — getScaleRecommendation()", () => {
  it("returns full recommendation object", () => {
    const r = getScaleRecommendation(120, 2);
    expect(r.recommendedInstances).toBe(10);
    expect(r.action).toBe("scale_up");
    expect(r.delta).toBe(8);
  });
});

// ── Enterprise Package ────────────────────────────────────────────────────────
import { buildEnterprisePackage } from "../../server/reporting/enterprisePackage";

describe("enterprisePackage — buildEnterprisePackage()", () => {
  it("contains required top-level fields", () => {
    const p = buildEnterprisePackage({ totalPatients: 500 });
    expect(p.system).toContain("Auralyn");
    expect(p.safety.hardGate).toBe(true);
    expect(p.safety.hipaaCompliant).toBe(true);
    expect(p.deployment.length).toBeGreaterThan(0);
    expect(p.capabilities.length).toBeGreaterThan(0);
    expect(typeof p.generatedAt).toBe("string");
    expect(() => new Date(p.generatedAt)).not.toThrow();
  });

  it("preserves provided metrics", () => {
    const p = buildEnterprisePackage({ totalPatients: 1234, erRate: 0.15 });
    expect(p.metrics.totalPatients).toBe(1234);
    expect(p.metrics.erRate).toBe(0.15);
  });

  it("deployment includes AWS multi-region", () => {
    const p = buildEnterprisePackage({});
    expect(p.deployment.some(d => d.toLowerCase().includes("aws"))).toBe(true);
  });
});

// ── Intelligence Utils ────────────────────────────────────────────────────────
import {
  tuneThresholds, interruptForCritical, clinicPerformanceMetrics,
  broadcastRegionAlert,
} from "../../server/utils/intelligenceUtils";

describe("intelligenceUtils — tuneThresholds()", () => {
  it("returns 0.8 for empty history", () => {
    expect(tuneThresholds([])).toBe(0.8);
  });

  it("returns 0.8 for < 20% ER rate", () => {
    const h = Array(10).fill({ outcome: "ROUTINE" }).concat([{ outcome: "ER" }]);
    expect(tuneThresholds(h)).toBe(0.8);
  });

  it("returns 0.7 for ~21-30% ER rate", () => {
    const h = Array(7).fill({ outcome: "ROUTINE" }).concat(
      Array(3).fill({ outcome: "ER" })
    );
    expect(tuneThresholds(h)).toBe(0.7);
  });

  it("returns 0.6 for > 30% ER rate", () => {
    const h = Array(6).fill({ outcome: "ROUTINE" }).concat(
      Array(4).fill({ outcome: "ER" })
    );
    expect(tuneThresholds(h)).toBe(0.6);
  });
});

describe("intelligenceUtils — interruptForCritical()", () => {
  it("sorts by descending risk score", () => {
    const q = [
      { patientId: "A", riskScore: 0.3 },
      { patientId: "B", riskScore: 0.9 },
      { patientId: "C", riskScore: 0.6 },
    ];
    const sorted = interruptForCritical(q);
    expect(sorted[0].patientId).toBe("B");
    expect(sorted[1].patientId).toBe("C");
    expect(sorted[2].patientId).toBe("A");
  });

  it("does not mutate the original array", () => {
    const q = [{ patientId: "X", riskScore: 0.1 }, { patientId: "Y", riskScore: 0.9 }];
    const orig = [...q];
    interruptForCritical(q);
    expect(q[0].patientId).toBe(orig[0].patientId);
  });

  it("handles empty queue", () => {
    expect(interruptForCritical([])).toEqual([]);
  });
});

describe("intelligenceUtils — clinicPerformanceMetrics()", () => {
  it("returns zeros for empty visits", () => {
    const r = clinicPerformanceMetrics([]);
    expect(r.avgTime).toBe(0);
    expect(r.erRate).toBe(0);
    expect(r.totalVisits).toBe(0);
  });

  it("computes avgTime correctly", () => {
    const r = clinicPerformanceMetrics([
      { time: 10, er: false },
      { time: 20, er: false },
      { time: 30, er: true },
    ]);
    expect(r.avgTime).toBe(20);
    expect(r.totalVisits).toBe(3);
  });

  it("computes erRate correctly", () => {
    const r = clinicPerformanceMetrics([
      { time: 5, er: true },
      { time: 5, er: false },
      { time: 5, er: false },
      { time: 5, er: false },
    ]);
    expect(r.erRate).toBeCloseTo(0.25, 4);
  });
});

describe("intelligenceUtils — broadcastRegionAlert()", () => {
  it("does not throw when env vars not set", () => {
    expect(() =>
      broadcastRegionAlert({ type: "SURGE" }, ["us-east", "eu-west"])
    ).not.toThrow();
  });

  it("does not throw for empty regions array", () => {
    expect(() => broadcastRegionAlert({ type: "TEST" }, [])).not.toThrow();
  });
});
