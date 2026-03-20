import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock("../../server/monitoring/metricsStore", () => ({
  getMetrics: vi.fn().mockReturnValue({
    totalRequests: 100,
    totalErrors: 3,
    errorRate: 0.03,
    avgLatency: 340,
    p95Latency: 890,
    windowSize: 100,
  }),
  resetMetrics: vi.fn(),
}));

vi.mock("../../server/monitoring/systemMonitor", () => ({
  getSystemHealth: vi.fn().mockResolvedValue({ db: "pass", ai: "pass" }),
  getRecentEngineLogs: vi.fn().mockReturnValue([]),
  logEngineStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/monitoring/predictiveEngine", () => ({
  predictFailures: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../server/system/autonomousLoop", () => ({
  getLoopStats: vi.fn().mockReturnValue({ cycles: 5, lastRun: Date.now() }),
}));

vi.mock("../../server/controlTower/systemOptimizer", () => ({
  analyzeSystemHealth: vi.fn().mockReturnValue({ score: 82, recommendations: [] }),
}));

vi.mock("../../server/utils/circuitBreaker", () => ({
  getAllBreakerStates: vi.fn().mockReturnValue({}),
  openAIBreaker: { getState: vi.fn().mockReturnValue("CLOSED") },
  dbBreaker: { getState: vi.fn().mockReturnValue("CLOSED") },
  twilioBreaker: { getState: vi.fn().mockReturnValue("CLOSED") },
  scoringBreaker: { getState: vi.fn().mockReturnValue("CLOSED") },
}));

vi.mock("../../server/engines/unifiedOutcomeLearning", () => ({
  getModelVersions: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../server/monitoring/dataDrift", () => ({
  detectDrift: vi.fn().mockResolvedValue({ drifted: false, deltas: {} }),
  getBaselineSnapshot: vi.fn().mockReturnValue(null),
  getDriftSampleCount: vi.fn().mockReturnValue(0),
  resetBaseline: vi.fn(),
}));

vi.mock("../../server/snapshots/systemSnapshot", () => ({
  getRecentSnapshots: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../server/middleware/requireRole", () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../server/engines/highScaleSimulationEngine", () => ({
  runHighScaleSimulations: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../server/middleware/auditMiddleware", () => ({
  getAuditLog: vi.fn().mockReturnValue([]),
}));

import express from "express";
import systemMonitoringRoutes from "../../server/routes/systemMonitoringRoutes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/monitoring", systemMonitoringRoutes);
  return app;
}

describe("Monitoring API — contract shape", () => {
  it("GET /api/monitoring/metrics returns {totalRequests, errorRate, p95Latency}", async () => {
    const supertest = await import("supertest");
    const res = await supertest.default(buildApp()).get("/api/monitoring/metrics");
    expect(res.status).toBeLessThan(500);
    expect(res.body).toHaveProperty("totalRequests");
    expect(res.body).toHaveProperty("errorRate");
    expect(res.body).toHaveProperty("p95Latency");
  });

  it("GET /api/monitoring/slo returns {ok, sloStatus, sloBreached}", async () => {
    const supertest = await import("supertest");
    const res = await supertest.default(buildApp()).get("/api/monitoring/slo");
    expect(res.status).toBeLessThan(500);
    expect(res.body).toHaveProperty("ok");
    expect(res.body).toHaveProperty("sloStatus");
    expect(res.body).toHaveProperty("sloBreached");
  });

  it("GET /api/monitoring/optimizer returns {ok, score}", async () => {
    const supertest = await import("supertest");
    const res = await supertest.default(buildApp()).get("/api/monitoring/optimizer");
    expect(res.status).toBeLessThan(500);
    expect(res.body).toHaveProperty("ok");
    expect(res.body).toHaveProperty("score");
  });
});
