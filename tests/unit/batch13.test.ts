import { describe, it, expect, beforeEach } from "vitest";

// ── Branch Workflow Runner ────────────────────────────────────────────────────
import { runBranchWorkflow, type BranchNode } from "../../server/workflows/branchRunner";
import { registerStep, clearSteps } from "../../server/workflows/registry";

describe("branchRunner — runBranchWorkflow()", () => {
  beforeEach(() => {
    clearSteps();
    registerStep("setLow",     i => ({ ...i, risk: "low" }));
    registerStep("setHigh",    i => ({ ...i, risk: "high" }));
    registerStep("notifyER",   i => ({ ...i, erNotified: true }));
    registerStep("notifyOk",   i => ({ ...i, okNotified: true }));
    registerStep("addX",       i => ({ ...i, x: 1 }));
    registerStep("addY",       i => ({ ...i, y: 2 }));
  });

  it("runs a straight-line workflow (no branching)", async () => {
    const nodes: BranchNode[] = [
      { id: "a", name: "addX", next: "b" },
      { id: "b", name: "addY" },
    ];
    const r = await runBranchWorkflow(nodes, "a", {});
    expect(r.x).toBe(1);
    expect(r.y).toBe(2);
  });

  it("takes then-branch when condition matches", async () => {
    const nodes: BranchNode[] = [
      { id: "a", name: "setHigh", if: { field: "risk", equals: "high", then: "b", else: "c" } },
      { id: "b", name: "notifyER" },
      { id: "c", name: "notifyOk" },
    ];
    const r = await runBranchWorkflow(nodes, "a", {});
    expect(r.erNotified).toBe(true);
    expect(r.okNotified).toBeUndefined();
  });

  it("takes else-branch when condition does not match", async () => {
    const nodes: BranchNode[] = [
      { id: "a", name: "setLow", if: { field: "risk", equals: "high", then: "b", else: "c" } },
      { id: "b", name: "notifyER" },
      { id: "c", name: "notifyOk" },
    ];
    const r = await runBranchWorkflow(nodes, "a", {});
    expect(r.okNotified).toBe(true);
    expect(r.erNotified).toBeUndefined();
  });

  it("throws for unknown step", async () => {
    const nodes: BranchNode[] = [{ id: "a", name: "doesNotExist" }];
    await expect(runBranchWorkflow(nodes, "a", {})).rejects.toThrow("Missing step");
  });

  it("stops at end of chain (no next)", async () => {
    const nodes: BranchNode[] = [{ id: "a", name: "addX" }];
    const r = await runBranchWorkflow(nodes, "a", {});
    expect(r.x).toBe(1);
  });

  it("stops gracefully when else-branch is not defined", async () => {
    const nodes: BranchNode[] = [
      { id: "a", name: "setLow", if: { field: "risk", equals: "high", then: "b" } },
      { id: "b", name: "notifyER" },
    ];
    const r = await runBranchWorkflow(nodes, "a", {});
    expect(r.erNotified).toBeUndefined();
  });

  it("preserves input context through steps", async () => {
    const nodes: BranchNode[] = [
      { id: "a", name: "addX", next: "b" },
      { id: "b", name: "addY" },
    ];
    const r = await runBranchWorkflow(nodes, "a", { seed: 99 });
    expect(r.seed).toBe(99);
  });
});

// ── Clinic Queue ──────────────────────────────────────────────────────────────
import { addPatient, nextPatient, peekQueue, queueLength, clearQueue } from "../../server/patient/clinicQueue";

describe("clinicQueue", () => {
  beforeEach(() => clearQueue());

  it("adds a patient and increments length", () => {
    addPatient({ id: "P001", risk: "high" });
    expect(queueLength()).toBe(1);
  });

  it("nextPatient returns earliest patient (FIFO)", () => {
    addPatient({ id: "P001", ts: 1000 });
    addPatient({ id: "P002", ts: 500 });
    const p = nextPatient();
    expect(p?.id).toBe("P002");
  });

  it("nextPatient removes patient from queue", () => {
    addPatient({ id: "P001" });
    nextPatient();
    expect(queueLength()).toBe(0);
  });

  it("nextPatient returns undefined when empty", () => {
    expect(nextPatient()).toBeUndefined();
  });

  it("peekQueue does not remove patients", () => {
    addPatient({ id: "P001" });
    peekQueue();
    expect(queueLength()).toBe(1);
  });

  it("peekQueue returns sorted array", () => {
    addPatient({ id: "A", ts: 2000 });
    addPatient({ id: "B", ts: 1000 });
    const peek = peekQueue();
    expect(peek[0].id).toBe("B");
    expect(peek[1].id).toBe("A");
  });

  it("addPatient assigns ts when not provided", () => {
    const p = addPatient({ id: "P001" });
    expect(typeof p.ts).toBe("number");
    expect(p.ts).toBeGreaterThan(0);
  });

  it("clearQueue empties the queue", () => {
    addPatient({ id: "P001" });
    addPatient({ id: "P002" });
    clearQueue();
    expect(queueLength()).toBe(0);
  });
});

// ── High Autonomy ─────────────────────────────────────────────────────────────
import { runHighAutonomy } from "../../server/autonomy/highAutonomy";

describe("highAutonomy — runHighAutonomy()", () => {
  it("returns level, plan, and executed", async () => {
    const r = await runHighAutonomy({});
    expect(r).toHaveProperty("level");
    expect(r).toHaveProperty("plan");
    expect(r).toHaveProperty("executed");
  });

  it("plan includes retrain when ML drift is true", async () => {
    const r = await runHighAutonomy({ ml: { drift: true } });
    expect(r.plan).toContain("retrain");
  });

  it("plan includes scale_workers when queue > 50", async () => {
    const r = await runHighAutonomy({ infrastructure: { queueDepth: 100 } });
    expect(r.plan).toContain("scale_workers");
  });

  it("executes nothing in manual mode (high mismatch rate)", async () => {
    const r = await runHighAutonomy({ safety: { mismatchRate: 0.1 }, ml: { drift: true } });
    expect(r.level).toBe("manual");
    expect(r.executed).toHaveLength(0);
  });

  it("assist mode executes only validate_templates", async () => {
    const r = await runHighAutonomy({ ml: { drift: true }, safety: { mismatchRate: 0 } });
    expect(r.level).toBe("assist");
    expect(r.executed.every((a: string) => a === "validate_templates")).toBe(true);
  });

  it("plan defaults to validate_templates when no signals", async () => {
    const r = await runHighAutonomy({});
    expect(r.plan).toContain("validate_templates");
  });
});

// ── Followup Utils ────────────────────────────────────────────────────────────
import {
  secondaryToModifiers, smartFollowup, dashboardInsights,
  safeExternalCall, enqueueNonCritical, drainNonCriticalQueue,
} from "../../server/clinical/followupUtils";

describe("followupUtils — secondaryToModifiers()", () => {
  it("chest_pain smoker → riskFactors=yes", () => {
    expect(secondaryToModifiers({ complaint: "chest_pain", smoker: true })).toEqual({ riskFactors: "yes" });
  });

  it("chest_pain non-smoker → riskFactors=no", () => {
    expect(secondaryToModifiers({ complaint: "chest_pain", smoker: false })).toEqual({ riskFactors: "no" });
  });

  it("unknown complaint → empty object", () => {
    expect(secondaryToModifiers({ complaint: "headache" })).toEqual({});
  });

  it("no complaint → empty object", () => {
    expect(secondaryToModifiers({})).toEqual({});
  });
});

describe("followupUtils — smartFollowup()", () => {
  it("fever → check temp in 6h", () => {
    expect(smartFollowup({ complaint: "fever" })).toBe("Check temp in 6h");
  });

  it("chest_pain → call if worsening immediately", () => {
    expect(smartFollowup({ complaint: "chest_pain" })).toBe("Call if worsening immediately");
  });

  it("cough → monitor O2 12h", () => {
    expect(smartFollowup({ complaint: "cough" })).toBe("Monitor O2 sat 12h");
  });

  it("unknown → 24h check", () => {
    expect(smartFollowup({ complaint: "earache" })).toBe("24h check");
    expect(smartFollowup({})).toBe("24h check");
  });
});

describe("followupUtils — dashboardInsights()", () => {
  it("flags high latency", () => {
    expect(dashboardInsights({ latency: 3000 })).toContain("Latency high");
  });

  it("flags high ER rate", () => {
    expect(dashboardInsights({ erRate: 0.3 })).toContain("High ER rate");
  });

  it("flags safety mismatch spike", () => {
    expect(dashboardInsights({ safetyMismatchRate: 0.05 })).toContain("Safety mismatch spike");
  });

  it("flags critical queue depth", () => {
    expect(dashboardInsights({ queueDepth: 200 })).toContain("Queue depth critical");
  });

  it("returns empty array when all metrics healthy", () => {
    expect(dashboardInsights({ latency: 100, erRate: 0.1, safetyMismatchRate: 0, queueDepth: 5 })).toHaveLength(0);
  });

  it("returns multiple insights for multiple thresholds", () => {
    const i = dashboardInsights({ latency: 9000, erRate: 0.9 });
    expect(i.length).toBeGreaterThanOrEqual(2);
  });
});

describe("followupUtils — safeExternalCall()", () => {
  it("returns result on success", async () => {
    const r = await safeExternalCall(async () => ({ ok: true }), {});
    expect((r as any).ok).toBe(true);
  });

  it("queues and returns {queued:true} on failure", async () => {
    const r = await safeExternalCall(async () => { throw new Error("network"); }, { data: 1 });
    expect((r as any).queued).toBe(true);
  });
});

describe("followupUtils — enqueueNonCritical() + drainNonCriticalQueue()", () => {
  it("enqueues and drains items", () => {
    enqueueNonCritical({ fnName: "testFn", payload: { x: 1 } });
    const drained = drainNonCriticalQueue();
    expect(drained.some(d => d.fnName === "testFn")).toBe(true);
  });

  it("drain empties the queue", () => {
    enqueueNonCritical({ fnName: "fn", payload: {} });
    drainNonCriticalQueue();
    expect(drainNonCriticalQueue()).toHaveLength(0);
  });
});
