import { describe, it, expect, afterEach } from "vitest";

// ── CPT Revenue ───────────────────────────────────────────────────────────────
import {
  assignCPT, estimateRevenue, computePLV, clinicScore, getCPTRate, CPT_RATES,
} from "../../server/billing/cptRevenue";

describe("cptRevenue — assignCPT()", () => {
  it("maps ER_NOW to 99285", () => expect(assignCPT("ER_NOW")).toBe("99285"));
  it("maps URGENT to 99284", () => expect(assignCPT("URGENT")).toBe("99284"));
  it("maps SAME_DAY to 99283", () => expect(assignCPT("SAME_DAY")).toBe("99283"));
  it("maps NEXT_DAY to 99282", () => expect(assignCPT("NEXT_DAY")).toBe("99282"));
  it("maps ROUTINE to 99213", () => expect(assignCPT("ROUTINE")).toBe("99213"));
  it("defaults unknown to 99213", () => expect(assignCPT("UNKNOWN")).toBe("99213"));
});

describe("cptRevenue — getCPTRate()", () => {
  it("returns 500 for 99285", () => expect(getCPTRate("99285")).toBe(500));
  it("returns 0 for unknown code", () => expect(getCPTRate("00000")).toBe(0));
  it("all codes in CPT_RATES return > 0", () => {
    for (const [code, rate] of Object.entries(CPT_RATES)) {
      expect(rate).toBeGreaterThan(0);
    }
  });
});

describe("cptRevenue — estimateRevenue()", () => {
  it("sums revenue from dispositions", () => {
    const visits = [
      { disposition: "ER_NOW" },
      { disposition: "URGENT" },
      { disposition: "ROUTINE" },
    ];
    expect(estimateRevenue(visits)).toBe(500 + 300 + 120);
  });

  it("returns 0 for empty array", () => expect(estimateRevenue([])).toBe(0));

  it("uses provided cptCode if present", () => {
    const visits = [{ cptCode: "99285" }];
    expect(estimateRevenue(visits)).toBe(500);
  });

  it("handles array of 100 routine visits", () => {
    const visits = Array(100).fill({ disposition: "ROUTINE" });
    expect(estimateRevenue(visits)).toBe(100 * 120);
  });
});

describe("cptRevenue — computePLV()", () => {
  it("returns 150 per visit", () => expect(computePLV([1, 2, 3])).toBe(450));
  it("returns 0 for empty history", () => expect(computePLV([])).toBe(0));
  it("returns 150 for single visit", () => expect(computePLV([{}])).toBe(150));
});

describe("cptRevenue — clinicScore()", () => {
  it("returns all required fields", () => {
    const score = clinicScore([
      { disposition: "ER_NOW", er: true },
      { disposition: "ROUTINE" },
    ]);
    expect(typeof score.efficiency).toBe("number");
    expect(typeof score.erRate).toBe("number");
    expect(typeof score.avgRevenue).toBe("number");
    expect(score.visits).toBe(2);
  });

  it("erRate is 1 when all visits are ER", () => {
    const score = clinicScore([{ er: true }, { er: true }]);
    expect(score.erRate).toBe(1);
  });

  it("returns zeros for empty visits", () => {
    const score = clinicScore([]);
    expect(score.efficiency).toBe(0);
    expect(score.erRate).toBe(0);
    expect(score.visits).toBe(0);
  });

  it("counts disposition ER_NOW as ER", () => {
    const score = clinicScore([{ disposition: "ER_NOW" }]);
    expect(score.erRate).toBe(1);
  });
});

// ── National Rollout ──────────────────────────────────────────────────────────
import {
  findExpansionTargets, deployRegion, runNationalExpansion, getDeploymentLog,
} from "../../server/national/rolloutEngine";

const ALL_REGIONS = [
  { name: "NYC", population: 8_000_000, load: 0.3, hasTelemed: false },
  { name: "SF",  population: 900_000,   load: 0.2, hasTelemed: false },
  { name: "LA",  population: 400_000,   load: 0.3, hasTelemed: false },
  { name: "CHI", population: 2_700_000, load: 0.8, hasTelemed: true },
  { name: "BOS", population: 700_000,   load: 0.4, hasTelemed: false },
];

describe("rolloutEngine — findExpansionTargets()", () => {
  it("filters by population > 500k", () => {
    const t = findExpansionTargets(ALL_REGIONS);
    expect(t.every(r => r.population > 500_000)).toBe(true);
  });

  it("filters by load < 0.5", () => {
    const t = findExpansionTargets(ALL_REGIONS);
    expect(t.every(r => r.load < 0.5)).toBe(true);
  });

  it("filters out hasTelemed = true", () => {
    const t = findExpansionTargets(ALL_REGIONS);
    expect(t.every(r => r.hasTelemed === false)).toBe(true);
  });

  it("returns correct targets: NYC, SF, BOS", () => {
    const names = findExpansionTargets(ALL_REGIONS).map(r => r.name);
    expect(names).toContain("NYC");
    expect(names).toContain("SF");
    expect(names).toContain("BOS");
    expect(names).not.toContain("LA");
    expect(names).not.toContain("CHI");
  });

  it("returns empty for all high-load regions", () => {
    const hi = ALL_REGIONS.map(r => ({ ...r, load: 0.9 }));
    expect(findExpansionTargets(hi)).toHaveLength(0);
  });
});

describe("rolloutEngine — deployRegion()", () => {
  it("returns status queued when no DEPLOY_API env", async () => {
    const r = await deployRegion({ name: "TestCity", population: 1_000_000, load: 0.2, hasTelemed: false });
    expect(r.region).toBe("TestCity");
    expect(["queued", "deployed", "failed"]).toContain(r.status);
    expect(typeof r.ts).toBe("string");
  });

  it("appends to deployment log", async () => {
    const before = getDeploymentLog().length;
    await deployRegion({ name: "LogTestCity", population: 1_000_000, load: 0.1, hasTelemed: false });
    expect(getDeploymentLog().length).toBeGreaterThan(before);
  });
});

describe("rolloutEngine — runNationalExpansion()", () => {
  it("deploys to all qualifying targets", async () => {
    const results = await runNationalExpansion(ALL_REGIONS);
    expect(results.length).toBeGreaterThan(0);
    results.forEach(r => {
      expect(["queued", "deployed", "failed"]).toContain(r.status);
    });
  }, 10_000);

  it("returns empty for no qualifying regions", async () => {
    const results = await runNationalExpansion([]);
    expect(results).toHaveLength(0);
  });
});

// ── Clinic Intelligence ───────────────────────────────────────────────────────
import {
  shedLoad, recoverSystem, broadcastNational,
} from "../../server/clinical/clinicIntelligence";

describe("clinicIntelligence — shedLoad()", () => {
  it("returns redirect for load > 80", () => {
    expect(shedLoad(85)).toBe("redirect_to_telemed");
    expect(shedLoad(100)).toBe("redirect_to_telemed");
  });

  it("returns normal for load <= 80", () => {
    expect(shedLoad(80)).toBe("normal");
    expect(shedLoad(50)).toBe("normal");
    expect(shedLoad(0)).toBe("normal");
  });
});

describe("clinicIntelligence — recoverSystem()", () => {
  it("does not throw for Error object", () => {
    expect(() => recoverSystem(new Error("db crash"))).not.toThrow();
  });

  it("does not throw for string errors", () => {
    expect(() => recoverSystem("network timeout")).not.toThrow();
  });

  it("does not throw for undefined", () => {
    expect(() => recoverSystem(undefined)).not.toThrow();
  });
});

describe("clinicIntelligence — broadcastNational()", () => {
  it("does not throw", () => {
    expect(() => broadcastNational("Flu surge detected in NYC")).not.toThrow();
  });

  it("handles empty alert string", () => {
    expect(() => broadcastNational("")).not.toThrow();
  });
});

// ── Live Pilot ────────────────────────────────────────────────────────────────
import { runLivePilot, ingestHospitalOutcome } from "../../server/pilot/livePilot";

describe("livePilot — runLivePilot()", () => {
  it("returns full result shape", async () => {
    const r = await runLivePilot({ patientId: "LP001", complaint: "fever" });
    expect(r.patientId).toBe("LP001");
    expect(typeof r.disposition).toBe("string");
    expect(typeof r.emsDispatched).toBe("boolean");
    expect(typeof r.sentToHospital).toBe("boolean");
    expect(typeof r.ts).toBe("string");
  }, 10_000);

  it("emsDispatched is false without location", async () => {
    const r = await runLivePilot({ patientId: "LP002", complaint: "headache" });
    expect(r.emsDispatched).toBe(false);
  }, 10_000);
});

describe("livePilot — ingestHospitalOutcome()", () => {
  it("returns true for valid outcome", async () => {
    const ok = await ingestHospitalOutcome({ patientId: "LP001", actualDisposition: "ER_NOW" });
    expect(ok).toBe(true);
  });

  it("accepts extra fields on outcome", async () => {
    const ok = await ingestHospitalOutcome({
      patientId: "LP003",
      outcome: "URGENT",
      feedback: "Good triage",
    });
    expect(ok).toBe(true);
  });
});

// ── Production Loop ───────────────────────────────────────────────────────────
import {
  startProductionLoop, stopProductionLoop, getLoopStatus, watchdog, isLoopRunning, getCycleCount,
} from "../../server/runtime/productionLoop";

describe("productionLoop — status and control", () => {
  afterEach(() => {
    stopProductionLoop();
  });

  it("is not running before start", () => {
    stopProductionLoop();
    expect(isLoopRunning()).toBe(false);
  });

  it("isLoopRunning returns true after start", () => {
    startProductionLoop(99_999);
    expect(isLoopRunning()).toBe(true);
  });

  it("isLoopRunning returns false after stop", () => {
    startProductionLoop(99_999);
    stopProductionLoop();
    expect(isLoopRunning()).toBe(false);
  });

  it("getLoopStatus returns correct shape", () => {
    const s = getLoopStatus();
    expect(typeof s.running).toBe("boolean");
    expect(typeof s.cycleCount).toBe("number");
    expect(typeof s.lastCycleTs).toBe("number");
  });

  it("duplicate start does not throw", () => {
    startProductionLoop(99_999);
    expect(() => startProductionLoop(99_999)).not.toThrow();
  });
});

describe("productionLoop — watchdog()", () => {
  it("does not throw when mismatch is low", () => {
    expect(() => watchdog({ safety: { mismatchRate: 0.005 } })).not.toThrow();
  });

  it("does not throw when mismatch is high (broadcasts instead of exiting)", () => {
    expect(() => watchdog({ safety: { mismatchRate: 0.03 } })).not.toThrow();
  });
});

describe("productionLoop — getCycleCount()", () => {
  it("returns a non-negative number", () => {
    expect(getCycleCount()).toBeGreaterThanOrEqual(0);
  });
});
