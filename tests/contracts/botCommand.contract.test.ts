import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/patient/sessionStorePg", () => ({
  getSessions: vi.fn().mockResolvedValue([
    { id: "sess-001", status: "pending", riskLevel: "HIGH", safetyFlags: ["fever", "infant"] },
    { id: "sess-002", status: "pending", riskLevel: "LOW", safetyFlags: [] },
  ]),
  getSessionById: vi.fn().mockResolvedValue({ id: "sess-001", status: "pending" }),
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/monitoring/metricsStore", () => ({
  getMetrics: vi.fn().mockReturnValue({ totalRequests: 100, totalErrors: 2, errorRate: 0.02, avgLatency: 300, p95Latency: 800, windowSize: 100 }),
}));

vi.mock("../../server/monitoring/slo", () => ({
  checkSLO: vi.fn().mockReturnValue({ sloBreached: false, sloStatus: "OK", alerts: [], latencyP95Ms: 800, errorRate: 0.02, checkedAt: "" }),
}));

vi.mock("../../server/utils/circuitBreaker", () => ({
  getAllBreakerStates: vi.fn().mockReturnValue({ openai: "CLOSED", database: "CLOSED", twilio: "CLOSED", scoring: "CLOSED" }),
}));

vi.mock("../../server/controlTower/eventBus", () => ({
  getRecentEvents: vi.fn().mockReturnValue([
    { type: "ALERT", payload: { source: "sloMonitor", alerts: ["Latency SLO breached"] }, timestamp: Date.now() },
  ]),
}));

vi.mock("../../server/system/autonomousLoop", () => ({
  getLoopStats: vi.fn().mockReturnValue({ cycles: 5, lastRun: Date.now() }),
}));

vi.mock("../../server/engines/unifiedOutcomeLearning", () => ({
  runLearningCycle: vi.fn().mockResolvedValue({ processed: 3, updated: ["viral_uri", "sinusitis"] }),
}));

vi.mock("../../server/orchestrator/clinicalOrchestrator", () => ({
  runFullClinicalFlow: vi.fn().mockResolvedValue({
    success: true, traceId: "trace-sim-001", complaint: "cough",
    disposition: "home_care", confidence: 0.78, latencyMs: 140, timestamp: new Date().toISOString(),
  }),
}));

vi.mock("../../server/monitoring/systemMonitor", () => ({
  getSystemHealth: vi.fn().mockResolvedValue({
    db: { healthy: 10, error: 0, warning: 0, avgLatencyMs: 12 },
    ai: { healthy: 8, error: 1, warning: 0, avgLatencyMs: 400 },
  }),
}));

import { handleBotCommand, handleSMSCommand, isChatAllowed } from "../../server/chat/botCommandHandler";

const ALLOWED_ID = "987654321";

beforeEach(() => {
  vi.stubEnv("ALLOWED_TELEGRAM_CHAT_IDS", ALLOWED_ID);
});

describe("botCommandHandler — access control", () => {
  it("denies admin commands to unlisted chat IDs", async () => {
    const result = await handleBotCommand("/queue", "000000");
    expect(result.handled).toBe(true);
    expect(result.text).toContain("Access denied");
  });

  it("allows admin commands to whitelisted chat IDs", async () => {
    const result = await handleBotCommand("/queue", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).not.toContain("Access denied");
  });

  it("isChatAllowed returns true for whitelisted ID", () => {
    expect(isChatAllowed(ALLOWED_ID)).toBe(true);
  });

  it("isChatAllowed returns false for unknown ID", () => {
    expect(isChatAllowed("111")).toBe(false);
  });
});

describe("botCommandHandler — command responses", () => {
  it("/queue returns patient list", async () => {
    const result = await handleBotCommand("/queue", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("sess-001");
  });

  it("/approve {id} updates session and confirms", async () => {
    const result = await handleBotCommand("/approve sess-001", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("Approved");
    expect(result.text).toContain("sess-001");
  });

  it("/override {id} updates session with override status", async () => {
    const result = await handleBotCommand("/override sess-001 physician reviewed", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("Override Applied");
    expect(result.text).toContain("sess-001");
  });

  it("/health returns SLO status", async () => {
    const result = await handleBotCommand("/health", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("SLO");
  });

  it("/alerts returns alert events", async () => {
    const result = await handleBotCommand("/alerts", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("sloMonitor");
  });

  it("/simulate {complaint} runs clinical flow", async () => {
    const result = await handleBotCommand("/simulate cough 3d", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("cough");
    expect(result.text).toContain("home_care");
  });

  it("/learn triggers learning cycle", async () => {
    const result = await handleBotCommand("/learn", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("Learning Cycle Complete");
  });

  it("/circuits shows breaker states", async () => {
    const result = await handleBotCommand("/circuits", ALLOWED_ID);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("openai");
    expect(result.text).toContain("CLOSED");
  });

  it("non-command text returns handled=false", async () => {
    const result = await handleBotCommand("I have a cough", ALLOWED_ID);
    expect(result.handled).toBe(false);
  });

  it("unknown slash command returns handled=false", async () => {
    const result = await handleBotCommand("/unknowncmd", ALLOWED_ID);
    expect(result.handled).toBe(false);
  });
});

describe("handleSMSCommand — WhatsApp command responses", () => {
  it("/queue returns short patient summary", async () => {
    const result = await handleSMSCommand("/queue");
    expect(result).not.toBeNull();
    expect(result).toContain("sess-001");
  });

  it("/health returns SLO and metrics", async () => {
    const result = await handleSMSCommand("/health");
    expect(result).not.toBeNull();
    expect(result).toContain("SLO");
  });

  it("/alerts returns recent alert events", async () => {
    const result = await handleSMSCommand("/alerts");
    expect(result).not.toBeNull();
    expect(result).toContain("sloMonitor");
  });

  it("/circuits returns circuit breaker states", async () => {
    const result = await handleSMSCommand("/circuits");
    expect(result).not.toBeNull();
    expect(result).toContain("openai");
  });

  it("non-command returns null (falls through to patient triage)", async () => {
    const result = await handleSMSCommand("I have a sore throat");
    expect(result).toBeNull();
  });
});
