import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { disableChaos } from "../../server/chaos/chaosEngine";

vi.mock("../../server/utils/circuitBreaker", () => ({
  getAllBreakerStates: vi.fn(() => ({})),
  scoringBreaker: { call: async (fn: any) => fn() },
}));
vi.mock("../../server/monitoring/metricsStore", () => ({
  getMetrics: vi.fn(() => ({ errorRate: 0, p95Latency: 0 })),
}));
vi.mock("../../server/queue/patientQueue", () => ({
  getQueueStats: vi.fn(() => ({ queueDepth: 0, pending: 0 })),
}));
vi.mock("../../server/redis/redisClient", () => ({
  isUsingFallback: vi.fn(() => false),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  acquireGlobalLock: vi.fn(),
}));
vi.mock("../../server/db/dbRouter", () => ({
  dbHealthCheck: vi.fn(() => ({ ok: true, latencyMs: 50, replica: false })),
  getDb: vi.fn(),
}));
vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
  subscribeToTower: vi.fn(),
}));

import { runRecovery } from "../../server/recovery/recoveryEngine";
import { getAllBreakerStates } from "../../server/utils/circuitBreaker";
import { getMetrics } from "../../server/monitoring/metricsStore";
import { getQueueStats } from "../../server/queue/patientQueue";
import { isUsingFallback } from "../../server/redis/redisClient";
import { dbHealthCheck } from "../../server/db/dbRouter";

beforeEach(() => {
  disableChaos();
  vi.mocked(getAllBreakerStates).mockReturnValue({});
  vi.mocked(getMetrics).mockReturnValue({ errorRate: 0, p95Latency: 0 } as any);
  vi.mocked(getQueueStats).mockReturnValue({ queueDepth: 0, pending: 0 } as any);
  vi.mocked(isUsingFallback).mockReturnValue(false);
  vi.mocked(dbHealthCheck).mockResolvedValue({ ok: true, latencyMs: 50, replica: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Recovery Engine — healthy system", () => {
  it("returns no actions when all systems nominal", async () => {
    const actions = await runRecovery();
    expect(actions).toHaveLength(0);
  });
});

describe("Recovery Engine — OpenAI circuit breaker", () => {
  it("triggers fallback model action when openai breaker is OPEN", async () => {
    vi.mocked(getAllBreakerStates).mockReturnValue({ openai: "OPEN" } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "openai");
    expect(match).toBeDefined();
    expect(match?.severity).toBe("HIGH");
    expect(match?.action).toMatch(/fallback model/i);
  });
});

describe("Recovery Engine — queue depth", () => {
  it("triggers backpressure at depth > 800", async () => {
    vi.mocked(getQueueStats).mockReturnValue({ queueDepth: 850 } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "queue" && a.severity === "HIGH");
    expect(match).toBeDefined();
    expect(match?.action).toMatch(/backpressure/i);
  });

  it("triggers medium autonomy adjustment at depth > 500", async () => {
    vi.mocked(getQueueStats).mockReturnValue({ queueDepth: 600 } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "queue" && a.severity === "MEDIUM");
    expect(match).toBeDefined();
    expect(match?.action).toMatch(/autonomy/i);
  });

  it("no queue action at depth 499", async () => {
    vi.mocked(getQueueStats).mockReturnValue({ queueDepth: 499 } as any);
    const actions = await runRecovery();
    expect(actions.find((a) => a.category === "queue")).toBeUndefined();
  });
});

describe("Recovery Engine — error rate", () => {
  it("triggers CRITICAL scale-up at error rate > 0.2", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.25, p95Latency: 0 } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "scaling" && a.severity === "CRITICAL");
    expect(match).toBeDefined();
    expect(match?.action).toMatch(/scale up pods/i);
  });

  it("triggers HIGH shed at error rate > 0.1", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.15, p95Latency: 0 } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "scaling" && a.severity === "HIGH");
    expect(match).toBeDefined();
  });
});

describe("Recovery Engine — Redis fallback", () => {
  it("triggers in-memory queue action when Redis using fallback", async () => {
    vi.mocked(isUsingFallback).mockReturnValue(true);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "redis");
    expect(match).toBeDefined();
    expect(match?.severity).toBe("MEDIUM");
    expect(match?.action).toMatch(/in-memory queue/i);
  });
});

describe("Recovery Engine — database failures", () => {
  it("triggers CRITICAL read-only mode when DB unreachable", async () => {
    vi.mocked(dbHealthCheck).mockResolvedValue({ ok: false, latencyMs: 9999, replica: false });
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "db" && a.severity === "CRITICAL");
    expect(match).toBeDefined();
    expect(match?.action).toMatch(/read-only/i);
  });

  it("triggers HIGH timeout guards on high DB latency", async () => {
    vi.mocked(dbHealthCheck).mockResolvedValue({ ok: true, latencyMs: 4000, replica: false });
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "db" && a.severity === "HIGH");
    expect(match).toBeDefined();
    expect(match?.action).toMatch(/timeout/i);
  });

  it("triggers CRITICAL when database circuit breaker OPEN", async () => {
    vi.mocked(getAllBreakerStates).mockReturnValue({ database: "OPEN" } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "db" && a.severity === "CRITICAL");
    expect(match).toBeDefined();
  });
});

describe("Recovery Engine — p95 latency spike", () => {
  it("triggers async audit mode at p95 > 4000ms", async () => {
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0, p95Latency: 5000 } as any);
    const actions = await runRecovery();
    const match = actions.find((a) => a.category === "scaling" && a.action.match(/async audit/i));
    expect(match).toBeDefined();
  });
});

describe("Recovery Engine — full chaos (all failures)", () => {
  it("returns actions for all failure categories simultaneously", async () => {
    vi.mocked(getAllBreakerStates).mockReturnValue({ openai: "OPEN", database: "OPEN" } as any);
    vi.mocked(getMetrics).mockReturnValue({ errorRate: 0.3, p95Latency: 6000 } as any);
    vi.mocked(getQueueStats).mockReturnValue({ queueDepth: 900 } as any);
    vi.mocked(isUsingFallback).mockReturnValue(true);
    vi.mocked(dbHealthCheck).mockResolvedValue({ ok: false, latencyMs: 9999, replica: false });
    const actions = await runRecovery();
    const categories = new Set(actions.map((a) => a.category));
    expect(categories.has("openai")).toBe(true);
    expect(categories.has("queue")).toBe(true);
    expect(categories.has("scaling")).toBe(true);
    expect(categories.has("redis")).toBe(true);
    expect(categories.has("db")).toBe(true);
    const hasCritical = actions.some((a) => a.severity === "CRITICAL");
    expect(hasCritical).toBe(true);
  });
});
