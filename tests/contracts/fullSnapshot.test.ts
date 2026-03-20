import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/utils/circuitBreaker", () => ({
  getAllBreakerStates: vi.fn(() => ({ openai: "CLOSED", database: "CLOSED" })),
  scoringBreaker: { call: async (fn: any) => fn() },
}));
vi.mock("../../server/monitoring/metricsStore", () => ({
  getMetrics: vi.fn(() => ({ errorRate: 0.02, p95Latency: 450 })),
}));
vi.mock("../../server/queue/patientQueue", () => ({
  getQueueStats: vi.fn(() => ({ queueDepth: 12 })),
}));
vi.mock("../../server/redis/redisClient", () => ({
  isUsingFallback: vi.fn(() => false),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  acquireGlobalLock: vi.fn(),
}));
vi.mock("../../server/autonomy/autonomyEngine", () => ({
  getAutoThreshold: vi.fn(() => 0.9),
  autonomyDecision: vi.fn(),
  setLoadAwareThreshold: vi.fn(),
}));
vi.mock("../../server/snapshots/systemSnapshot", () => ({
  saveSnapshot: vi.fn(() => Promise.resolve()),
  getRecentSnapshots: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
  subscribeToTower: vi.fn(),
}));
vi.mock("../../server/chaos/chaosEngine", () => ({
  isChaosActive: vi.fn(() => false),
  maybeDelay: vi.fn(),
}));

import { captureSystemState, saveFullSnapshot } from "../../server/snapshots/fullSnapshot";
import { getMetrics } from "../../server/monitoring/metricsStore";
import { getAutoThreshold } from "../../server/autonomy/autonomyEngine";
import { isUsingFallback } from "../../server/redis/redisClient";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.02, p95Latency: 450 } as any);
  vi.mocked(getAutoThreshold).mockReturnValue(0.9);
  vi.mocked(isUsingFallback).mockReturnValue(false);
});

describe("Full Snapshot — captureSystemState", () => {
  it("returns all required fields", async () => {
    const state = await captureSystemState();
    expect(state).toHaveProperty("autonomyThreshold");
    expect(state).toHaveProperty("circuitBreakers");
    expect(state).toHaveProperty("errorRate");
    expect(state).toHaveProperty("p95Latency");
    expect(state).toHaveProperty("queueDepth");
    expect(state).toHaveProperty("redisFallback");
    expect(state).toHaveProperty("capturedAt");
    expect(state).toHaveProperty("sloState");
    expect(state).toHaveProperty("autonomyConfig");
  });

  it("captures autonomy threshold from engine", async () => {
    vi.mocked(getAutoThreshold).mockReturnValue(0.97);
    const state = await captureSystemState();
    expect(state.autonomyThreshold).toBe(0.97);
  });

  it("reflects redisFallback true when Redis down", async () => {
    vi.mocked(isUsingFallback).mockReturnValue(true);
    const state = await captureSystemState();
    expect(state.redisFallback).toBe(true);
  });

  it("SLO errorRateOk is true when errorRate < 5%", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.02, p95Latency: 300 } as any);
    const state = await captureSystemState();
    expect(state.sloState?.errorRateOk).toBe(true);
  });

  it("SLO errorRateOk is false when errorRate >= 5%", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.08, p95Latency: 300 } as any);
    const state = await captureSystemState();
    expect(state.sloState?.errorRateOk).toBe(false);
  });

  it("SLO latencyOk is true when p95Latency < 3000ms", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.01, p95Latency: 1200 } as any);
    const state = await captureSystemState();
    expect(state.sloState?.latencyOk).toBe(true);
  });

  it("SLO latencyOk is false when p95Latency >= 3000ms", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.01, p95Latency: 4500 } as any);
    const state = await captureSystemState();
    expect(state.sloState?.latencyOk).toBe(false);
  });

  it("autonomyConfig mode is critical_load at threshold 0.97", async () => {
    vi.mocked(getAutoThreshold).mockReturnValue(0.97);
    const state = await captureSystemState();
    expect(state.autonomyConfig?.mode).toBe("critical_load");
  });

  it("autonomyConfig mode is high_load at threshold 0.95", async () => {
    vi.mocked(getAutoThreshold).mockReturnValue(0.95);
    const state = await captureSystemState();
    expect(state.autonomyConfig?.mode).toBe("high_load");
  });

  it("autonomyConfig mode is nominal at threshold 0.9", async () => {
    vi.mocked(getAutoThreshold).mockReturnValue(0.9);
    const state = await captureSystemState();
    expect(state.autonomyConfig?.mode).toBe("nominal");
  });

  it("capturedAt is a valid ISO timestamp", async () => {
    const state = await captureSystemState();
    expect(new Date(state.capturedAt).getTime()).toBeGreaterThan(0);
  });

  it("passes weights through to state", async () => {
    const weights = { "ent-flu": 0.92, pediatric: 0.88 };
    const state = await captureSystemState(weights);
    expect(state.weights).toEqual(weights);
  });
});

describe("Full Snapshot — saveFullSnapshot", () => {
  it("returns system state on success", async () => {
    const state = await saveFullSnapshot({
      traceId: "trace-abc",
      patientId: "p-001",
      complaint: "cough",
      input: { complaint: "cough" },
    });
    expect(state).not.toBeNull();
    expect(state?.autonomyThreshold).toBeDefined();
  });

  it("returns null when saveSnapshot throws", async () => {
    const { saveSnapshot } = await import("../../server/snapshots/systemSnapshot");
    vi.mocked(saveSnapshot).mockRejectedValueOnce(new Error("DB_FAIL"));
    const state = await saveFullSnapshot({
      traceId: "trace-fail",
      input: {},
    });
    expect(state).toBeNull();
  });

  it("passes safetyLevel and confidence to snapshot", async () => {
    const { saveSnapshot } = await import("../../server/snapshots/systemSnapshot");
    await saveFullSnapshot({
      traceId: "trace-xyz",
      input: {},
      safetyLevel: "HIGH",
      confidence: 0.92,
    });
    expect(vi.mocked(saveSnapshot)).toHaveBeenCalledWith(
      expect.objectContaining({ safety: { level: "HIGH" }, confidence: 0.92 }),
      expect.anything()
    );
  });
});
