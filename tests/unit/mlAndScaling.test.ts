import { describe, it, expect } from "vitest";
import { buildFeatures, normalizeFeatures } from "../../server/ml/featureStore";
import { predictAdmission, dataDrift, explainPrediction } from "../../server/ml/admissionModel";
import { enforceLatencyBudget, retryWithJitter } from "../../server/performance/latencyBudget";
import { shouldUseNewModel, assignExperiment, canaryDecide } from "../../server/performance/canaryRouter";
import { getPolicy, setPolicy, isPolicyEnabled, getPoliciesForContext, globalKillSwitch, getAllPolicies } from "../../server/clinical/policyEngine";
import { generateExecBrief, buildFdaPack, buildPitchDeck } from "../../server/reporting/execBrief";
import { ingestNdjson, ingestCsv } from "../../server/ingest/bulkIngest";
import path from "path";
import fs from "fs";
import os from "os";

// ── Feature Store ────────────────────────────────────────────────────────────
describe("featureStore — buildFeatures()", () => {
  it("extracts numeric features from structured input", () => {
    const f = buildFeatures({
      ageYears: 72,
      complaint: "chest pain",
      vitals: { systolicBp: 90, oxygenSaturation: 88, heartRate: 110, respiratoryRate: 24, temperature: 101.5 },
    });
    expect(f.ageOver65).toBe(1);
    expect(f.chestPain).toBe(1);
    expect(f.sbp).toBe(90);
    expect(f.spo2).toBe(88);
    expect(f.fever).toBe(1);
  });

  it("returns safe defaults for empty input", () => {
    const f = buildFeatures({});
    expect(f.age).toBe(0);
    expect(f.sbp).toBe(120);
    expect(f.spo2).toBe(98);
    expect(f.chestPain).toBe(0);
    expect(f.ageOver65).toBe(0);
    expect(f.ageOver80).toBe(0);
  });

  it("detects SOB from symptoms text", () => {
    const f = buildFeatures({ symptoms: "shortness of breath at rest" });
    expect(f.sob).toBe(1);
  });

  it("normalizeFeatures() returns numeric record", () => {
    const f = buildFeatures({ ageYears: 81, vitals: { systolicBp: 80 } });
    const n = normalizeFeatures(f);
    expect(typeof n.age).toBe("number");
    expect(typeof n.sbp).toBe("number");
    expect(n.ageOver80).toBe(1);
  });
});

// ── Admission Model ──────────────────────────────────────────────────────────
describe("admissionModel — predictAdmission()", () => {
  it("returns high risk for elderly patient with chest pain + low spo2", () => {
    const r = predictAdmission({
      ageYears: 78,
      complaint: "chest pain",
      vitals: { systolicBp: 85, oxygenSaturation: 88, heartRate: 115, respiratoryRate: 26 },
    });
    expect(r.risk).toBe("high");
    expect(r.probability).toBeGreaterThan(0.7);
    expect(r.topFactors.length).toBeGreaterThan(0);
    expect(r.modelVersion).toMatch(/logistic/);
  });

  it("returns low risk for healthy young patient", () => {
    const r = predictAdmission({
      ageYears: 28,
      complaint: "sore throat",
      vitals: { systolicBp: 120, oxygenSaturation: 99, heartRate: 72, respiratoryRate: 14, temperature: 98.6 },
    });
    expect(r.risk).toBe("low");
    expect(r.probability).toBeLessThan(0.4);
  });

  it("probability is in [0, 1]", () => {
    for (const age of [10, 40, 70, 90]) {
      const r = predictAdmission({ ageYears: age });
      expect(r.probability).toBeGreaterThanOrEqual(0);
      expect(r.probability).toBeLessThanOrEqual(1);
    }
  });

  it("explainPrediction() returns weights, features, normalized", () => {
    const ex = explainPrediction({ ageYears: 60, complaint: "chest pain" });
    expect(ex.weights).toBeDefined();
    expect(ex.features.chestPain).toBe(1);
    expect(ex.normalized).toBeDefined();
  });
});

// ── Data Drift ───────────────────────────────────────────────────────────────
describe("admissionModel — dataDrift()", () => {
  it("detects drift when spo2 mean shifts significantly", () => {
    const baseline = Array.from({ length: 10 }, () => ({ vitals: { oxygenSaturation: 98 } }));
    const current  = Array.from({ length: 10 }, () => ({ vitals: { oxygenSaturation: 91 } }));
    const r = dataDrift(baseline, current);
    expect(r.drift).toBe(true);
    expect(r.delta).toBeGreaterThan(3);
  });

  it("no drift for stable populations", () => {
    const stable = Array.from({ length: 10 }, () => ({ vitals: { oxygenSaturation: 98 } }));
    const r = dataDrift(stable, stable);
    expect(r.drift).toBe(false);
  });
});

// ── Latency Budget ───────────────────────────────────────────────────────────
describe("latencyBudget — enforceLatencyBudget()", () => {
  it("returns degrade=false for fast paths", () => {
    const r = enforceLatencyBudget(Date.now(), 5000);
    expect(r.degrade).toBe(false);
    expect(r.elapsed).toBeGreaterThanOrEqual(0);
  });

  it("returns degrade=true when start is far in the past", () => {
    const r = enforceLatencyBudget(Date.now() - 3000, 1000);
    expect(r.degrade).toBe(true);
    expect(r.reason).toBe("latency_budget_exceeded");
  });
});

describe("latencyBudget — retryWithJitter()", () => {
  it("resolves on first success", async () => {
    const res = await retryWithJitter(() => Promise.resolve(42));
    expect(res).toBe(42);
  });

  it("retries on failure and eventually resolves", async () => {
    let attempts = 0;
    const res = await retryWithJitter(async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    }, { maxAttempts: 3, baseDelayMs: 1 });
    expect(res).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws after exhausting all attempts", async () => {
    await expect(
      retryWithJitter(() => Promise.reject(new Error("persistent")), { maxAttempts: 2, baseDelayMs: 1 })
    ).rejects.toThrow("persistent");
  });
});

// ── Canary Router ────────────────────────────────────────────────────────────
describe("canaryRouter — shouldUseNewModel()", () => {
  it("is deterministic for same patientId", () => {
    const a = shouldUseNewModel("patient-123", 0.5);
    const b = shouldUseNewModel("patient-123", 0.5);
    expect(a).toBe(b);
  });

  it("approaches 0% rollout at pct=0", () => {
    const results = Array.from({ length: 100 }, (_, i) => shouldUseNewModel(`p-${i}`, 0));
    expect(results.every(r => !r)).toBe(true);
  });

  it("approaches 100% rollout at pct=1", () => {
    const results = Array.from({ length: 100 }, (_, i) => shouldUseNewModel(`p-${i}`, 1));
    expect(results.every(r => r)).toBe(true);
  });
});

describe("canaryRouter — assignExperiment()", () => {
  it("is deterministic", () => {
    const a = assignExperiment("user-abc", "exp-1");
    const b = assignExperiment("user-abc", "exp-1");
    expect(a).toBe(b);
  });

  it("returns control or treatment", () => {
    const result = assignExperiment("user-xyz", "exp-2");
    expect(["control", "treatment"]).toContain(result);
  });
});

describe("canaryRouter — canaryDecide()", () => {
  it("picks new function when rollout = 1.0", () => {
    const r = canaryDecide("known-new", { rolloutPct: 1.0, newFn: () => "new", oldFn: () => "old" });
    expect(r.result).toBe("new");
    expect(r.variant).toBe("new");
  });

  it("picks old function when rollout = 0.0", () => {
    const r = canaryDecide("known-old", { rolloutPct: 0.0, newFn: () => "new", oldFn: () => "old" });
    expect(r.result).toBe("old");
    expect(r.variant).toBe("old");
  });
});

// ── Policy Engine ────────────────────────────────────────────────────────────
describe("policyEngine — getPolicy() / setPolicy()", () => {
  it("returns default policies", () => {
    const p = getPolicy("NY.requirePhysicianReview");
    expect(p.enabled).toBe(true);
    expect(p.key).toBe("NY.requirePhysicianReview");
  });

  it("returns disabled policy for unknown key", () => {
    const p = getPolicy("unknown.policy.xyz");
    expect(p.enabled).toBe(false);
  });

  it("setPolicy updates and returns policy", () => {
    setPolicy("test.policy.newUnit", true, { maxWait: 10 });
    expect(isPolicyEnabled("test.policy.newUnit")).toBe(true);
    setPolicy("test.policy.newUnit", false);
    expect(isPolicyEnabled("test.policy.newUnit")).toBe(false);
  });

  it("getPoliciesForContext filters by region", () => {
    const nyPolicies = getPoliciesForContext({ region: "NY" });
    expect(nyPolicies.every(p => !p.region || p.region === "NY")).toBe(true);
  });

  it("getAllPolicies returns array", () => {
    const all = getAllPolicies();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  it("globalKillSwitch throws above threshold", () => {
    expect(() => globalKillSwitch(0.05)).toThrow("SYSTEM HALTED");
  });

  it("globalKillSwitch passes below threshold", () => {
    expect(() => globalKillSwitch(0.01)).not.toThrow();
  });
});

// ── Exec Brief / FDA Pack ────────────────────────────────────────────────────
describe("execBrief — generateExecBrief()", () => {
  const metrics = {
    patients: 500, erRate: 0.08, safetyMismatchRate: 0.001,
    p50Latency: 120, p95Latency: 450, accuracy: 0.94,
    automationFailRate: 0.02, goldenCasesTotal: 1200, uptime: 0.9997,
  };

  it("returns expected shape", () => {
    const brief = generateExecBrief(metrics);
    expect(brief.headline).toContain("Auralyn");
    expect(brief.traction).toContain("500");
    expect(brief.moat).toContain("KB");
    expect(brief.generatedAt).toBeTruthy();
  });

  it("buildFdaPack includes risk controls and golden cases", () => {
    const pack = buildFdaPack(metrics, new Array(1200).fill({}));
    expect(pack.validation.goldenCases).toBe(1200);
    expect(pack.riskControls.length).toBeGreaterThan(3);
    expect(pack.regulatoryClass).toContain("Class II");
  });

  it("buildPitchDeck returns markdown string", () => {
    const deck = buildPitchDeck(metrics);
    expect(deck).toContain("# Auralyn");
    expect(deck).toContain("Safety Architecture");
    expect(deck).toContain("500");
  });
});

// ── Bulk Ingest ───────────────────────────────────────────────────────────────
describe("bulkIngest — ingestNdjson() / ingestCsv()", () => {
  const tmpDir = os.tmpdir();

  it("ingestNdjson parses valid NDJSON file", () => {
    const filePath = path.join(tmpDir, `test_${Date.now()}.ndjson`);
    fs.writeFileSync(filePath, '{"a":1}\n{"a":2}\n{"a":3}\n');
    const r = ingestNdjson(filePath);
    expect(r.count).toBe(3);
    expect(r.errors.length).toBe(0);
    fs.unlinkSync(filePath);
  });

  it("ingestNdjson reports errors for bad lines", () => {
    const filePath = path.join(tmpDir, `test_bad_${Date.now()}.ndjson`);
    fs.writeFileSync(filePath, '{"a":1}\nNOT_JSON\n{"a":3}\n');
    const r = ingestNdjson(filePath);
    expect(r.count).toBe(2);
    expect(r.errors.length).toBe(1);
    fs.unlinkSync(filePath);
  });

  it("ingestCsv parses delimited file", () => {
    const filePath = path.join(tmpDir, `test_${Date.now()}.csv`);
    fs.writeFileSync(filePath, "name,age\nAlice,30\nBob,25\n");
    const r = ingestCsv(filePath);
    expect(r.count).toBe(2);
    expect(r.records[0].name).toBe("Alice");
    expect(r.records[1].age).toBe("25");
    fs.unlinkSync(filePath);
  });

  it("ingestCsv flags mismatched rows", () => {
    const filePath = path.join(tmpDir, `test_mismatch_${Date.now()}.csv`);
    fs.writeFileSync(filePath, "a,b\n1,2\n3\n5,6\n");
    const r = ingestCsv(filePath);
    expect(r.errors.length).toBe(1);
    expect(r.count).toBe(2);
    fs.unlinkSync(filePath);
  });
});
