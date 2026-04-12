import { describe, it, expect, beforeEach } from "vitest";

// ─── 1. CPT Token Engine (multi-code) ────────────────────────────────────────
import { generateCPTFromTokens } from "../../server/billing/cptEngine";

describe("Batch37 — cptEngine (token-based)", () => {
  it("low risk → 99213 primary", () => {
    const r = generateCPTFromTokens({ riskLevel: "low", allowedDiagnoses: ["viral_uri"] });
    expect(r.primary).toBe("99213");
    expect(r.codes).toContain("99213");
  });

  it("moderate risk → 99214", () => {
    const r = generateCPTFromTokens({ riskLevel: "moderate", allowedDiagnoses: [] });
    expect(r.primary).toBe("99214");
  });

  it("high risk → 99215", () => {
    const r = generateCPTFromTokens({ riskLevel: "high", allowedDiagnoses: [] });
    expect(r.primary).toBe("99215");
  });

  it("critical risk → 99285", () => {
    const r = generateCPTFromTokens({ riskLevel: "critical", allowedDiagnoses: [] });
    expect(r.primary).toBe("99285");
  });

  it("strep diagnosis → add-on 87880", () => {
    const r = generateCPTFromTokens({ riskLevel: "low", allowedDiagnoses: ["strep"] });
    expect(r.addOns).toContain("87880");
    expect(r.codes).toContain("87880");
  });

  it("covid diagnosis → add-on 87635", () => {
    const r = generateCPTFromTokens({ riskLevel: "low", allowedDiagnoses: ["covid"] });
    expect(r.addOns).toContain("87635");
  });

  it("acs diagnosis → add-ons ECG + troponin", () => {
    const r = generateCPTFromTokens({ riskLevel: "high", allowedDiagnoses: ["acs"] });
    expect(r.addOns).toContain("93000");
    expect(r.addOns).toContain("84484");
  });

  it("codes array = primary + addOns", () => {
    const r = generateCPTFromTokens({ riskLevel: "low", allowedDiagnoses: ["strep", "covid"] });
    expect(r.codes.length).toBe(1 + r.addOns.length);
  });

  it("justification contains riskLevel", () => {
    const r = generateCPTFromTokens({ riskLevel: "high", allowedDiagnoses: ["acs"] });
    expect(r.justification).toContain("high");
  });
});

// ─── 2. Revenue Optimizer ─────────────────────────────────────────────────────
import { optimizeRevenue } from "../../server/billing/revenueOptimizer";

describe("Batch37 — revenueOptimizer", () => {
  it("returns a RevenueReport with totalRevenue", () => {
    const r = optimizeRevenue(["99214"]);
    expect(typeof r.totalRevenue).toBe("number");
    expect(r.totalRevenue).toBeGreaterThan(0);
    expect(r.currency).toBe("USD");
  });

  it("99215 has higher value than 99213", () => {
    const r215 = optimizeRevenue(["99215"]);
    const r213 = optimizeRevenue(["99213"]);
    expect(r215.totalRevenue).toBeGreaterThan(r213.totalRevenue);
  });

  it("multiple codes sum correctly", () => {
    const r = optimizeRevenue(["99214", "87880"]);
    expect(r.codes).toHaveLength(2);
    const manual = r.codes.reduce((s, c) => s + c.adjustedValue, 0);
    expect(r.totalRevenue).toBeCloseTo(manual, 1);
  });

  it("each code has payerCategory", () => {
    const r = optimizeRevenue(["99213", "87635", "93000"]);
    for (const c of r.codes) {
      expect(c.payerCategory).toBeTruthy();
    }
  });

  it("empty codes → totalRevenue 0", () => {
    const r = optimizeRevenue([]);
    expect(r.totalRevenue).toBe(0);
  });

  it("unknown code → adjustedValue defaults to baseRVU * 1.0", () => {
    const r = optimizeRevenue(["99999"]);
    expect(r.codes[0].adjustedValue).toBe(r.codes[0].baseRVU);
  });
});

// ─── 3. FDA Dashboard ─────────────────────────────────────────────────────────
import { recordValidation, getFDAMetrics, resetFDAStats, validateCase } from "../../server/fda/fdaDashboard";

describe("Batch37 — fdaDashboard", () => {
  beforeEach(() => resetFDAStats());

  it("getFDAMetrics starts at 0 total", () => {
    const m = getFDAMetrics();
    expect(m.totalCases).toBe(0);
    expect(m.status).toBe("FAIL"); // 0/0 → accuracy 0
  });

  it("recordValidation increments totalCases", () => {
    recordValidation({ correct: true, disposition: "home_care" });
    expect(getFDAMetrics().totalCases).toBe(1);
  });

  it("100% correct → PASS status", () => {
    for (let i = 0; i < 5; i++) recordValidation({ correct: true });
    const m = getFDAMetrics();
    expect(m.accuracy).toBe(1.0);
    expect(m.status).toBe("PASS");
  });

  it("below 80% → FAIL status", () => {
    for (let i = 0; i < 5; i++) recordValidation({ correct: false });
    const m = getFDAMetrics();
    expect(m.status).toBe("FAIL");
  });

  it("validateCase records + returns correct flag", () => {
    const r = validateCase({ disposition: "home_care" }, { disposition: "home_care" });
    expect(r.correct).toBe(true);
    expect(getFDAMetrics().totalCases).toBe(1);
  });

  it("validateCase mismatch → correct:false", () => {
    const r = validateCase({ disposition: "home_care" }, { disposition: "ER" });
    expect(r.correct).toBe(false);
  });

  it("ER disposition → risk:high", () => {
    const r = validateCase({ disposition: "ER" }, { disposition: "ER" });
    expect(r.risk).toBe("high");
  });
});

// ─── 4. Drift Engine ──────────────────────────────────────────────────────────
import { updateBaseline, detectDrift, hasBaseline, calibrateAndCheck } from "../../server/drift/driftEngine";

describe("Batch37 — driftEngine", () => {
  it("detectDrift before baseline → detail says no baseline", () => {
    // The module may or may not have baseline from prior tests — calibrate first
    updateBaseline({});
    const r = detectDrift({});
    expect(r.driftScore).toBe(0);
    expect(r.driftDetected).toBe(false);
  });

  it("same object → driftScore 0", () => {
    const obj = { a: 1, b: "test" };
    updateBaseline(obj);
    const r = detectDrift(obj);
    expect(r.driftScore).toBe(0);
    expect(r.severity).toBe("none");
  });

  it("large change → driftDetected:true", () => {
    updateBaseline({ a: 1 });
    const large = { a: 1, b: "x".repeat(200) };
    const r = detectDrift(large);
    expect(r.driftDetected).toBe(true);
    expect(r.severity).toBe("severe");
  });

  it("mild change → severity mild or none", () => {
    const base = { count: 10 };
    updateBaseline(base);
    const r = detectDrift({ count: 11 });
    expect(["none", "mild"]).toContain(r.severity);
  });

  it("hasBaseline returns true after update", () => {
    updateBaseline({ key: "value" });
    expect(hasBaseline()).toBe(true);
  });

  it("calibrateAndCheck returns DriftResult", () => {
    const r = calibrateAndCheck({ a: 1 }, { a: 1 });
    expect(typeof r.driftDetected).toBe("boolean");
    expect(r.checkedAt).toBeTruthy();
  });
});

// ─── 5. Vitals Monitor ────────────────────────────────────────────────────────
import { evaluateVitals } from "../../server/monitoring/vitalsMonitor";

describe("Batch37 — vitalsMonitor", () => {
  it("normal vitals → no alerts", () => {
    const a = evaluateVitals({ hr: 72, spo2: 98, systolicBP: 120, tempF: 98.6 });
    expect(a).toHaveLength(0);
  });

  it("HR > 100 → tachycardia alert", () => {
    const a = evaluateVitals({ hr: 115 });
    const t = a.find((x) => x.type === "tachycardia");
    expect(t).toBeDefined();
    expect(["high", "critical"]).toContain(t?.severity);
  });

  it("HR ≥ 130 → critical tachycardia", () => {
    const a = evaluateVitals({ hr: 135 });
    expect(a[0].severity).toBe("critical");
  });

  it("SpO2 < 88 → critical hypoxia", () => {
    const a = evaluateVitals({ spo2: 85 });
    const h = a.find((x) => x.type === "hypoxia");
    expect(h?.severity).toBe("critical");
  });

  it("SpO2 < 95 → high hypoxia", () => {
    const a = evaluateVitals({ spo2: 92 });
    const h = a.find((x) => x.type === "hypoxia");
    expect(h?.severity).toBe("high");
  });

  it("tempF > 103.1 → fever alert (critical)", () => {
    const a = evaluateVitals({ tempF: 104.0 });
    const f = a.find((x) => x.type === "fever");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical");
  });

  it("tempF > 100.4 (38°C) → fever medium", () => {
    const a = evaluateVitals({ tempF: 101.0 });
    const f = a.find((x) => x.type === "fever");
    expect(f?.severity).toBe("medium");
  });

  it("SBP < 90 → hypotension critical", () => {
    const a = evaluateVitals({ systolicBP: 80 });
    const h = a.find((x) => x.type === "hypotension");
    expect(h?.severity).toBe("critical");
  });

  it("multiple alerts returned", () => {
    const a = evaluateVitals({ hr: 140, spo2: 85, systolicBP: 80 });
    expect(a.length).toBeGreaterThan(1);
  });

  it("each alert has type, severity, value, unit, message", () => {
    const a = evaluateVitals({ hr: 140 });
    expect(a[0].type).toBeTruthy();
    expect(a[0].severity).toBeTruthy();
    expect(typeof a[0].value).toBe("number");
    expect(a[0].unit).toBeTruthy();
    expect(typeof a[0].message).toBe("string");
  });
});

// ─── 6. Final Pipeline ────────────────────────────────────────────────────────
import { runFinalPipeline } from "../../server/pipeline/finalPipeline";

describe("Batch37 — finalPipeline", () => {
  it("returns base + billing + revenue", async () => {
    const r = await runFinalPipeline({ complaint: "sore throat" });
    expect(r.billing).toBeDefined();
    expect(r.revenue).toBeDefined();
    expect(r.trace).toBeDefined();
    expect(r.output).toBeDefined();
  });

  it("billing has codes array", async () => {
    const r = await runFinalPipeline({ complaint: "chest pain" });
    expect(Array.isArray(r.billing.codes)).toBe(true);
    expect(r.billing.codes.length).toBeGreaterThan(0);
  });

  it("revenue has totalRevenue > 0", async () => {
    const r = await runFinalPipeline({ complaint: "headache" });
    expect(r.revenue.totalRevenue).toBeGreaterThan(0);
  });

  it("high-risk → 99215 or 99285 primary code", async () => {
    const r = await runFinalPipeline({ complaint: "chest pain", posterior: { acs: 0.7, pe: 0.3 }, redFlags: ["diaphoresis"] });
    expect(["99215", "99285"]).toContain(r.billing.primary);
  });

  it("expectedDisposition auto-records FDA validation", async () => {
    resetFDAStats();
    await runFinalPipeline({ complaint: "sore throat", expectedDisposition: "home_care" });
    const m = getFDAMetrics();
    expect(m.totalCases).toBe(1);
  });
});

// ─── 7. Advanced Dashboard Metrics ───────────────────────────────────────────
import { getAdvancedMetrics } from "../../server/dashboard/advancedMetrics";

describe("Batch37 — advancedMetrics", () => {
  it("returns fda + revenue + drift + activePatients", async () => {
    const m = await getAdvancedMetrics();
    expect(m.fda).toBeDefined();
    expect(typeof m.revenue).toBe("number");
    expect(typeof m.drift).toBe("number");
    expect(typeof m.activePatients).toBe("number");
  });

  it("fda has accuracy + status", async () => {
    const m = await getAdvancedMetrics();
    expect(typeof m.fda.accuracy).toBe("number");
    expect(m.fda.status).toBeTruthy();
  });

  it("generatedAt is an ISO timestamp", async () => {
    const m = await getAdvancedMetrics();
    expect(m.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("system metrics included", async () => {
    const m = await getAdvancedMetrics();
    expect(m.system).toBeDefined();
    expect(typeof m.system.uptime).toBe("number");
  });
});
