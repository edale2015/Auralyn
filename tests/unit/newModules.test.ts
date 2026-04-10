import { describe, it, expect, vi, beforeEach } from "vitest";

import { listVersions, switchModel, rollbackModel, getModelVersion } from "../../server/ml/modelRegistry";
import { logFeatures, getFeatureLog, getFeatureLogStats, clearFeatureLog, exportFeatureLogNdjson } from "../../server/ml/featureLogger";
import { generateSynthetic } from "../../server/ml/syntheticData";
import { getMLServiceStatus } from "../../server/ml/externalMLClient";
import { getRetrainStats, retrainIfNeeded } from "../../server/ml/retrainScheduler";
import { buildRiskHeatmap, sortByPriority, detectPatterns, getTopRiskComplaint } from "../../server/analytics/riskHeatmap";
import { emitAlert, getRecentAlerts, getAlertStats, clearAlerts } from "../../server/monitoring/alertBus";
import { simulateHospital } from "../../server/simulation/hospitalSimulator";
import { generateDeckMarkdown, generateDeckJson } from "../../server/exec/deckGenerator";
import { getRegions, getHealthyRegion, resetRegionHealth } from "../../server/infra/resilientFetch";

// ── Model Registry ───────────────────────────────────────────────────────────
describe("modelRegistry", () => {
  it("getModelVersion returns current version string", () => {
    expect(typeof getModelVersion()).toBe("string");
  });

  it("switchModel updates current version and adds to history", () => {
    switchModel("logistic-v2.0", "upgraded weights");
    const { current, history } = listVersions();
    expect(current).toBe("logistic-v2.0");
    expect(history.some(h => h.version === "logistic-v2.0")).toBe(true);
  });

  it("rollbackModel reverts to previous version", () => {
    switchModel("test-v99");
    const prev = rollbackModel();
    expect(prev).not.toBeNull();
    expect(getModelVersion()).not.toBe("test-v99");
  });

  it("rollbackModel returns null when only one version exists", () => {
    const { history } = listVersions();
    const before = history.length;
    expect(before).toBeGreaterThanOrEqual(1);
  });
});

// ── Feature Logger ───────────────────────────────────────────────────────────
describe("featureLogger", () => {
  beforeEach(() => clearFeatureLog());

  it("logFeatures stores entry in log", () => {
    const features = { age: 70, sbp: 90, dbp: 60, spo2: 88, hr: 110, rr: 22, temp: 101.2,
      chestPain: 1, sob: 1, diaphoresis: 0, confusion: 0, fever: 1, immunocompromised: 0, ageOver65: 1, ageOver80: 0 };
    logFeatures(features, { admitted: true }, "logistic-v1.0");
    expect(getFeatureLog(10).length).toBe(1);
    expect(getFeatureLog(10)[0].outcome).toEqual({ admitted: true });
  });

  it("getFeatureLogStats counts by model version", () => {
    const f = { age: 40, sbp: 120, dbp: 80, spo2: 98, hr: 72, rr: 14, temp: 98.6,
      chestPain: 0, sob: 0, diaphoresis: 0, confusion: 0, fever: 0, immunocompromised: 0, ageOver65: 0, ageOver80: 0 };
    logFeatures(f, { admitted: false }, "logistic-v1.0");
    logFeatures(f, { admitted: false }, "logistic-v2.0");
    const stats = getFeatureLogStats();
    expect(stats.total).toBe(2);
    expect(stats.byModelVersion["logistic-v1.0"]).toBe(1);
    expect(stats.byModelVersion["logistic-v2.0"]).toBe(1);
  });

  it("exportFeatureLogNdjson returns one JSON line per entry", () => {
    const f = { age: 50, sbp: 110, dbp: 75, spo2: 97, hr: 80, rr: 16, temp: 98.4,
      chestPain: 0, sob: 0, diaphoresis: 0, confusion: 0, fever: 0, immunocompromised: 0, ageOver65: 0, ageOver80: 0 };
    logFeatures(f, {}, "v1");
    logFeatures(f, {}, "v2");
    const lines = exportFeatureLogNdjson().split("\n");
    expect(lines.length).toBe(2);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});

// ── Synthetic Data ───────────────────────────────────────────────────────────
describe("syntheticData — generateSynthetic()", () => {
  it("returns n records", () => {
    const data = generateSynthetic(50);
    expect(data.length).toBe(50);
  });

  it("every record has vitals", () => {
    const data = generateSynthetic(10);
    for (const d of data) {
      expect(d.vitals).toBeDefined();
      expect(typeof d.vitals!.systolicBp).toBe("number");
    }
  });

  it("is deterministic with seed", () => {
    const a = generateSynthetic(20, 42);
    const b = generateSynthetic(20, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces different results with different seeds", () => {
    const a = generateSynthetic(10, 1);
    const b = generateSynthetic(10, 2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

// ── External ML Client ───────────────────────────────────────────────────────
describe("externalMLClient — getMLServiceStatus()", () => {
  it("reports not configured when ML_URL is unset", () => {
    const status = getMLServiceStatus();
    expect(status.configured).toBe(false);
    expect(status.url).toBeNull();
  });
});

// ── Retrain Scheduler ────────────────────────────────────────────────────────
describe("retrainScheduler — retrainIfNeeded()", () => {
  it("does not trigger when accuracy is above threshold", async () => {
    const r = await retrainIfNeeded({ accuracy: 0.95 });
    expect(r.triggered).toBe(false);
  });

  it("does not trigger when insufficient samples", async () => {
    clearFeatureLog();
    const r = await retrainIfNeeded({ accuracy: 0.80 });
    expect(r.triggered).toBe(false);
    expect(r.reason).toMatch(/Insufficient/);
  });

  it("getRetrainStats returns stats object", () => {
    const stats = getRetrainStats();
    expect(typeof stats.retrainCount).toBe("number");
    expect(typeof stats.threshold).toBe("number");
  });
});

// ── Risk Heatmap ─────────────────────────────────────────────────────────────
describe("riskHeatmap — buildRiskHeatmap()", () => {
  it("aggregates by complaint", () => {
    const patients = [
      { complaint: "chest_pain", risk: "high",   riskScore: 3 },
      { complaint: "chest_pain", risk: "high",   riskScore: 3 },
      { complaint: "fever",      risk: "low",    riskScore: 1 },
    ];
    const heatmap = buildRiskHeatmap(patients);
    expect(heatmap["chest_pain"].count).toBe(2);
    expect(heatmap["chest_pain"].totalRisk).toBe(6);
    expect(heatmap["fever"].count).toBe(1);
  });

  it("handles empty patient list", () => {
    expect(buildRiskHeatmap([])).toEqual({});
  });

  it("getTopRiskComplaint returns highest average risk", () => {
    const heatmap = buildRiskHeatmap([
      { complaint: "chest_pain", riskScore: 10 },
      { complaint: "fever",      riskScore: 1 },
    ]);
    const top = getTopRiskComplaint(heatmap);
    expect(top?.key).toBe("chest_pain");
  });
});

describe("riskHeatmap — sortByPriority()", () => {
  it("sorts high risk first", () => {
    const patients = [
      { id: "a", risk: "low",    riskScore: 1 },
      { id: "b", risk: "high",   riskScore: 3 },
      { id: "c", risk: "medium", riskScore: 2 },
    ];
    const sorted = sortByPriority(patients);
    expect(sorted[0].id).toBe("b");
    expect(sorted[2].id).toBe("a");
  });
});

describe("riskHeatmap — detectPatterns()", () => {
  it("returns patterns above threshold", () => {
    const data = Array.from({ length: 200 }, (_, i) => ({
      symptom: i % 3 === 0 ? "chest_pain" : "headache",
    }));
    const patterns = detectPatterns(data, 50);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0][1]).toBeGreaterThanOrEqual(50);
  });

  it("returns nothing when all counts are below threshold", () => {
    const data = [{ symptom: "rare_symptom" }];
    const patterns = detectPatterns(data, 50);
    expect(patterns.length).toBe(0);
  });
});

// ── Alert Bus ────────────────────────────────────────────────────────────────
describe("alertBus — emitAlert() / getRecentAlerts()", () => {
  beforeEach(() => clearAlerts());

  it("stores alerts in buffer", () => {
    emitAlert("test alert", "info", "unit-test");
    const alerts = getRecentAlerts(10);
    expect(alerts.length).toBe(1);
    expect(alerts[0].message).toBe("test alert");
    expect(alerts[0].severity).toBe("info");
    expect(alerts[0].source).toBe("unit-test");
  });

  it("tracks stats by severity", () => {
    emitAlert("info msg",     "info");
    emitAlert("warn msg",     "warn");
    emitAlert("critical msg", "critical");
    const { bySeverity, total } = getAlertStats();
    expect(total).toBe(3);
    expect(bySeverity.info).toBe(1);
    expect(bySeverity.warn).toBe(1);
    expect(bySeverity.critical).toBe(1);
  });

  it("alert IDs are unique and incremental", () => {
    emitAlert("a");
    emitAlert("b");
    const alerts = getRecentAlerts();
    const ids = alerts.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Hospital Simulator ───────────────────────────────────────────────────────
describe("hospitalSimulator — simulateHospital()", () => {
  it("returns correct number of timeline hours", async () => {
    const result = await simulateHospital(24, { seed: 42 });
    expect(result.timeline.length).toBe(24);
    expect(result.hours).toBe(24);
  });

  it("is deterministic with seed", async () => {
    const a = await simulateHospital(24, { seed: 99 });
    const b = await simulateHospital(24, { seed: 99 });
    expect(a.totalPatients).toBe(b.totalPatients);
    expect(a.totalER).toBe(b.totalER);
  });

  it("totalPatients > 0 for 24 hours", async () => {
    const result = await simulateHospital(24, { seed: 1 });
    expect(result.totalPatients).toBeGreaterThan(0);
  });

  it("ER rate is between 0 and 1", async () => {
    const result = await simulateHospital(24, { seed: 5 });
    expect(result.erRate).toBeGreaterThanOrEqual(0);
    expect(result.erRate).toBeLessThanOrEqual(1);
  });

  it("overload triggered when capacity is very small", async () => {
    const result = await simulateHospital(48, { seed: 7, capacity: 10, baseArrivalRate: 50 });
    expect(result.overloadHours).toBeGreaterThan(0);
    expect(result.overloadPct).toBeGreaterThan(0);
  });
});

// ── Deck Generator ───────────────────────────────────────────────────────────
describe("deckGenerator", () => {
  const metrics = {
    patients: 500, erRate: 0.08, accuracy: 0.94,
    p95Latency: 450, safetyMismatchRate: 0.001, uptime: 0.9997,
  };

  it("generateDeckMarkdown includes key sections", () => {
    const md = generateDeckMarkdown(metrics);
    expect(md).toContain("# Auralyn");
    expect(md).toContain("Safety");
    expect(md).toContain("94.0%");
    expect(md).toContain("500");
  });

  it("generateDeckJson returns slides array", () => {
    const deck = generateDeckJson(metrics) as any;
    expect(Array.isArray(deck.slides)).toBe(true);
    expect(deck.slides.length).toBeGreaterThan(0);
    expect(deck.title).toContain("Auralyn");
    expect(deck.generatedAt).toBeTruthy();
  });
});

// ── Resilient Fetch Infrastructure ──────────────────────────────────────────
describe("resilientFetch — region management", () => {
  it("getRegions returns array of regions", () => {
    const regions = getRegions();
    expect(Array.isArray(regions)).toBe(true);
    expect(regions.length).toBeGreaterThan(0);
  });

  it("getHealthyRegion returns first healthy region", () => {
    resetRegionHealth();
    const region = getHealthyRegion();
    expect(region.healthy).toBe(true);
    expect(region.name).toBeTruthy();
  });

  it("resetRegionHealth marks all regions healthy", () => {
    const regions = getRegions();
    regions[0].healthy = false;
    resetRegionHealth();
    expect(regions.every(r => r.healthy)).toBe(true);
  });
});
