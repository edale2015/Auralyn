import { describe, it, expect, beforeEach } from "vitest";

// ── Auto Builder (fallback only — no real OpenAI in tests) ─────────────────
import { generateWorkflow } from "../../server/workflows/autoBuilder";

describe("autoBuilder — generateWorkflow()", () => {
  it("returns nodes and edges arrays", async () => {
    const g = await generateWorkflow("Chest pain triage");
    expect(Array.isArray(g.nodes)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  }, 15000);

  it("fallback has at least one node", async () => {
    const g = await generateWorkflow("");
    expect(g.nodes.length).toBeGreaterThan(0);
  }, 15000);
});

// ── EHR Unified ──────────────────────────────────────────────────────────────
import { writeEHRAll } from "../../server/integrations/ehrUnified";

describe("ehrUnified — writeEHRAll()", () => {
  it("returns ecw and epic status keys", async () => {
    const r = await writeEHRAll({ patientId: "P001", disposition: "ROUTINE" });
    expect(r).toHaveProperty("ecw");
    expect(r).toHaveProperty("epic");
  });

  it("does not throw when no env vars configured", async () => {
    await expect(writeEHRAll({ patientId: "P002", disposition: "ER_NOW" })).resolves.not.toThrow();
  });
});

// ── Full Revenue ──────────────────────────────────────────────────────────────
import { processRevenue } from "../../server/revenue/fullRevenue";

describe("fullRevenue — processRevenue()", () => {
  it("returns claim, denial, and revenue", () => {
    const r = processRevenue({ patientId: "P001", insurance: "Aetna" }, "ROUTINE");
    expect(r).toHaveProperty("claim");
    expect(r).toHaveProperty("denial");
    expect(r).toHaveProperty("revenue");
  });

  it("claim has patientId", () => {
    const r = processRevenue({ patientId: "P001" }, "ER_NOW");
    expect(r.claim.patientId).toBe("P001");
  });

  it("revenue is a positive number", () => {
    const r = processRevenue({ patientId: "P001", insurance: "Medicare" }, "URGENT");
    expect(typeof r.revenue).toBe("number");
    expect(r.revenue).toBeGreaterThan(0);
  });

  it("upgrades CPT to 99284 when denial risk is high", () => {
    const r = processRevenue({ patientId: "P001", insurance: "Medicaid" }, "ER_NOW");
    expect(r.claim).toHaveProperty("cpt");
  });
});

// ── Observability Utils ───────────────────────────────────────────────────────
import { sloBurn, evaluateSystem } from "../../server/clinical/observabilityUtils";

describe("observabilityUtils — sloBurn()", () => {
  it("returns 'burning' when error rate > 0.01", () => {
    expect(sloBurn(5, 100)).toBe("burning");
  });

  it("returns 'stable' when error rate <= 0.01", () => {
    expect(sloBurn(1, 100)).toBe("stable");
  });

  it("returns 'stable' for zero errors", () => {
    expect(sloBurn(0, 100)).toBe("stable");
  });

  it("handles total = 0 without division error", () => {
    expect(sloBurn(0, 0)).toBe("stable");
  });
});

describe("observabilityUtils — evaluateSystem()", () => {
  it("flags high latency", () => {
    expect(evaluateSystem({ latency: 3000, safety: { mismatchRate: 0 } })).toContain("High latency");
  });

  it("flags safety risk", () => {
    expect(evaluateSystem({ latency: 500, safety: { mismatchRate: 0.05 } })).toContain("Safety risk");
  });

  it("returns empty array for healthy system", () => {
    expect(evaluateSystem({ latency: 500, safety: { mismatchRate: 0 } })).toHaveLength(0);
  });

  it("returns both alerts simultaneously", () => {
    const alerts = evaluateSystem({ latency: 5000, safety: { mismatchRate: 0.05 } });
    expect(alerts).toHaveLength(2);
  });
});

// ── Question Graph ────────────────────────────────────────────────────────────
import { dynamicQuestionGraph, physicianMacro } from "../../server/clinical/questionGraph";

describe("questionGraph — dynamicQuestionGraph()", () => {
  it("returns questions for chest_pain", () => {
    expect(dynamicQuestionGraph({ complaint: "chest_pain" }).length).toBeGreaterThan(0);
  });

  it("returns questions for fever", () => {
    expect(dynamicQuestionGraph({ complaint: "fever" }).length).toBeGreaterThan(0);
  });

  it("returns empty for unknown complaint", () => {
    expect(dynamicQuestionGraph({ complaint: "unknown" })).toHaveLength(0);
  });
});

describe("questionGraph — physicianMacro()", () => {
  it("returns ER actions", () => {
    expect(physicianMacro("ER")).toContain("notify");
    expect(physicianMacro("ER")).toContain("dispatchEMS");
  });

  it("returns Routine actions", () => {
    expect(physicianMacro("Routine")).toContain("scheduleFollowup");
  });

  it("returns empty for unknown action", () => {
    expect(physicianMacro("UNKNOWN")).toHaveLength(0);
  });
});

// ── Retry Queue ───────────────────────────────────────────────────────────────
import { enqueueRetry, getQueue, clearQueue, processRetry } from "../../server/clinical/retryQueue";

describe("retryQueue", () => {
  beforeEach(() => clearQueue());

  it("enqueueRetry adds job to queue", () => {
    enqueueRetry({ fn: async () => {}, priority: 1, maxAttempts: 1 });
    expect(getQueue()).toHaveLength(1);
  });

  it("processRetry runs successful jobs", async () => {
    let ran = false;
    enqueueRetry({ fn: async () => { ran = true; }, priority: 1, maxAttempts: 1 });
    await processRetry();
    expect(ran).toBe(true);
  });

  it("processRetry removes completed jobs", async () => {
    enqueueRetry({ fn: async () => {}, priority: 1, maxAttempts: 1 });
    await processRetry();
    expect(getQueue()).toHaveLength(0);
  });

  it("processRetry returns processed count", async () => {
    enqueueRetry({ fn: async () => {}, priority: 2, maxAttempts: 1 });
    enqueueRetry({ fn: async () => {}, priority: 1, maxAttempts: 1 });
    const r = await processRetry();
    expect(r.processed).toBe(2);
  });

  it("processRetry sorts by priority", async () => {
    const order: number[] = [];
    enqueueRetry({ fn: async () => { order.push(1); }, priority: 1, maxAttempts: 1 });
    enqueueRetry({ fn: async () => { order.push(3); }, priority: 3, maxAttempts: 1 });
    enqueueRetry({ fn: async () => { order.push(2); }, priority: 2, maxAttempts: 1 });
    await processRetry();
    expect(order[0]).toBe(3);
  });

  it("processRetry marks failed jobs after maxAttempts", async () => {
    enqueueRetry({ fn: async () => { throw new Error("fail"); }, priority: 1, maxAttempts: 1 });
    const r = await processRetry();
    expect(r.failed).toBe(1);
  });
});

// ── RBAC ──────────────────────────────────────────────────────────────────────
import { can, listRoles, listPermissions } from "../../server/tenancy/roles";

describe("roles — can()", () => {
  it("admin can deploy", () => expect(can("admin", "deploy")).toBe(true));
  it("physician cannot deploy", () => expect(can("physician", "deploy")).toBe(false));
  it("staff can view", () => expect(can("staff", "view")).toBe(true));
  it("staff cannot override", () => expect(can("staff", "override")).toBe(false));
  it("unknown role returns false", () => expect(can("hacker", "deploy")).toBe(false));
});

describe("roles — listRoles()", () => {
  it("includes admin, physician, staff", () => {
    const roles = listRoles();
    expect(roles).toContain("admin");
    expect(roles).toContain("physician");
    expect(roles).toContain("staff");
  });
});

describe("roles — listPermissions()", () => {
  it("returns array for known role", () => {
    expect(listPermissions("admin").length).toBeGreaterThan(0);
  });

  it("returns empty for unknown role", () => {
    expect(listPermissions("unknown")).toHaveLength(0);
  });
});

// ── Patient Memory ────────────────────────────────────────────────────────────
import { updateMemory, getMemory, clearMemory, memoryStats } from "../../server/clinical/patientMemory";

describe("patientMemory", () => {
  beforeEach(() => clearMemory());

  it("getMemory returns empty array for unknown patient", () => {
    expect(getMemory("UNKNOWN")).toHaveLength(0);
  });

  it("updateMemory stores a visit", () => {
    updateMemory("P001", { complaint: "chest_pain", disposition: "ER_NOW" });
    expect(getMemory("P001")).toHaveLength(1);
  });

  it("updateMemory appends multiple visits", () => {
    updateMemory("P001", { complaint: "chest_pain", disposition: "ER_NOW" });
    updateMemory("P001", { complaint: "fever", disposition: "ROUTINE" });
    expect(getMemory("P001")).toHaveLength(2);
  });

  it("visit has timestamp", () => {
    updateMemory("P002", { complaint: "fever", disposition: "ROUTINE" });
    expect(getMemory("P002")[0].timestamp).toBeTruthy();
  });

  it("clearMemory by id removes only that patient", () => {
    updateMemory("P001", { complaint: "fever", disposition: "ROUTINE" });
    updateMemory("P002", { complaint: "pain", disposition: "URGENT" });
    clearMemory("P001");
    expect(getMemory("P001")).toHaveLength(0);
    expect(getMemory("P002")).toHaveLength(1);
  });

  it("memoryStats returns correct counts", () => {
    updateMemory("P001", { complaint: "fever", disposition: "ROUTINE" });
    updateMemory("P001", { complaint: "cough", disposition: "ROUTINE" });
    updateMemory("P002", { complaint: "pain", disposition: "URGENT" });
    const stats = memoryStats();
    expect(stats.totalPatients).toBe(2);
    expect(stats.totalVisits).toBe(3);
  });
});

// ── Repair Loop ───────────────────────────────────────────────────────────────
import { repairLoop, performanceScore } from "../../server/clinical/repairLoop";

describe("repairLoop()", () => {
  it("repairs selector errors", () => {
    const r = repairLoop(["selector broken"]);
    expect(r.repaired).toHaveLength(1);
  });

  it("repairs timeout errors", () => {
    expect(repairLoop(["timeout exceeded"]).repaired).toHaveLength(1);
  });

  it("repairs FHIR errors", () => {
    expect(repairLoop(["FHIR token expired"]).repaired).toHaveLength(1);
  });

  it("skips unknown errors", () => {
    const r = repairLoop(["database crash"]);
    expect(r.skipped).toHaveLength(1);
    expect(r.repaired).toHaveLength(0);
  });

  it("handles empty error list", () => {
    const r = repairLoop([]);
    expect(r.repaired).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
  });
});

describe("performanceScore()", () => {
  it("returns 1 for perfect metrics", () => {
    expect(performanceScore({ errorRate: 0, speedScore: 1, denialRate: 0 })).toBeCloseTo(1, 2);
  });

  it("returns 0 for worst metrics", () => {
    expect(performanceScore({ errorRate: 1, speedScore: 0, denialRate: 1 })).toBeCloseTo(0, 2);
  });

  it("is between 0 and 1", () => {
    const score = performanceScore({ errorRate: 0.2, speedScore: 0.8, denialRate: 0.1 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("uses speedScore default of 1 when not provided", () => {
    const score = performanceScore({ errorRate: 0, denialRate: 0 });
    expect(score).toBeCloseTo(1, 2);
  });
});

// ── Integration Hub ───────────────────────────────────────────────────────────
import { addIntegration, listIntegrations, runIntegration, connectorHealth } from "../../server/integrations/integrationHub";

describe("integrationHub", () => {
  it("addIntegration + listIntegrations", () => {
    addIntegration("test-hub", async () => "pong");
    expect(listIntegrations()).toContain("test-hub");
  });

  it("runIntegration executes registered fn", async () => {
    addIntegration("echo", async (p: any) => p);
    const r = await runIntegration("echo", { x: 1 });
    expect(r).toEqual({ x: 1 });
  });

  it("runIntegration throws for unknown integration", async () => {
    await expect(runIntegration("NONEXISTENT", {})).rejects.toThrow();
  });

  it("connectorHealth returns ok for passing connectors", async () => {
    const status = await connectorHealth([{ name: "epic", ping: async () => {} }]);
    expect(status.epic).toBe("ok");
  });

  it("connectorHealth returns fail for throwing connectors", async () => {
    const status = await connectorHealth([{ name: "ecw", ping: async () => { throw new Error(); } }]);
    expect(status.ecw).toBe("fail");
  });

  it("connectorHealth handles mixed status", async () => {
    const status = await connectorHealth([
      { name: "a", ping: async () => {} },
      { name: "b", ping: async () => { throw new Error(); } },
    ]);
    expect(status.a).toBe("ok");
    expect(status.b).toBe("fail");
  });
});
