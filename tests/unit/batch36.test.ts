import { describe, it, expect } from "vitest";

// ─── 1. Clinical Token System ─────────────────────────────────────────────────
import { createClinicalTokenSet, generateTraceId } from "../../server/core/clinicalTokens";

describe("Batch36 — clinicalTokens", () => {
  it("creates a token set with defaults", () => {
    const t = createClinicalTokenSet({ complaint: "chest pain" });
    expect(t.complaint).toBe("chest pain");
    expect(t.riskLevel).toBe("low");
    expect(t.requiresPhysicianReview).toBe(false);
    expect(t.traceId).toMatch(/^TRACE_/);
  });

  it("builds chest posterior when no posterior provided", () => {
    const t = createClinicalTokenSet({ complaint: "chest pain" });
    expect(t.posterior["acs"]).toBeDefined();
    expect(t.posterior["acs"]).toBeGreaterThan(0.2);
  });

  it("infers fever modifier from symptoms", () => {
    const t = createClinicalTokenSet({ complaint: "cough", symptoms: ["fever"] });
    expect(t.modifiers.fever).toBe(true);
  });

  it("infers tachycardia modifier from vitals", () => {
    const t = createClinicalTokenSet({ complaint: "palpitations", vitals: { hr: 125 } });
    expect(t.modifiers.tachycardia).toBe(true);
  });

  it("infers hypotension from vitals", () => {
    const t = createClinicalTokenSet({ complaint: "syncope", vitals: { systolicBP: 80 } });
    expect(t.modifiers.hypotension).toBe(true);
  });

  it("generates unique traceIds", () => {
    const ids = new Set(Array.from({ length: 20 }, generateTraceId));
    expect(ids.size).toBe(20);
  });

  it("preserves provided posterior", () => {
    const posterior = { acs: 0.6, gerd: 0.4 };
    const t = createClinicalTokenSet({ complaint: "chest", posterior });
    expect(t.posterior.acs).toBe(0.6);
  });

  it("empty complaint → unknown", () => {
    const t = createClinicalTokenSet({});
    expect(t.complaint).toBe("unknown");
  });
});

// ─── 2. Decision Temperature ──────────────────────────────────────────────────
import { applyDecisionTemperature } from "../../server/engine/decisionTemperature";

describe("Batch36 — decisionTemperature", () => {
  it("red flags → critical, physician review required", () => {
    const t = createClinicalTokenSet({ complaint: "chest", redFlags: ["syncope"], posterior: { acs: 0.5 } });
    const r = applyDecisionTemperature(t);
    expect(r.riskLevel).toBe("critical");
    expect(r.requiresPhysicianReview).toBe(true);
    expect(r.allowedDiagnoses).toHaveLength(1);
  });

  it("high posterior (>0.8) → high risk, 2 allowed", () => {
    const t = createClinicalTokenSet({ complaint: "chest", posterior: { acs: 0.85, gerd: 0.10 } });
    const r = applyDecisionTemperature(t);
    expect(r.riskLevel).toBe("high");
    expect(r.allowedDiagnoses.length).toBeLessThanOrEqual(2);
  });

  it("moderate posterior (0.5–0.8) → moderate, 3 allowed", () => {
    const t = createClinicalTokenSet({ complaint: "headache", posterior: { migraine: 0.55, tension: 0.30, other: 0.15 } });
    const r = applyDecisionTemperature(t);
    expect(r.riskLevel).toBe("moderate");
    expect(r.allowedDiagnoses.length).toBeLessThanOrEqual(3);
  });

  it("low posterior + no flags → low, all diagnoses allowed", () => {
    const t = createClinicalTokenSet({ complaint: "sore throat", posterior: { strep: 0.40, viral: 0.35, mono: 0.25 } });
    const r = applyDecisionTemperature(t);
    expect(r.riskLevel).toBe("low");
    expect(r.allowedDiagnoses).toHaveLength(3);
  });

  it("tachycardia modifier → at least high", () => {
    const t = createClinicalTokenSet({ complaint: "palpitations", vitals: { hr: 125 }, posterior: { arrhythmia: 0.4 } });
    const r = applyDecisionTemperature(t);
    expect(["high", "critical"]).toContain(r.riskLevel);
  });
});

// ─── 3. Shadow Safety Engine ──────────────────────────────────────────────────
import { applyShadowSafety } from "../../server/safety/shadowEngine";

describe("Batch36 — shadowEngine", () => {
  it("sepsis probability > 0.2 → critical + physician review", () => {
    const t = createClinicalTokenSet({ complaint: "fever", posterior: { sepsis: 0.25, viral: 0.75 } });
    const r = applyShadowSafety(t);
    expect(r.riskLevel).toBe("critical");
    expect(r.requiresPhysicianReview).toBe(true);
    expect(r.redFlags).toContain("possible_sepsis");
  });

  it("fever + tachycardia modifiers → sepsis override", () => {
    const t = createClinicalTokenSet({ complaint: "fever", vitals: { hr: 115, tempF: 101.5 }, posterior: { viral: 0.8 } });
    const r = applyShadowSafety(t);
    expect(r.shadowOverrides.find((o: any) => o.rule === "sepsis_override")?.applied).toBe(true);
  });

  it("PE > 0.15 → allowedDiagnoses locked to pulmonary_embolism", () => {
    const t = createClinicalTokenSet({ complaint: "dyspnea", posterior: { pe: 0.20, copd: 0.80 } });
    const r = applyShadowSafety(t);
    expect(r.allowedDiagnoses).toContain("pulmonary_embolism");
    expect(r.shadowOverrides.find((o: any) => o.rule === "pe_override")?.applied).toBe(true);
  });

  it("normal low risk → no overrides applied", () => {
    const t = createClinicalTokenSet({ complaint: "sore throat", posterior: { viral: 0.8, strep: 0.2 } });
    const r = applyShadowSafety(t);
    const applied = r.shadowOverrides.filter((o: any) => o.applied);
    expect(applied.length).toBe(0);
  });

  it("returns shadowOverrides array", () => {
    const t = createClinicalTokenSet({ complaint: "cough" });
    const r = applyShadowSafety(t);
    expect(Array.isArray(r.shadowOverrides)).toBe(true);
    expect(r.shadowOverrides.length).toBeGreaterThan(0);
  });

  it("hypoxia modifier → critical", () => {
    const t = createClinicalTokenSet({ complaint: "dyspnea", vitals: { spo2: 86 }, posterior: { copd: 0.5 } });
    applyDecisionTemperature(t); // sets hypoxia modifier
    const r = applyShadowSafety(t);
    expect(r.riskLevel).toBe("critical");
  });
});

// ─── 4. Trace Engine ─────────────────────────────────────────────────────────
import { buildTrace, verifyTrace } from "../../server/audit/traceEngine";

describe("Batch36 — traceEngine", () => {
  it("buildTrace returns a SHA-256 hash", () => {
    const t = createClinicalTokenSet({ complaint: "chest" });
    const trace = buildTrace(t);
    expect(trace.hash).toHaveLength(64);
    expect(typeof trace.hash).toBe("string");
  });

  it("verifyTrace returns true for untampered trace", () => {
    const t = createClinicalTokenSet({ complaint: "chest" });
    const trace = buildTrace(t);
    expect(verifyTrace(trace)).toBe(true);
  });

  it("verifyTrace returns false for tampered trace", () => {
    const t = createClinicalTokenSet({ complaint: "chest" });
    const trace = buildTrace(t);
    const tampered = { ...trace, riskLevel: "critical" };
    expect(verifyTrace(tampered)).toBe(false);
  });

  it("trace has all required fields", () => {
    const t = createClinicalTokenSet({ complaint: "headache" });
    const trace = buildTrace(t);
    expect(trace.id).toBeTruthy();
    expect(trace.timestamp).toBeTruthy();
    expect(trace.complaint).toBe("headache");
    expect(trace.hash).toBeTruthy();
  });

  it("each trace is unique", () => {
    const t1 = buildTrace(createClinicalTokenSet({ complaint: "a" }));
    const t2 = buildTrace(createClinicalTokenSet({ complaint: "b" }));
    expect(t1.hash).not.toBe(t2.hash);
  });
});

// ─── 5. Clinical Output Engine ───────────────────────────────────────────────
import { generateClinicalOutput } from "../../server/output/clinicalOutput";

describe("Batch36 — clinicalOutput", () => {
  it("critical risk → ER or physician_review", () => {
    const t = createClinicalTokenSet({ complaint: "chest", posterior: { acs: 0.9 }, riskLevel: "critical", requiresPhysicianReview: true, allowedDiagnoses: ["acs"] });
    const o = generateClinicalOutput(t);
    expect(o.disposition).toBe("physician_review_required");
    expect(o.urgency).toBe("emergent");
  });

  it("low risk → home_care", () => {
    const t = createClinicalTokenSet({ complaint: "sore throat", posterior: { viral: 0.8 }, riskLevel: "low", allowedDiagnoses: ["viral"] });
    const o = generateClinicalOutput(t);
    expect(o.disposition).toBe("home_care");
    expect(o.urgency).toBe("routine");
  });

  it("output has primaryDx, diagnoses, message", () => {
    const t = createClinicalTokenSet({ complaint: "headache", riskLevel: "moderate", allowedDiagnoses: ["migraine"] });
    const o = generateClinicalOutput(t);
    expect(o.primaryDx).toBe("migraine");
    expect(o.diagnoses).toContain("migraine");
    expect(typeof o.message).toBe("string");
  });

  it("high risk → urgent_care disposition", () => {
    const t = createClinicalTokenSet({ complaint: "chest", riskLevel: "high", allowedDiagnoses: ["acs", "pe"] });
    const o = generateClinicalOutput(t);
    expect(o.disposition).toBe("urgent_care");
    expect(o.urgency).toBe("urgent");
  });

  it("low risk → has followUp", () => {
    const t = createClinicalTokenSet({ complaint: "cold", riskLevel: "low", allowedDiagnoses: ["viral"] });
    const o = generateClinicalOutput(t);
    expect(o.followUp).toBeTruthy();
  });
});

// ─── 6. Core Pipeline ─────────────────────────────────────────────────────────
import { runClinicalPipeline } from "../../server/pipeline/runClinicalPipeline";

describe("Batch36 — runClinicalPipeline", () => {
  it("returns trace + output", async () => {
    const r = await runClinicalPipeline({ complaint: "chest pain" });
    expect(r.trace).toBeDefined();
    expect(r.output).toBeDefined();
    expect(r.trace.hash).toHaveLength(64);
  });

  it("chest pain → urgent or emergent", async () => {
    const r = await runClinicalPipeline({ complaint: "chest pain", symptoms: ["diaphoresis"], vitals: { hr: 105, spo2: 94 } });
    expect(["urgent", "emergent", "semi-urgent"]).toContain(r.output.urgency);
  });

  it("shadowOverrides present", async () => {
    const r = await runClinicalPipeline({ complaint: "cough" });
    expect(Array.isArray(r.shadowOverrides)).toBe(true);
  });

  it("traceId consistent", async () => {
    const r = await runClinicalPipeline({ complaint: "headache" });
    expect(r.traceId).toBe(r.trace.id);
  });

  it("sepsis case flagged critical", async () => {
    const r = await runClinicalPipeline({ complaint: "fever", posterior: { sepsis: 0.30, viral: 0.70 } });
    expect(r.riskLevel).toBe("critical");
    expect(r.output.urgency).toBe("emergent");
  });
});

// ─── 7. Full Pipeline ─────────────────────────────────────────────────────────
import { runFullPipeline } from "../../server/pipeline/fullPipeline";

describe("Batch36 — runFullPipeline", () => {
  it("returns trace + specialistConsensus + output", async () => {
    const r = await runFullPipeline({ complaint: "cough" });
    expect(r.trace).toBeDefined();
    expect(r.specialistConsensus).toBeDefined();
    expect(r.output).toBeDefined();
  });

  it("specialistConsensus has votes + consensus array", async () => {
    const r = await runFullPipeline({ complaint: "chest pain", posterior: { acs: 0.5, mi: 0.3 } });
    expect(Array.isArray(r.specialistConsensus.votes)).toBe(true);
    expect(Array.isArray(r.specialistConsensus.consensus)).toBe(true);
    expect(r.specialistConsensus.votes).toHaveLength(3);
  });

  it("trace is verifiable", async () => {
    const { verifyTrace } = await import("../../server/audit/traceEngine");
    const r = await runFullPipeline({ complaint: "fever" });
    expect(verifyTrace(r.trace)).toBe(true);
  });

  it("chest + sepsis flags → physician review", async () => {
    const r = await runFullPipeline({ complaint: "fever", posterior: { sepsis: 0.25, viral: 0.75 } });
    expect(r.tokens.requiresPhysicianReview).toBe(true);
  });
});

// ─── 8. Dashboard Metrics ─────────────────────────────────────────────────────
import { getSystemMetrics, incrementCaseCount, incrementSafetyFlag } from "../../server/dashboard/metrics";

describe("Batch36 — dashboardMetrics", () => {
  it("getSystemMetrics returns shape", async () => {
    const m = await getSystemMetrics();
    expect(typeof m.avgLatency).toBe("string");
    expect(typeof m.wsClients).toBe("number");
    expect(typeof m.uptime).toBe("number");
    expect(typeof m.memoryMB).toBe("number");
    expect(typeof m.timestamp).toBe("string");
  });

  it("incrementCaseCount increments activeCases", async () => {
    const before = (await getSystemMetrics()).activeCases;
    incrementCaseCount();
    const after  = (await getSystemMetrics()).activeCases;
    expect(after).toBeGreaterThan(before);
  });

  it("incrementSafetyFlag increments safetyFlags", async () => {
    const before = (await getSystemMetrics()).safetyFlags;
    incrementSafetyFlag();
    const after  = (await getSystemMetrics()).safetyFlags;
    expect(after).toBeGreaterThan(before);
  });
});

// ─── 9. Golden Case Harness (pipeline-integrated) ────────────────────────────
import { runGoldenCases } from "../../server/golden/goldenHarness";

describe("Batch36 — goldenHarness", () => {
  it("returns a GoldenSummary", async () => {
    const cases = [
      { id: "g1", input: { complaint: "sore throat", posterior: { strep: 0.4, viral: 0.6 } }, expected: { riskLevel: "low" } },
    ];
    const s = await runGoldenCases(cases);
    expect(typeof s.total).toBe("number");
    expect(typeof s.accuracy).toBe("number");
    expect(Array.isArray(s.results)).toBe(true);
  });

  it("matching riskLevel → pass", async () => {
    const cases = [
      { id: "g2", input: { complaint: "sore throat" }, expected: { disposition: "home_care" } },
    ];
    // sore throat is low risk → home_care
    const s = await runGoldenCases(cases);
    expect(s.results[0].dispMatch).toBe(true);
  });

  it("handles empty cases", async () => {
    const s = await runGoldenCases([]);
    expect(s.total).toBe(0);
    expect(s.accuracy).toBe(0);
  });
});

// ─── 10. FHIR Service stub ────────────────────────────────────────────────────
import { pushFHIR } from "../../server/fhir/fhirService";

describe("Batch36 — fhirService", () => {
  it("returns ok:false when FHIR_URL not configured", async () => {
    const r = await pushFHIR("patient-001", { complaint: "chest pain" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("FHIR_URL");
  });
});

// ─── 11. runSpecialistCouncil (token-based) ───────────────────────────────────
import { runSpecialistCouncil } from "../../server/agents/specialistCouncil";

describe("Batch36 — runSpecialistCouncil (token)", () => {
  it("returns votes + consensus array", async () => {
    const tokens = createClinicalTokenSet({ complaint: "chest", posterior: { acs: 0.5, mi: 0.3, gerd: 0.2 } });
    const r = await runSpecialistCouncil(tokens);
    expect(Array.isArray(r.votes)).toBe(true);
    expect(r.votes).toHaveLength(3);
    expect(Array.isArray(r.consensus)).toBe(true);
  });

  it("cardiology matches cardiac posterior keys", async () => {
    const tokens = createClinicalTokenSet({ complaint: "chest", posterior: { acs: 0.6, pe: 0.25, gerd: 0.15 } });
    const r = await runSpecialistCouncil(tokens);
    const cardio = r.votes.find((v) => v.specialist === "cardiology");
    expect(cardio?.diagnoses.length).toBeGreaterThan(0);
  });

  it("no matching dx → empty diagnoses for specialist", async () => {
    const tokens = createClinicalTokenSet({ complaint: "sore throat", posterior: { strep: 0.5, viral: 0.5 } });
    const r = await runSpecialistCouncil(tokens);
    const icu = r.votes.find((v) => v.specialist === "icu");
    expect(icu?.diagnoses).toHaveLength(0);
  });
});
