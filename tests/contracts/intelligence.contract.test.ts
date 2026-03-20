import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEmitEvent } = vi.hoisted(() => ({ mockEmitEvent: vi.fn() }));
vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: mockEmitEvent,
  getRecentEvents: vi.fn().mockReturnValue([
    { type: "ERROR", payload: { source: "openai", error: "timeout" }, timestamp: Date.now() - 1000 },
    { type: "ERROR", payload: { source: "openai", error: "rate limit" }, timestamp: Date.now() - 2000 },
    { type: "ERROR", payload: { source: "database", error: "connection refused" }, timestamp: Date.now() - 500 },
    { type: "RPA_FAILURE", payload: { source: "rpa", reason: "selector not found" }, timestamp: Date.now() },
    { type: "ALERT", payload: { source: "sloMonitor" }, timestamp: Date.now() },
  ]),
}));

vi.mock("../../server/utils/circuitBreaker", () => ({
  getAllBreakerStates: vi.fn().mockReturnValue({ openai: "OPEN", database: "CLOSED", twilio: "CLOSED", scoring: "CLOSED" }),
}));

vi.mock("../../server/queue/patientQueue", () => ({
  getQueueStats: vi.fn().mockReturnValue({ pending: 50, processing: 2, completed: 100 }),
}));

vi.mock("../../server/monitoring/metricsStore", () => ({
  getMetrics: vi.fn().mockReturnValue({ totalRequests: 100, totalErrors: 10, errorRate: 0.1, p95Latency: 800, avgLatency: 400, windowSize: 100 }),
}));

import { parseOperatorIntent } from "../../server/chat/intentRouter";
import { analyzeFailure } from "../../server/monitoring/rootCauseEngine";
import { runSelfHealing, resetHealTimes } from "../../server/autonomy/selfHealing";

describe("Operator Intent Classifier", () => {
  it("recognizes 'show patients' as queue action", () => {
    const r = parseOperatorIntent("show patients");
    expect(r.action).toBe("queue");
    expect(r.confidence).toBe("high");
  });

  it("recognizes 'who is waiting' as queue action", () => {
    expect(parseOperatorIntent("who is waiting").action).toBe("queue");
  });

  it("recognizes 'system health' as health action", () => {
    const r = parseOperatorIntent("check system health");
    expect(r.action).toBe("health");
  });

  it("recognizes 'how is the system' as health action", () => {
    expect(parseOperatorIntent("how is the system doing").action).toBe("health");
  });

  it("recognizes 'alerts' keyword as alerts action", () => {
    expect(parseOperatorIntent("show me alerts").action).toBe("alerts");
  });

  it("recognizes 'what's wrong' as alerts action", () => {
    expect(parseOperatorIntent("whats wrong with the system").action).toBe("alerts");
  });

  it("extracts session ID from 'approve sess-001'", () => {
    const r = parseOperatorIntent("approve sess-001");
    expect(r.action).toBe("approve");
    expect(r.target).toBe("sess-001");
    expect(r.confidence).toBe("high");
  });

  it("extracts session ID and note from 'override sess-002 reviewed by dr'", () => {
    const r = parseOperatorIntent("override sess-002 reviewed by dr");
    expect(r.action).toBe("override");
    expect(r.target).toBe("sess-002");
  });

  it("recognizes 'run learning cycle' as learn action", () => {
    expect(parseOperatorIntent("run learning cycle").action).toBe("learn");
  });

  it("recognizes 'circuit breaker' phrase as circuits action", () => {
    expect(parseOperatorIntent("check circuit breaker status").action).toBe("circuits");
  });

  it("recognizes 'simulate cough' as simulate action with complaint", () => {
    const r = parseOperatorIntent("simulate cough 3 days");
    expect(r.action).toBe("simulate");
  });

  it("returns unknown for unrecognized input", () => {
    const r = parseOperatorIntent("hello there");
    expect(r.action).toBe("unknown");
  });
});

describe("Root Cause Engine", () => {
  it("returns a report with required fields", () => {
    const report = analyzeFailure();
    expect(report).toHaveProperty("totalErrors");
    expect(report).toHaveProperty("topSources");
    expect(report).toHaveProperty("topFailureSource");
    expect(report).toHaveProperty("topFailurePercent");
    expect(report).toHaveProperty("generatedAt");
  });

  it("correctly identifies openai as top failure source", () => {
    const report = analyzeFailure();
    expect(report.topFailureSource).toBe("openai");
    expect(report.topFailurePercent).toBeGreaterThan(0);
  });

  it("counts total errors accurately (excludes ALERT events)", () => {
    const report = analyzeFailure();
    expect(report.totalErrors).toBe(4);
  });

  it("returns percentage that sums to ~100", () => {
    const report = analyzeFailure();
    const total = report.topSources.reduce((sum, s) => sum + s.percentage, 0);
    expect(total).toBeGreaterThanOrEqual(95);
  });

  it("emits ALERT event when top source exceeds 30%", () => {
    mockEmitEvent.mockClear();
    analyzeFailure();
    expect(mockEmitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ALERT", payload: expect.objectContaining({ source: "rootCauseEngine" }) })
    );
  });
});

describe("Self-Healing Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHealTimes();
  });

  it("returns array of actions", async () => {
    const actions = await runSelfHealing();
    expect(Array.isArray(actions)).toBe(true);
  });

  it("detects OPEN OpenAI circuit breaker and triggers action", async () => {
    const actions = await runSelfHealing();
    const openaiAction = actions.find((a) => a.issue.includes("OpenAI"));
    expect(openaiAction).toBeDefined();
    expect(openaiAction?.severity).toBe("HIGH");
    expect(openaiAction?.action).toContain("fallback");
  });

  it("action shapes have required fields", async () => {
    const actions = await runSelfHealing();
    for (const a of actions) {
      expect(a).toHaveProperty("issue");
      expect(a).toHaveProperty("action");
      expect(a).toHaveProperty("severity");
      expect(a).toHaveProperty("triggeredAt");
    }
  });

  it("emits SELF_HEAL events for each action", async () => {
    mockEmitEvent.mockClear();
    await runSelfHealing();
    const selfHealCalls = mockEmitEvent.mock.calls.filter(
      ([e]: [any]) => e.type === "SELF_HEAL"
    );
    expect(selfHealCalls.length).toBeGreaterThan(0);
  });
});
