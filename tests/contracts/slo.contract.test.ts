import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
}));

import { checkSLO, SLO } from "../../server/monitoring/slo";
import { emitEvent } from "../../server/controlTower/eventBus";

describe("SLO module — contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns OK when all metrics within thresholds", () => {
    const result = checkSLO({ p95Latency: 800, errorRate: 0.02, totalRequests: 100 });
    expect(result.sloStatus).toBe("OK");
    expect(result.sloBreached).toBe(false);
    expect(result.alerts).toHaveLength(0);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("detects latency SLO breach and emits ALERT event", () => {
    const result = checkSLO({ p95Latency: 2000, errorRate: 0.01, totalRequests: 50 });
    expect(result.sloBreached).toBe(true);
    expect(result.sloStatus).toBe("BREACHED");
    expect(result.alerts.some((a) => a.includes("Latency SLO"))).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ALERT" })
    );
  });

  it("detects error rate SLO breach", () => {
    const result = checkSLO({ p95Latency: 500, errorRate: 0.12, totalRequests: 100 });
    expect(result.sloBreached).toBe(true);
    expect(result.alerts.some((a) => a.includes("Error rate SLO"))).toBe(true);
  });

  it("skips evaluation below minimum request count", () => {
    const result = checkSLO({ p95Latency: 9999, errorRate: 0.99, totalRequests: 5 });
    expect(result.sloBreached).toBe(false);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("result contains required contract fields", () => {
    const result = checkSLO({ p95Latency: 800, errorRate: 0.02, totalRequests: 100 });
    expect(result).toHaveProperty("latencyP95Ms");
    expect(result).toHaveProperty("errorRate");
    expect(result).toHaveProperty("sloBreached");
    expect(result).toHaveProperty("alerts");
    expect(result).toHaveProperty("sloStatus");
    expect(result).toHaveProperty("checkedAt");
  });

  it("degradation matrix maps circuit-open error correctly", async () => {
    const { degrade } = await import("../../server/fallback/degradationMatrix");
    const result = degrade(new Error("Circuit open: openai"));
    expect(result.reason).toBe("circuit_open");
    expect(result.safe).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.success).toBe(false);
  });

  it("degradation matrix maps database error correctly", async () => {
    const { degrade } = await import("../../server/fallback/degradationMatrix");
    const result = degrade(new Error("database connection refused"));
    expect(result.reason).toBe("database_unavailable");
  });

  it("degradation matrix maps timeout correctly", async () => {
    const { degrade } = await import("../../server/fallback/degradationMatrix");
    const result = degrade(new Error("Request timeout exceeded deadline"));
    expect(result.reason).toBe("timeout");
  });
});
