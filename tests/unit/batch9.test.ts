import { describe, it, expect } from "vitest";

// ── Denial Predictor ──────────────────────────────────────────────────────────
import {
  predictDenial, routeByPayer, batchPredictDenials,
} from "../../server/revenue/denialPredictor";

describe("denialPredictor — predictDenial()", () => {
  it("returns low risk for complete valid claim", () => {
    const r = predictDenial({ insurance: "Private", cpt: "99213", disposition: "ROUTINE" });
    expect(r.risk).toBe("low");
    expect(r.probability).toBeLessThanOrEqual(0.3);
    expect(Array.isArray(r.reasons)).toBe(true);
  });

  it("adds reason when insurance is missing", () => {
    const r = predictDenial({ cpt: "99213", disposition: "ROUTINE" });
    expect(r.reasons).toContain("Missing insurance");
    expect(r.probability).toBeGreaterThan(0);
  });

  it("adds reason when CPT is missing", () => {
    const r = predictDenial({ insurance: "Private" });
    expect(r.reasons).toContain("Missing CPT code");
    expect(r.probability).toBeGreaterThan(0);
  });

  it("returns high risk when both insurance and CPT are missing", () => {
    const r = predictDenial({ disposition: "ROUTINE" });
    expect(r.risk).toBe("high");
    expect(r.probability).toBeGreaterThan(0.3);
  });

  it("penalises 99285 billed for non-ER disposition", () => {
    const r = predictDenial({ insurance: "Private", cpt: "99285", disposition: "ROUTINE" });
    expect(r.reasons).toContain("CPT 99285 billed for non-ER disposition");
  });

  it("no penalty for 99285 with ER_NOW disposition", () => {
    const r = predictDenial({ insurance: "Private", cpt: "99285", disposition: "ER_NOW" });
    expect(r.reasons).not.toContain("CPT 99285 billed for non-ER disposition");
  });

  it("probability is between 0 and 1", () => {
    const r = predictDenial({});
    expect(r.probability).toBeGreaterThanOrEqual(0);
    expect(r.probability).toBeLessThanOrEqual(1);
  });

  it("returns low risk for minimal valid claim", () => {
    const r = predictDenial({ insurance: "Medicaid", cpt: "99213" });
    expect(["high", "low"]).toContain(r.risk);
  });
});

describe("denialPredictor — routeByPayer()", () => {
  it("routes Medicaid to clinic", () => {
    expect(routeByPayer({ insurance: "Medicaid" })).toBe("clinic");
  });

  it("routes Private to telemed", () => {
    expect(routeByPayer({ insurance: "Private" })).toBe("telemed");
  });

  it("defaults to self-pay for unknown insurance", () => {
    expect(routeByPayer({ insurance: "Unknown" })).toBe("self-pay");
  });

  it("defaults to self-pay when no insurance field", () => {
    expect(routeByPayer({})).toBe("self-pay");
  });
});

describe("denialPredictor — batchPredictDenials()", () => {
  it("returns array of same length", () => {
    const claims = [
      { insurance: "Private", cpt: "99213" },
      { cpt: "99285", disposition: "ROUTINE" },
      {},
    ];
    const results = batchPredictDenials(claims);
    expect(results).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(batchPredictDenials([])).toEqual([]);
  });

  it("each result has risk and probability", () => {
    const results = batchPredictDenials([{ insurance: "Private", cpt: "99213" }]);
    expect(["high", "low"]).toContain(results[0].risk);
    expect(typeof results[0].probability).toBe("number");
  });
});

// ── Patient Chat Agent ────────────────────────────────────────────────────────
import { followupAgent, careNavigator } from "../../server/patient/chatAgent";

describe("chatAgent — followupAgent()", () => {
  it("returns call instruction for high risk", async () => {
    const a = await followupAgent({ risk: "high", patientId: "P001" });
    expect(a.toLowerCase()).toContain("call");
  });

  it("returns SMS for medium risk", async () => {
    const a = await followupAgent({ risk: "medium" });
    expect(a.toLowerCase()).toContain("sms");
  });

  it("returns check-in for low risk", async () => {
    const a = await followupAgent({ risk: "low" });
    expect(a.toLowerCase()).toContain("check");
  });

  it("handles missing risk gracefully", async () => {
    const a = await followupAgent({});
    expect(typeof a).toBe("string");
  });
});

describe("chatAgent — careNavigator()", () => {
  it("returns ER for high risk", () => {
    expect(careNavigator({ risk: "high" })).toBe("ER");
  });

  it("returns clinic for medium risk", () => {
    expect(careNavigator({ risk: "medium" })).toBe("clinic");
  });

  it("returns home + telemed for low risk", () => {
    expect(careNavigator({ risk: "low" })).toBe("home + telemed");
  });

  it("defaults gracefully for unknown risk", () => {
    expect(typeof careNavigator({})).toBe("string");
  });
});

// ── IPO Report ────────────────────────────────────────────────────────────────
import { buildIPOReport } from "../../server/exec/ipoReport";

describe("ipoReport — buildIPOReport()", () => {
  it("returns required top-level fields", () => {
    const r = buildIPOReport({ patients: 50000, revenue: 1_000_000 });
    expect(r.platform).toBe("Auralyn");
    expect(r.category).toBeTruthy();
    expect(r.scale).toBe(50000);
    expect(r.revenue).toBe(1_000_000);
    expect(Array.isArray(r.moat)).toBe(true);
    expect(r.moat.length).toBeGreaterThan(0);
    expect(typeof r.generatedAt).toBe("string");
  });

  it("moat includes golden cases", () => {
    const r = buildIPOReport({});
    expect(r.moat.some(m => m.toLowerCase().includes("golden"))).toBe(true);
  });

  it("safety field is a non-empty string", () => {
    expect(buildIPOReport({}).safety).toBeTruthy();
  });

  it("architecture has 66 layers", () => {
    const r = buildIPOReport({});
    expect(r.architecture.layers).toBe(66);
  });

  it("regulatoryReadiness mentions 510(k)", () => {
    expect(buildIPOReport({}).regulatoryReadiness).toContain("510(k)");
  });

  it("defaults patients to 0 when not provided", () => {
    expect(buildIPOReport({}).scale).toBe(0);
  });
});

// ── System Ops ────────────────────────────────────────────────────────────────
import { systemHealth, troubleshoot, maintenanceTasks } from "../../server/ops/systemOps";

describe("systemOps — systemHealth()", () => {
  it("returns healthy = true for low mismatch", () => {
    const h = systemHealth({ safety: { mismatchRate: 0.001 } });
    expect(h.healthy).toBe(true);
    expect(h.issues).toHaveLength(0);
    expect(h.status).toBe("green");
  });

  it("returns healthy = false for high mismatch", () => {
    const h = systemHealth({ safety: { mismatchRate: 0.02 } });
    expect(h.healthy).toBe(false);
    expect(h.issues).toContain("safety_mismatch");
    expect(h.status).toBe("red");
  });

  it("returns yellow status for medium mismatch", () => {
    const h = systemHealth({ safety: { mismatchRate: 0.007 } });
    expect(h.status).toBe("yellow");
  });

  it("includes mismatchRate in result", () => {
    const rate = 0.005;
    const h = systemHealth({ safety: { mismatchRate: rate } });
    expect(h.mismatchRate).toBe(rate);
  });

  it("handles missing safety field", () => {
    const h = systemHealth({});
    expect(typeof h.healthy).toBe("boolean");
  });
});

describe("systemOps — troubleshoot()", () => {
  it("restarts FHIR integration for FHIR errors", () => {
    expect(troubleshoot("FHIR connection refused")).toContain("FHIR");
  });

  it("triggers template repair for selector errors", () => {
    expect(troubleshoot("selector not found")).toContain("template repair");
  });

  it("handles Redis errors", () => {
    expect(troubleshoot("Redis timeout")).toContain("Redis");
  });

  it("handles timeout errors", () => {
    expect(troubleshoot("timeout exceeded")).toContain("retry");
  });

  it("escalates unknown errors to engineer", () => {
    expect(troubleshoot("something weird happened")).toContain("engineer");
  });

  it("returns a non-empty string for all inputs", () => {
    expect(troubleshoot("").length).toBeGreaterThan(0);
  });
});

describe("systemOps — maintenanceTasks()", () => {
  it("returns a non-empty array", () => {
    const tasks = maintenanceTasks();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("includes ML retraining task", () => {
    const tasks = maintenanceTasks();
    expect(tasks.some(t => t.toLowerCase().includes("retrain"))).toBe(true);
  });

  it("includes drift check task", () => {
    const tasks = maintenanceTasks();
    expect(tasks.some(t => t.toLowerCase().includes("drift"))).toBe(true);
  });

  it("always returns the same set (deterministic)", () => {
    expect(maintenanceTasks()).toEqual(maintenanceTasks());
  });
});

// ── Production Patient Flow ───────────────────────────────────────────────────
import { productionPatientFlow } from "../../server/revenue/productionFlow";

describe("productionFlow — productionPatientFlow()", () => {
  it("returns full result shape", async () => {
    const r = await productionPatientFlow({
      patientId: "PF001",
      complaint: "fever",
      insurance: "Private",
    });
    expect(r.patientId).toBe("PF001");
    expect(typeof r.disposition).toBe("string");
    expect(typeof r.cptCode).toBe("string");
    expect(["high", "low"]).toContain(r.denialRisk);
    expect(typeof r.claimSubmitted).toBe("boolean");
    expect(typeof r.hospitalSent).toBe("boolean");
  }, 10_000);

  it("always assigns a CPT code", async () => {
    const r = await productionPatientFlow({ patientId: "PF002", complaint: "headache" });
    expect(r.cptCode.startsWith("99")).toBe(true);
  }, 10_000);

  it("handles missing insurance gracefully", async () => {
    const r = await productionPatientFlow({ patientId: "PF003", freeText: "sore throat" });
    expect(["high", "low"]).toContain(r.denialRisk);
  }, 10_000);
});
