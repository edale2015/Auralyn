import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })),
        orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}));

vi.mock("../../server/engines/scoringSystemsEngine", () => ({
  computeScoringSystems: vi.fn().mockResolvedValue({
    primaryDiagnosis: "viral_uri",
    confidence: 0.75,
    uncertainty: 0.15,
    disposition: "self-care",
    differentials: [{ diagnosis: "bacterial_pharyngitis", probability: 0.2 }],
  }),
}));

vi.mock("../../server/billing/codingEngine", () => ({
  mapToBilling: vi.fn().mockReturnValue({ coded: true, cpt: "99213" }),
}));

vi.mock("../../server/notifications/notifier", () => ({
  notifyOnCallPhysician: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/monitoring/systemMonitor", () => ({
  logEngineStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/audit/auditLogger", () => ({
  createTraceId: vi.fn(() => "test-trace-id"),
  auditStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
}));

vi.mock("../../server/agents/eventBus", () => ({
  publish: vi.fn(),
}));

vi.mock("../../server/agents/multiAgentCoordinator", () => ({
  multiAgentCoordinator: {
    assign: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  },
}));

describe("ClinicalOrchestrator — integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PILOT_MODE = "";
  });

  it("runs full clinical flow and returns a success result", async () => {
    const { runFullClinicalFlow } = await import("../../server/orchestrator/clinicalOrchestrator");

    const result = await runFullClinicalFlow({
      complaint: "sore throat and fever",
      answers: { ageYears: 30, fever: true, temperature: 38.2 },
      channel: "web",
    });

    expect(result.success).toBe(true);
    expect(result.complaint).toBe("sore throat and fever");
    expect(result.traceId).toBe("test-trace-id");
    expect(result.learningTriggered).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("blocks a high-risk infant with fever", async () => {
    const { runFullClinicalFlow } = await import("../../server/orchestrator/clinicalOrchestrator");

    const result = await runFullClinicalFlow({
      complaint: "fever",
      answers: { ageYears: 0.5, fever: true, temperature: 39.5 },
      channel: "web",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("SAFETY BLOCK");
  });

  it("returns PILOT_MODE result when PILOT_MODE=true", async () => {
    process.env.PILOT_MODE = "true";
    const { runFullClinicalFlow } = await import("../../server/orchestrator/clinicalOrchestrator");

    const result: any = await runFullClinicalFlow({
      complaint: "headache",
      answers: { ageYears: 25 },
    });

    expect((result as any).pilotMode).toBe(true);
    expect(result.success).toBe(true);
    process.env.PILOT_MODE = "";
  });

  it("applies second opinion gate — routes to REVIEW on disagreement", async () => {
    const { applySecondOpinionGate } = await import("../../server/autonomy/secondOpinion");

    const autoDecision = { mode: "AUTO" as const, reason: "confidence 92%" };
    const scores = {
      primaryDiagnosis: "viral_uri",
      confidence: 0.92,
      differentials: [
        { diagnosis: "bacterial_pharyngitis", probability: 0.95 },
        { diagnosis: "viral_uri", probability: 0.4 },
      ],
    };

    const final = applySecondOpinionGate(autoDecision, scores);
    expect(final.mode).toBe("REVIEW");
    expect(final.reason).toContain("Second-opinion gate");
  });

  it("applies second opinion gate — keeps AUTO on agreement", async () => {
    const { applySecondOpinionGate } = await import("../../server/autonomy/secondOpinion");

    const autoDecision = { mode: "AUTO" as const, reason: "confidence 95%" };
    const scores = {
      primaryDiagnosis: "viral_uri",
      confidence: 0.95,
      differentials: [
        { diagnosis: "viral_uri", probability: 0.95 },
        { diagnosis: "bacterial_pharyngitis", probability: 0.3 },
      ],
    };

    const final = applySecondOpinionGate(autoDecision, scores);
    expect(final.mode).toBe("AUTO");
  });

  it("returns orchestrator metrics after flows", async () => {
    const { getOrchestratorMetrics } = await import("../../server/orchestrator/clinicalOrchestrator");
    const metrics = getOrchestratorMetrics();
    expect(typeof metrics.totalFlows).toBe("number");
    expect(typeof metrics.successRate).toBe("number");
    expect(metrics.successRate).toBeGreaterThanOrEqual(0);
    expect(metrics.successRate).toBeLessThanOrEqual(1);
  });
});
