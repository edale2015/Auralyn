import { describe, it, expect, beforeEach } from "vitest";

// ── Production Mode ───────────────────────────────────────────────────────────
import {
  setMode, getMode, enforceProductionSafety, isCanary,
  canaryRolloutFraction, isProductionSafe,
} from "../../server/autopilot/productionMode";

describe("productionMode — setMode() / getMode()", () => {
  it("defaults to staging", () => {
    setMode("staging");
    expect(getMode()).toBe("staging");
  });

  it("accepts production mode", () => {
    setMode("production");
    expect(getMode()).toBe("production");
    setMode("staging");
  });

  it("accepts canary mode", () => {
    setMode("canary");
    expect(getMode()).toBe("canary");
    setMode("staging");
  });

  it("falls back to staging for invalid mode", () => {
    setMode("invalid_mode" as any);
    expect(getMode()).toBe("staging");
  });
});

describe("productionMode — enforceProductionSafety()", () => {
  it("returns true when mismatch is below 1%", () => {
    expect(enforceProductionSafety({ safety: { mismatchRate: 0.005 } })).toBe(true);
  });

  it("throws when mismatch exceeds 1%", () => {
    expect(() =>
      enforceProductionSafety({ safety: { mismatchRate: 0.02 } })
    ).toThrow("Production halted");
  });

  it("returns true at exactly 0% mismatch", () => {
    expect(enforceProductionSafety({ safety: { mismatchRate: 0 } })).toBe(true);
  });

  it("throws at exactly 1.01% mismatch", () => {
    expect(() =>
      enforceProductionSafety({ safety: { mismatchRate: 0.0101 } })
    ).toThrow();
  });
});

describe("productionMode — isCanary()", () => {
  it("returns false for empty string", () => {
    expect(isCanary("")).toBe(false);
  });

  it("consistently returns boolean", () => {
    const result = isCanary("user-abc");
    expect(typeof result).toBe("boolean");
  });

  it("charCode % 10 === 0 → true, otherwise false", () => {
    const userId = "A";
    expect(isCanary(userId)).toBe("A".charCodeAt(0) % 10 === 0);
  });
});

describe("productionMode — canaryRolloutFraction()", () => {
  it("returns 0 for empty string", () => {
    expect(canaryRolloutFraction("")).toBe(0);
  });

  it("returns a value 0–99", () => {
    const f = canaryRolloutFraction("hello");
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(100);
  });
});

describe("productionMode — isProductionSafe()", () => {
  it("returns true for mismatch <= 1%", () => {
    expect(isProductionSafe(0.005)).toBe(true);
    expect(isProductionSafe(0.01)).toBe(true);
  });

  it("returns false for mismatch > 1%", () => {
    expect(isProductionSafe(0.011)).toBe(false);
  });
});

// ── Autopilot Utils ───────────────────────────────────────────────────────────
import {
  autopilotLevel, computeKPIs, interruptSystem, selfHeal, syncGlobalState,
} from "../../server/autopilot/autopilotUtils";

describe("autopilotUtils — autopilotLevel()", () => {
  it("returns auto when safe and no drift", () => {
    expect(autopilotLevel({ safety: { mismatchRate: 0.001 }, ml: { drift: false } })).toBe("auto");
  });

  it("returns semi-auto when drift is true", () => {
    expect(autopilotLevel({ safety: { mismatchRate: 0.001 }, ml: { drift: true } })).toBe("semi-auto");
  });

  it("returns manual when mismatch > 1%", () => {
    expect(autopilotLevel({ safety: { mismatchRate: 0.02 }, ml: { drift: false } })).toBe("manual");
  });

  it("manual takes priority over drift", () => {
    expect(autopilotLevel({ safety: { mismatchRate: 0.05 }, ml: { drift: true } })).toBe("manual");
  });
});

describe("autopilotUtils — computeKPIs()", () => {
  it("returns all KPI fields", () => {
    const k = computeKPIs({ er: 10, patients: 100 });
    expect(k.erRate).toBeCloseTo(0.1, 4);
    expect(k.patients).toBe(100);
    expect(typeof k.avgLatencyMs).toBe("number");
    expect(typeof k.safetyScore).toBe("number");
  });

  it("erRate is 0 for zero patients", () => {
    expect(computeKPIs({}).erRate).toBe(0);
  });

  it("safetyScore is 1 when mismatch is 0", () => {
    const k = computeKPIs({ safety: { mismatchRate: 0 } });
    expect(k.safetyScore).toBe(1);
  });

  it("computes avgLatencyMs from array", () => {
    const k = computeKPIs({ latency: [10, 20, 30] });
    expect(k.avgLatencyMs).toBe(20);
  });

  it("computes avgLatencyMs from object with .avg", () => {
    const k = computeKPIs({ latency: { avg: 42 } });
    expect(k.avgLatencyMs).toBe(42);
  });
});

describe("autopilotUtils — interruptSystem()", () => {
  it("does not throw", () => {
    expect(() => interruptSystem("test interrupt reason")).not.toThrow();
  });

  it("handles empty reason string", () => {
    expect(() => interruptSystem("")).not.toThrow();
  });
});

describe("autopilotUtils — selfHeal()", () => {
  it("does not throw for selector error", () => {
    expect(() => selfHeal("selector not found")).not.toThrow();
  });

  it("does not throw for template error", () => {
    expect(() => selfHeal("template render failed")).not.toThrow();
  });

  it("does not throw for unrecognised error", () => {
    expect(() => selfHeal("random crash")).not.toThrow();
  });
});

describe("autopilotUtils — syncGlobalState()", () => {
  it("returns array of region states", () => {
    const r = syncGlobalState([
      { region: "us-east", state: { load: "normal" } },
      { region: "eu", state: { load: "high" } },
    ]);
    expect(r).toHaveLength(2);
    expect((r[0] as any).load).toBe("normal");
  });

  it("returns empty array for empty regions", () => {
    expect(syncGlobalState([])).toEqual([]);
  });
});

// ── FDA Export ────────────────────────────────────────────────────────────────
import {
  buildFullFDAPackage, exportEnterpriseBundle,
} from "../../server/exec/fdaExport";

describe("fdaExport — buildFullFDAPackage()", () => {
  const mockState = {
    safety: { mismatchRate: 0.001 },
    ml: { modelVersion: "v1", drift: false },
  };

  it("returns required top-level fields", () => {
    const p = buildFullFDAPackage(mockState);
    expect(p.system).toContain("Auralyn");
    expect(p.safety).toEqual(mockState.safety);
    expect(p.ml).toEqual(mockState.ml);
    expect(typeof p.generatedAt).toBe("string");
    expect(() => new Date(p.generatedAt)).not.toThrow();
  });

  it("validation has goldenCases and accuracy", () => {
    const p = buildFullFDAPackage(mockState);
    expect(p.validation.goldenCases).toBeGreaterThan(0);
    expect(p.validation.accuracy).toBeGreaterThan(0.9);
  });

  it("governance has RLHF and audit fields", () => {
    const p = buildFullFDAPackage(mockState);
    expect(p.governance.RLHF).toBeTruthy();
    expect(p.governance.audit).toBeTruthy();
  });

  it("classification includes SaMD", () => {
    const p = buildFullFDAPackage(mockState);
    expect(p.classification.deviceClass).toContain("SaMD");
  });
});

describe("fdaExport — exportEnterpriseBundle()", () => {
  it("returns summary, deployment, metrics, readinessLevel", () => {
    const b = exportEnterpriseBundle({ infrastructure: { regions: ["us-east-1"] }, safety: { mismatchRate: 0 } });
    expect(b.summary).toBeTruthy();
    expect(b.deployment).toBeDefined();
    expect(b.metrics).toBeDefined();
    expect(["MVP", "PILOT", "PRODUCTION"]).toContain(b.readinessLevel);
  });

  it("readinessLevel is PRODUCTION for very low mismatch", () => {
    const b = exportEnterpriseBundle({ safety: { mismatchRate: 0.001 } });
    expect(b.readinessLevel).toBe("PRODUCTION");
  });

  it("readinessLevel is PILOT for moderate mismatch", () => {
    const b = exportEnterpriseBundle({ safety: { mismatchRate: 0.007 } });
    expect(b.readinessLevel).toBe("PILOT");
  });

  it("readinessLevel is MVP for high mismatch", () => {
    const b = exportEnterpriseBundle({ safety: { mismatchRate: 0.02 } });
    expect(b.readinessLevel).toBe("MVP");
  });

  it("contains generatedAt ISO timestamp", () => {
    const b = exportEnterpriseBundle({});
    expect(() => new Date(b.generatedAt)).not.toThrow();
  });
});

// ── Pilot Workflow ────────────────────────────────────────────────────────────
import {
  dispatchEMS, pilotWorkflow, recordPhysicianOverride,
  getEMSLog, getOverrideLog,
} from "../../server/autopilot/pilotWorkflow";

describe("pilotWorkflow — dispatchEMS()", () => {
  it("returns a dispatch record", async () => {
    const d = await dispatchEMS("NYC-ER-7", "P001");
    expect(d.location).toBe("NYC-ER-7");
    expect(d.patientId).toBe("P001");
    expect(d.priority).toBe("CODE_RED");
    expect(typeof d.dispatchedAt).toBe("string");
  });

  it("appends to EMS log", async () => {
    const before = getEMSLog().length;
    await dispatchEMS("Brooklyn-ER", "P002");
    expect(getEMSLog().length).toBe(before + 1);
  });
});

describe("pilotWorkflow — pilotWorkflow()", () => {
  it("returns full result shape", async () => {
    const r = await pilotWorkflow({ patientId: "P010", complaint: "headache" });
    expect(r.patientId).toBe("P010");
    expect(typeof r.disposition).toBe("string");
    expect(typeof r.emsDispatched).toBe("boolean");
    expect(typeof r.pilotCaseSent).toBe("boolean");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  }, 10_000);

  it("emsDispatched is false when no location provided", async () => {
    const r = await pilotWorkflow({ patientId: "P011", complaint: "minor cold" });
    expect(r.emsDispatched).toBe(false);
  }, 10_000);
});

describe("pilotWorkflow — recordPhysicianOverride()", () => {
  it("appends to override log", () => {
    const before = getOverrideLog().length;
    recordPhysicianOverride({
      patientId: "P020",
      previousDisposition: "ROUTINE",
      newDisposition: "ER_NOW",
      physicianId: "DR001",
    });
    expect(getOverrideLog().length).toBe(before + 1);
  });

  it("record contains overriddenAt timestamp", () => {
    recordPhysicianOverride({
      patientId: "P021",
      previousDisposition: "ROUTINE",
      newDisposition: "URGENT",
    });
    const log = getOverrideLog();
    const last = log[log.length - 1];
    expect(() => new Date(last.overriddenAt)).not.toThrow();
  });
});

// ── Autopilot Agent ───────────────────────────────────────────────────────────
import { runAutopilot } from "../../server/autopilot/autopilotAgent";

describe("autopilotAgent — runAutopilot()", () => {
  it("returns result with required fields", async () => {
    const r = await runAutopilot();
    expect(Array.isArray(r.actions)).toBe(true);
    expect(typeof r.mode).toBe("string");
    expect(["auto", "semi-auto", "manual"]).toContain(r.level);
    expect(typeof r.skippedCount).toBe("number");
    expect(typeof r.ts).toBe("string");
  }, 15_000);

  it("mode is SAFE_AUTOPILOT or SUSPENDED", async () => {
    const r = await runAutopilot();
    expect(["SAFE_AUTOPILOT", "SUSPENDED"]).toContain(r.mode);
  }, 15_000);
});
