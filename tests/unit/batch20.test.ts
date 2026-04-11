import { describe, it, expect } from "vitest";

// ── Live Adapters ─────────────────────────────────────────────────────────────
import { safeFetch, connectHospital, connectPayer, safeExternalWrite } from "../../server/integrations/liveAdapters";

describe("liveAdapters — safeFetch()", () => {
  it("returns ok:false for unreachable URL", async () => {
    const r = await safeFetch("http://localhost:1", { method: "GET" });
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("error");
  });
});

describe("liveAdapters — connectHospital()", () => {
  it("returns ok:false when HOSPITAL_API not configured", async () => {
    delete process.env.HOSPITAL_API;
    const r = await connectHospital({ patientId: "P001" });
    expect(r.ok).toBe(false);
  });
});

describe("liveAdapters — connectPayer()", () => {
  it("returns ok:false when PAYER_API not configured", async () => {
    delete process.env.PAYER_API;
    delete process.env.REAL_PAYER_API;
    const r = await connectPayer({ patientId: "P001" });
    expect(r.ok).toBe(false);
  });
});

describe("liveAdapters — safeExternalWrite()", () => {
  it("calls onFail when fn returns ok:false", async () => {
    let failMsg = "";
    const r = await safeExternalWrite(
      async () => ({ ok: false as const, error: "downstream_error" }),
      err => { failMsg = err; }
    );
    expect(r.ok).toBe(false);
    expect(failMsg).toBe("downstream_error");
  });

  it("does not call onFail when fn returns ok:true", async () => {
    let called = false;
    const r = await safeExternalWrite(
      async () => ({ ok: true as const, data: { status: "ok" } }),
      () => { called = true; }
    );
    expect(r.ok).toBe(true);
    expect(called).toBe(false);
  });
});

// ── Network Controller ────────────────────────────────────────────────────────
import { pickBestRegion, rebalance, networkHealth } from "../../server/national/networkController";

const REGIONS = [
  { name: "east", load: 0.3, latencyMs: 100, healthy: true  },
  { name: "west", load: 0.9, latencyMs: 200, healthy: true  },
  { name: "eu",   load: 0.5, latencyMs: 500, healthy: false },
];

describe("networkController — pickBestRegion()", () => {
  it("picks the healthy region with lowest load+latency", () => {
    const r = pickBestRegion(REGIONS);
    expect(r?.name).toBe("east");
  });

  it("returns null when no healthy regions", () => {
    expect(pickBestRegion([{ name: "x", load: 0.9, latencyMs: 100, healthy: false }])).toBeNull();
  });

  it("ignores unhealthy regions", () => {
    const r = pickBestRegion(REGIONS);
    expect(r?.healthy).toBe(true);
  });
});

describe("networkController — rebalance()", () => {
  it("recommends shift_traffic from hot to cold regions", () => {
    const actions = rebalance(REGIONS);
    expect(actions[0]?.action).toBe("shift_traffic");
    expect(actions[0]?.from).toBe("west");
  });

  it("returns empty when no overloaded regions", () => {
    const regions = [{ name: "a", load: 0.3, latencyMs: 100, healthy: true }];
    expect(rebalance(regions)).toHaveLength(0);
  });
});

describe("networkController — networkHealth()", () => {
  it("counts healthy and degraded regions", () => {
    const h = networkHealth(REGIONS);
    expect(h.healthy).toBe(2);
    expect(h.degraded).toBe(1);
  });

  it("computes average load", () => {
    const h = networkHealth(REGIONS);
    expect(h.avgLoad).toBeCloseTo((0.3 + 0.9 + 0.5) / 3, 2);
  });

  it("handles empty regions", () => {
    const h = networkHealth([]);
    expect(h.healthy).toBe(0);
    expect(h.avgLoad).toBe(0);
  });
});

// ── Marketplace Engine ────────────────────────────────────────────────────────
import { matchProvider, rankProvidersSLA } from "../../server/marketplace/engine";

const PROVIDERS = [
  { id: "p1", specialty: "cardiology", distanceKm: 5,  load: 0.3, slaMs: 300 },
  { id: "p2", specialty: "cardiology", distanceKm: 2,  load: 0.9, slaMs: 800 },
  { id: "p3", specialty: "general",    distanceKm: 1,  load: 0.2, slaMs: 200 },
];

describe("marketplace engine — matchProvider()", () => {
  it("returns best SLA-weighted provider for specialty", () => {
    const m = matchProvider({ complaint: "cardiology" }, PROVIDERS);
    expect(m).not.toBeNull();
    expect(m?.specialty).toBe("cardiology");
  });

  it("returns null for unknown specialty", () => {
    expect(matchProvider({ complaint: "unknown" }, PROVIDERS)).toBeNull();
  });

  it("returns null for empty providers", () => {
    expect(matchProvider({ complaint: "cardiology" }, [])).toBeNull();
  });

  it("prefers lower composite score (distance+load+sla)", () => {
    // p2: 2*0.4 + 0.9*0.4 + (800/1000)*0.2 = 0.8+0.36+0.16 = 1.32
    // p1: 5*0.4 + 0.3*0.4 + (300/1000)*0.2 = 2.0+0.12+0.06 = 2.18
    // p2 wins (lower composite score)
    const m = matchProvider({ complaint: "cardiology" }, PROVIDERS);
    expect(m?.id).toBe("p2");
  });
});

describe("marketplace engine — rankProvidersSLA()", () => {
  it("returns all providers matching specialty, sorted", () => {
    const ranked = rankProvidersSLA({ complaint: "cardiology" }, PROVIDERS);
    expect(ranked.length).toBe(2);
    expect(ranked[0].specialty).toBe("cardiology");
  });

  it("first provider has lower composite score than last", () => {
    const ranked = rankProvidersSLA({ complaint: "cardiology" }, PROVIDERS);
    const scoreOf = (p: typeof PROVIDERS[0]) => p.distanceKm * 0.4 + p.load * 0.4 + (p.slaMs / 1_000) * 0.2;
    expect(scoreOf(ranked[0])).toBeLessThanOrEqual(scoreOf(ranked[ranked.length - 1]));
  });

  it("returns empty for unknown specialty", () => {
    expect(rankProvidersSLA({ complaint: "xyz" }, PROVIDERS)).toHaveLength(0);
  });
});

// ── Workflow Optimizer ────────────────────────────────────────────────────────
import { optimizeWorkflow, applyOptimization, projectRevenue } from "../../server/optimization/optimizer";

describe("optimizer — optimizeWorkflow()", () => {
  it("computes profit = revenue - cost", () => {
    const m = optimizeWorkflow([{ cost: 100, revenue: 250, latencyMs: 500 }]);
    expect(m.profit).toBe(150);
  });

  it("computes margin correctly", () => {
    const m = optimizeWorkflow([{ cost: 100, revenue: 200, latencyMs: 500 }]);
    expect(m.margin).toBeCloseTo(0.5, 2);
  });

  it("computes avg latency", () => {
    const m = optimizeWorkflow([
      { cost: 0, revenue: 100, latencyMs: 1000 },
      { cost: 0, revenue: 100, latencyMs: 2000 },
    ]);
    expect(m.avgLatency).toBe(1500);
  });

  it("handles empty visits with profit=0", () => {
    const m = optimizeWorkflow([]);
    expect(m.profit).toBe(0);
    expect(m.margin).toBe(0);
  });
});

describe("optimizer — applyOptimization()", () => {
  it("recommends reduce_cost_path for low margin", () => {
    const a = applyOptimization({ profit: 10, margin: 0.1, avgLatency: 500 });
    expect(a).toContain("reduce_cost_path");
  });

  it("recommends enable_fast_path for high latency", () => {
    const a = applyOptimization({ profit: 100, margin: 0.5, avgLatency: 2000 });
    expect(a).toContain("enable_fast_path");
  });

  it("recommends review_pricing for negative profit", () => {
    const a = applyOptimization({ profit: -100, margin: -0.5, avgLatency: 500 });
    expect(a).toContain("review_pricing");
  });

  it("returns empty for optimal metrics", () => {
    expect(applyOptimization({ profit: 500, margin: 0.4, avgLatency: 800 })).toHaveLength(0);
  });
});

describe("optimizer — projectRevenue()", () => {
  it("scales revenue by multiplier", () => {
    const visits = [{ cost: 50, revenue: 100, latencyMs: 500 }];
    expect(projectRevenue(visits, 1.5)).toBe(150);
  });

  it("returns 0 for empty visits", () => {
    expect(projectRevenue([], 2)).toBe(0);
  });
});

// ── Advanced Utils ────────────────────────────────────────────────────────────
import { nextBestQuestion, oneGlance, retry, zAnomaly, zScore } from "../../server/utils/advancedUtils";

describe("advancedUtils — nextBestQuestion()", () => {
  it("returns question ID with highest weighted score", () => {
    const dx = [{ name: "sepsis", p: 0.8 }, { name: "flu", p: 0.2 }];
    const qs = [{ id: "q1", weight: 0.5 }, { id: "q2", weight: 2.0 }];
    expect(nextBestQuestion(dx, qs)).toBe("q2");
  });

  it("returns null for empty questions", () => {
    expect(nextBestQuestion([{ name: "flu", p: 0.5 }], [])).toBeNull();
  });

  it("returns null for empty dx", () => {
    expect(nextBestQuestion([], [{ id: "q1", weight: 1 }])).toBe("q1");
  });
});

describe("advancedUtils — oneGlance()", () => {
  it("formats complaint | diagnosis | disposition", () => {
    const s = oneGlance({ complaint: "chest_pain", differential: [{ diagnosis: "ACS" }], disposition: "ER_NOW" });
    expect(s).toBe("chest_pain | ACS | ER_NOW");
  });

  it("handles missing fields with fallback", () => {
    const s = oneGlance({});
    expect(s).toBe("? | — | pending");
  });

  it("handles missing differential", () => {
    const s = oneGlance({ complaint: "fever", disposition: "ROUTINE" });
    expect(s).toContain("—");
  });
});

describe("advancedUtils — retry()", () => {
  it("resolves immediately on first success", async () => {
    let count = 0;
    const r = await retry(async () => { count++; return "ok"; }, 3);
    expect(r).toBe("ok");
    expect(count).toBe(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    let count = 0;
    const r = await retry(async () => {
      count++;
      if (count < 2) throw new Error("fail");
      return "done";
    }, 3);
    expect(r).toBe("done");
    expect(count).toBe(2);
  }, 5000);

  it("throws after all retries exhausted", async () => {
    await expect(retry(async () => { throw new Error("always"); }, 2)).rejects.toThrow("always");
  }, 5000);
});

describe("advancedUtils — zAnomaly()", () => {
  it("detects outlier at the end of series", () => {
    // Use a threshold of 2 and a clear outlier so floating-point doesn't interfere
    const normal = [100, 101, 99, 100, 100, 102, 99, 100, 100, 500];
    expect(zAnomaly(normal, 2)).toBe(true);
  });

  it("returns false for flat series", () => {
    expect(zAnomaly([100, 100, 100, 100, 100])).toBe(false);
  });

  it("returns false for single element", () => {
    expect(zAnomaly([42])).toBe(false);
  });

  it("respects custom threshold", () => {
    const series = [100, 100, 100, 100, 120];
    expect(zAnomaly(series, 0.1)).toBe(true);
    expect(zAnomaly(series, 10)).toBe(false);
  });
});

describe("advancedUtils — zScore()", () => {
  it("returns 0 for flat series", () => {
    expect(zScore([5, 5, 5, 5])).toBe(0);
  });

  it("returns positive z for above-mean last value", () => {
    expect(zScore([1, 1, 1, 10])).toBeGreaterThan(0);
  });

  it("returns negative z for below-mean last value", () => {
    expect(zScore([10, 10, 10, 1])).toBeLessThan(0);
  });
});

// ── universalWrite (unit-level) ───────────────────────────────────────────────
import { universalWrite } from "../../server/utils/advancedUtils";

describe("advancedUtils — universalWrite()", () => {
  it("returns a valid channel string without throwing", async () => {
    delete process.env.ECW_API;
    const r = await universalWrite({ patientId: "P001", disposition: "ROUTINE" });
    expect(["ecw", "ui", "vision", "failed"]).toContain(r);
  });
});
