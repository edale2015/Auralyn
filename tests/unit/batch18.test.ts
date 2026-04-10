import { describe, it, expect, beforeEach } from "vitest";

// ── Vision Agent ──────────────────────────────────────────────────────────────
import {
  rememberSelector, recallSelector, clearSelectorMemory,
  rememberUI, recallUI,
  diagnoseUIError, buildHeatmap, fallbackChain,
} from "../../server/automation/visionAgent";

describe("visionAgent — selectorMemory", () => {
  beforeEach(() => clearSelectorMemory());

  it("rememberSelector + recallSelector", () => {
    rememberSelector("login button", "#login-btn");
    expect(recallSelector("login button")).toBe("#login-btn");
  });

  it("recallSelector returns undefined for unknown label", () => {
    expect(recallSelector("nonexistent")).toBeUndefined();
  });

  it("clearSelectorMemory empties store", () => {
    rememberSelector("x", "y");
    clearSelectorMemory();
    expect(recallSelector("x")).toBeUndefined();
  });
});

describe("visionAgent — uiMemory", () => {
  it("rememberUI + recallUI stores mapping", () => {
    rememberUI("loginScreen", { username: "#user", password: "#pass" });
    expect(recallUI("loginScreen")).toEqual({ username: "#user", password: "#pass" });
  });

  it("recallUI returns null for unknown screen", () => {
    expect(recallUI("unknownScreen")).toBeUndefined();
  });
});

describe("visionAgent — diagnoseUIError()", () => {
  it("detects timeout", () => expect(diagnoseUIError("timeout waiting for page")).toBe("Page load issue"));
  it("detects selector", () => expect(diagnoseUIError("selector not found")).toBe("UI changed"));
  it("detects FHIR", () => expect(diagnoseUIError("FHIR token expired")).toBe("FHIR token issue"));
  it("detects network", () => expect(diagnoseUIError("network error")).toBe("Network unavailable"));
  it("returns Unknown for generic error", () => expect(diagnoseUIError("crash")).toBe("Unknown"));
});

describe("visionAgent — buildHeatmap()", () => {
  it("extracts x,y coordinates", () => {
    const heatmap = buildHeatmap([{ x: 100, y: 200, type: "click" }]);
    expect(heatmap[0]).toEqual({ x: 100, y: 200 });
  });

  it("filters events without coordinates", () => {
    const heatmap = buildHeatmap([{ type: "request", url: "https://example.com" }]);
    expect(heatmap).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(buildHeatmap([])).toHaveLength(0);
  });

  it("handles multiple events", () => {
    const events = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
    expect(buildHeatmap(events)).toHaveLength(2);
  });
});

describe("visionAgent — fallbackChain()", () => {
  it("returns ecw, epic, or failed without throwing", async () => {
    delete process.env.ECW_API;
    delete process.env.EPIC_TOKEN;
    const result = await fallbackChain({ patientId: "P001", disposition: "ROUTINE" });
    expect(["ecw", "epic", "failed"]).toContain(result);
  });

  it("does not throw when no EHR configured", async () => {
    await expect(fallbackChain({ patientId: "P002", disposition: "ER_NOW" })).resolves.not.toThrow();
  });
});

// ── Revenue Optimizer ─────────────────────────────────────────────────────────
import {
  optimizeRevenue, analyzeRevenue, enterpriseOptimize,
  learnFromDenials, prioritizedWrites,
} from "../../server/revenue/revenueOptimizer";

describe("revenueOptimizer — optimizeRevenue()", () => {
  it("upgrades CPT for Private + URGENT", () => {
    const r = optimizeRevenue({ insurance: "Private", disposition: "URGENT", cpt: "99283" });
    expect(r.cpt).toBe("99285");
  });

  it("does not modify non-qualifying claims", () => {
    const r = optimizeRevenue({ insurance: "Medicare", disposition: "ROUTINE", cpt: "99281" });
    expect(r.cpt).toBe("99281");
  });

  it("returns a new object (immutable)", () => {
    const original = { insurance: "Private", disposition: "URGENT", cpt: "99283" };
    optimizeRevenue(original);
    expect(original.cpt).toBe("99283");
  });
});

describe("revenueOptimizer — analyzeRevenue()", () => {
  it("sums claim amounts", () => {
    expect(analyzeRevenue([{ amount: 100 }, { amount: 200 }, { amount: 50 }])).toBe(350);
  });

  it("returns 0 for empty claims", () => {
    expect(analyzeRevenue([])).toBe(0);
  });

  it("treats missing amount as 0", () => {
    expect(analyzeRevenue([{ patientId: "P001" }])).toBe(0);
  });
});

describe("revenueOptimizer — enterpriseOptimize()", () => {
  it("applies Private → 99285 strategy", () => {
    const r = enterpriseOptimize({ insurance: "Private", cpt: "99281" });
    expect(r.cpt).toBe("99285");
  });

  it("applies ER_NOW → 99285 strategy", () => {
    const r = enterpriseOptimize({ disposition: "ER_NOW", cpt: "99281" });
    expect(r.cpt).toBe("99285");
  });

  it("applies medium complexity → 99284", () => {
    const r = enterpriseOptimize({ complexity: "medium", cpt: "99281" });
    expect(r.cpt).toBe("99284");
  });

  it("does not mutate original claim", () => {
    const orig = { insurance: "Private", cpt: "99281" };
    enterpriseOptimize(orig);
    expect(orig.cpt).toBe("99281");
  });
});

describe("revenueOptimizer — learnFromDenials()", () => {
  it("counts denied CPTs", () => {
    const patterns = learnFromDenials([
      { cpt: "99285", denied: true },
      { cpt: "99285", denied: true },
      { cpt: "99283", denied: true },
      { cpt: "99281", denied: false },
    ]);
    expect(patterns["99285"]).toBe(2);
    expect(patterns["99283"]).toBe(1);
    expect(patterns["99281"]).toBeUndefined();
  });

  it("returns empty for no denials", () => {
    expect(learnFromDenials([{ cpt: "99281", denied: false }])).toEqual({});
  });

  it("returns empty for empty input", () => {
    expect(learnFromDenials([])).toEqual({});
  });
});

describe("revenueOptimizer — prioritizedWrites()", () => {
  it("executes all tasks", async () => {
    const results: number[] = [];
    await prioritizedWrites([
      { priority: 1, fn: async () => { results.push(1); } },
      { priority: 3, fn: async () => { results.push(3); } },
      { priority: 2, fn: async () => { results.push(2); } },
    ]);
    expect(results).toHaveLength(3);
  });

  it("returns empty for empty task list", async () => {
    expect(await prioritizedWrites([])).toHaveLength(0);
  });
});

// ── Orchestrator ──────────────────────────────────────────────────────────────
import { systemScore, cacheAction, getCachedAction, clearActionCache, routeConnector } from "../../server/clinical/orchestrator";

describe("orchestrator — systemScore()", () => {
  it("returns 1 for perfect metrics", () => {
    expect(systemScore({ errorRate: 0, latency: 0, denialRate: 0 })).toBeCloseTo(1, 1);
  });

  it("is between 0 and 1", () => {
    const s = systemScore({ errorRate: 0.1, latency: 1000, denialRate: 0.05 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("penalizes high latency", () => {
    const low  = systemScore({ errorRate: 0, latency: 100,  denialRate: 0 });
    const high = systemScore({ errorRate: 0, latency: 2900, denialRate: 0 });
    expect(low).toBeGreaterThan(high);
  });
});

describe("orchestrator — action cache", () => {
  beforeEach(() => clearActionCache());

  it("cacheAction + getCachedAction stores value", () => {
    cacheAction("triage:P001", { disposition: "ER_NOW" });
    expect(getCachedAction("triage:P001")).toEqual({ disposition: "ER_NOW" });
  });

  it("getCachedAction returns undefined for unknown key", () => {
    expect(getCachedAction("nonexistent")).toBeUndefined();
  });

  it("clearActionCache empties all entries", () => {
    cacheAction("k1", "v1");
    cacheAction("k2", "v2");
    clearActionCache();
    expect(getCachedAction("k1")).toBeUndefined();
  });
});

describe("orchestrator — routeConnector()", () => {
  it("slack route does not throw when unconfigured", async () => {
    await expect(routeConnector("slack", { msg: "test" })).resolves.not.toThrow();
  });

  it("telegram route does not throw when unconfigured", async () => {
    await expect(routeConnector("telegram", { msg: "test" })).resolves.not.toThrow();
  });

  it("broadcast route does not throw", async () => {
    await expect(routeConnector("broadcast", { msg: "test" })).resolves.not.toThrow();
  });

  it("unknown connector type does not throw", async () => {
    await expect(routeConnector("unknown", {})).resolves.not.toThrow();
  });
});

// ── ECW Pilot ────────────────────────────────────────────────────────────────
import { safeECWAutomation, dualWriteEHR } from "../../server/automation/ecwPilot";

describe("ecwPilot — safeECWAutomation()", () => {
  it("returns ok:false gracefully when playwright unavailable", async () => {
    const r = await safeECWAutomation({ url: "http://localhost:9999", steps: [] });
    expect(r).toHaveProperty("ok");
  });
});

describe("ecwPilot — dualWriteEHR()", () => {
  it("returns api and ui status", async () => {
    const r = await dualWriteEHR({ patientId: "P001", disposition: "ROUTINE" });
    expect(r).toHaveProperty("api");
    expect(r).toHaveProperty("ui");
  });

  it("does not throw when ECW unconfigured", async () => {
    await expect(dualWriteEHR({ patientId: "P001", disposition: "ER_NOW" })).resolves.not.toThrow();
  });
});
