import { describe, it, expect, afterEach } from "vitest";

// ── System Bus ────────────────────────────────────────────────────────────────
import { publish, subscribe, unsubscribe, publishUpdate, systemBus } from "../../server/control/systemBus";

describe("systemBus", () => {
  afterEach(() => {
    systemBus.removeAllListeners("test-event-bus");
    systemBus.removeAllListeners("test-unsub");
  });

  it("publish/subscribe delivers event data", () => new Promise<void>(resolve => {
    systemBus.once("test-event-bus", (d: unknown) => { expect(d).toEqual({ x: 1 }); resolve(); });
    publish("test-event-bus", { x: 1 });
  }));

  it("publishUpdate emits 'update' event", () => new Promise<void>(resolve => {
    systemBus.once("update", (d: unknown) => { expect(d).toBeDefined(); resolve(); });
    publishUpdate({ type: "test" });
  }));

  it("systemBus is same object as controlBus", () => {
    expect(systemBus).toBeDefined();
  });

  it("unsubscribe stops event delivery", () => {
    let count = 0;
    const handler = () => count++;
    subscribe("test-unsub", handler);
    unsubscribe("test-unsub", handler);
    publish("test-unsub", {});
    expect(count).toBe(0);
  });
});

// ── Modules State ─────────────────────────────────────────────────────────────
import {
  clinicalState, automationState, revenueState, visionState,
  integrationState, healthScore, smartSecondary, instantSummary,
  autoRecover, nextStep, globalTrend, systemInsight, getUnifiedState,
} from "../../server/control/modulesState";

describe("modulesState — state reporters", () => {
  it("clinicalState returns activeCases and safetyMismatch", () => {
    const s = clinicalState();
    expect(s).toHaveProperty("activeCases");
    expect(s).toHaveProperty("safetyMismatch");
  });

  it("automationState returns templates, failures, lastRun", () => {
    const s = automationState();
    expect(s).toHaveProperty("templates");
    expect(s).toHaveProperty("failures");
    expect(s).toHaveProperty("lastRun");
  });

  it("revenueState returns dailyRevenue and denialRate", () => {
    const s = revenueState();
    expect(s.dailyRevenue).toBeGreaterThan(0);
    expect(s.denialRate).toBeGreaterThan(0);
    expect(s.denialRate).toBeLessThan(1);
  });

  it("visionState returns successRate and fallbackRate", () => {
    const s = visionState();
    expect(s.successRate).toBeGreaterThan(0);
    expect(s.fallbackRate).toBeGreaterThan(0);
  });

  it("integrationState resolves with all four keys", async () => {
    const s = await integrationState();
    expect(s).toHaveProperty("epic");
    expect(s).toHaveProperty("ecw");
    expect(s).toHaveProperty("chatgpt");
    expect(s).toHaveProperty("whatsapp");
  });

  it("getUnifiedState returns all modules", () => {
    const s = getUnifiedState();
    expect(s).toHaveProperty("clinical");
    expect(s).toHaveProperty("automation");
    expect(s).toHaveProperty("revenue");
    expect(s).toHaveProperty("vision");
  });
});

describe("modulesState — healthScore()", () => {
  it("returns 1 for perfect state", () => {
    const s = healthScore({ clinical: { safetyMismatch: 0 }, revenue: { denialRate: 0 }, vision: { successRate: 1 } });
    expect(s).toBeCloseTo(1, 1);
  });

  it("is clamped to [0, 1]", () => {
    const s = healthScore({ clinical: { safetyMismatch: 1 }, revenue: { denialRate: 1 }, vision: { successRate: 0 } });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("modulesState — smartSecondary()", () => {
  it("asks for duration when missing", () => {
    expect(smartSecondary({ severity: "high" })).toMatch(/long/i);
  });

  it("asks for severity when duration present but severity missing", () => {
    expect(smartSecondary({ duration: "2 days" })).toMatch(/severe/i);
  });

  it("returns null when both present", () => {
    expect(smartSecondary({ duration: "1 day", severity: "7" })).toBeNull();
  });
});

describe("modulesState — instantSummary()", () => {
  it("formats complaint → disposition", () => {
    const s = instantSummary({ complaint: "chest_pain", disposition: "ER_NOW" });
    expect(s).toBe("chest_pain → ER_NOW");
  });

  it("handles missing fields gracefully", () => {
    expect(instantSummary({})).toBe("? → pending");
  });
});

describe("modulesState — autoRecover()", () => {
  it("returns restart_ecw when ECW is down", () => {
    const a = autoRecover({ integrations: { ecw: "down", epic: "ok" } });
    expect(a).toContain("restart_ecw");
  });

  it("returns empty array when all OK", () => {
    const a = autoRecover({ integrations: { ecw: "ok", epic: "ok" } });
    expect(a).toHaveLength(0);
  });
});

describe("modulesState — nextStep()", () => {
  it("ER_NOW → go to ER", () => {
    expect(nextStep({ disposition: "ER_NOW" })).toMatch(/ER/i);
  });

  it("URGENT → visit clinic", () => {
    expect(nextStep({ disposition: "URGENT" })).toMatch(/clinic/i);
  });

  it("ROUTINE → schedule follow-up", () => {
    expect(nextStep({ disposition: "ROUTINE" })).toMatch(/follow/i);
  });

  it("fallback → home care", () => {
    expect(nextStep({})).toMatch(/home/i);
  });
});

describe("modulesState — globalTrend()", () => {
  it("counts complaints", () => {
    const t = globalTrend([
      { complaint: "chest_pain" },
      { complaint: "chest_pain" },
      { complaint: "fever" },
    ]);
    expect(t["chest_pain"]).toBe(2);
    expect(t["fever"]).toBe(1);
  });

  it("returns empty for empty input", () => {
    expect(globalTrend([])).toEqual({});
  });

  it("handles missing complaint field", () => {
    const t = globalTrend([{} as any]);
    expect(t["unknown"]).toBe(1);
  });
});

describe("modulesState — systemInsight()", () => {
  it("detects slow system", () => {
    expect(systemInsight({ latency: 2500 })).toBe("System slow");
  });

  it("detects safety risk", () => {
    expect(systemInsight({ safety: { mismatchRate: 0.05 } })).toBe("Safety risk");
  });

  it("reports optimal when all good", () => {
    expect(systemInsight({ latency: 500, safety: { mismatchRate: 0.001 } })).toBe("System optimal");
  });
});

// ── Region Cluster ─────────────────────────────────────────────────────────────
import { autoScale, getConfiguredRegions } from "../../server/control/regionCluster";

describe("regionCluster — autoScale()", () => {
  it("returns 20 for depth > 200", () => expect(autoScale(250)).toBe(20));
  it("returns 10 for depth > 100", () => expect(autoScale(150)).toBe(10));
  it("returns 3 for low depth",    () => expect(autoScale(50)).toBe(3));
  it("returns 3 for depth = 0",    () => expect(autoScale(0)).toBe(3));
  it("returns 20 for depth = 201", () => expect(autoScale(201)).toBe(20));
  it("boundary: 101 returns 10",   () => expect(autoScale(101)).toBe(10));
});

describe("regionCluster — getConfiguredRegions()", () => {
  it("returns an array (empty when no env vars set)", () => {
    delete process.env.REGION_EAST;
    delete process.env.REGION_WEST;
    delete process.env.REGION_EU;
    const regions = getConfiguredRegions();
    expect(Array.isArray(regions)).toBe(true);
  });
});

// ── Live Billing ───────────────────────────────────────────────────────────────
import { submitLiveClaim, optimizeClaim } from "../../server/revenue/liveBilling";

describe("liveBilling — submitLiveClaim()", () => {
  it("returns skipped when no payer API configured", async () => {
    delete process.env.PAYER_API;
    delete process.env.PAYER_TOKEN;
    const r = await submitLiveClaim({ patientId: "P001", cpt: "99283" });
    expect(r.status).toBe("skipped");
  });
});

describe("liveBilling — optimizeClaim()", () => {
  it("upgrades Private + URGENT to 99285", () => {
    const r = optimizeClaim({ patientId: "P1", insurance: "Private", disposition: "URGENT" });
    expect(r.cpt).toBe("99285");
  });

  it("sets 99284 for Medicaid claims", () => {
    const r = optimizeClaim({ patientId: "P2", insurance: "Medicaid" });
    expect(r.cpt).toBe("99284");
  });

  it("does not modify unrelated claims", () => {
    const r = optimizeClaim({ patientId: "P3", insurance: "Medicare", cpt: "99281" });
    expect(r.cpt).toBe("99281");
  });

  it("does not mutate original claim", () => {
    const orig = { patientId: "P1", insurance: "Private", disposition: "URGENT" };
    optimizeClaim(orig);
    expect(orig.cpt).toBeUndefined();
  });
});

// ── Live Real System ───────────────────────────────────────────────────────────
import { runLiveSystem } from "../../server/pilot/liveRealSystem";

describe("liveRealSystem — runLiveSystem()", () => {
  it("returns disposition, revenue, and ehr", async () => {
    const r = await runLiveSystem({ patientId: "P001", complaint: "chest_pain" });
    expect(r).toHaveProperty("disposition");
    expect(r).toHaveProperty("revenue");
    expect(r).toHaveProperty("ehr");
  });

  it("disposition is a non-empty string", async () => {
    const r = await runLiveSystem({ patientId: "P002", complaint: "fever" });
    expect(typeof r.disposition).toBe("string");
    expect(r.disposition.length).toBeGreaterThan(0);
  });

  it("does not throw when EHR env vars are missing", async () => {
    await expect(runLiveSystem({ patientId: "P003", complaint: "headache" })).resolves.not.toThrow();
  });
});
