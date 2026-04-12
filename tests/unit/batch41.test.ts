import { describe, it, expect } from "vitest";

// ─── 1. Command Center AI ─────────────────────────────────────────────────────
import { computePriorityScore, rankPatientsAI } from "../../server/command-center/commandCenterAI";

const basePatient = { id: "p1", riskScore: 5, vitals: { hr: 90, bpSys: 115, spo2: 96, temp: 98.6 } };

describe("Batch41 — commandCenterAI", () => {
  it("computes priority score from base patient", () => {
    const { score } = computePriorityScore(basePatient);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(typeof score).toBe("number");
  });

  it("high-risk vitals raise score above normal", () => {
    const sick = { ...basePatient, vitals: { hr: 135, bpSys: 85, spo2: 88, temp: 103.2 } };
    const { score: sickScore } = computePriorityScore(sick);
    const { score: wellScore } = computePriorityScore(basePatient);
    expect(sickScore).toBeGreaterThan(wellScore);
  });

  it("spo2 < 92 adds +5 to score", () => {
    const ok   = { ...basePatient, vitals: { ...basePatient.vitals, spo2: 97 } };
    const low  = { ...basePatient, vitals: { ...basePatient.vitals, spo2: 88 } };
    const diff = computePriorityScore(low).score - computePriorityScore(ok).score;
    expect(diff).toBeGreaterThanOrEqual(5);
  });

  it("dropping SpO2 trend adds extra score and flag", () => {
    const trended = { ...basePatient, trend: { spo2Trend: -4 } };
    const { score, trendFlags } = computePriorityScore(trended);
    expect(score).toBeGreaterThan(computePriorityScore(basePatient).score);
    expect(trendFlags.some((f) => f.toLowerCase().includes("spo"))).toBe(true);
  });

  it("rising HR trend adds flag", () => {
    const trended = { ...basePatient, trend: { hrTrend: 20 } };
    const { trendFlags } = computePriorityScore(trended);
    expect(trendFlags.some((f) => f.toLowerCase().includes("hr"))).toBe(true);
  });

  it("rankPatientsAI sorts highest score first", () => {
    const patients = [
      { id: "a", riskScore: 2, vitals: { hr: 70, bpSys: 120, spo2: 99, temp: 98.6 } },
      { id: "b", riskScore: 9, vitals: { hr: 140, bpSys: 80, spo2: 86, temp: 103.5 } },
      { id: "c", riskScore: 5, vitals: { hr: 100, bpSys: 105, spo2: 94, temp: 100.2 } },
    ];
    const ranked = rankPatientsAI(patients);
    expect(ranked[0].id).toBe("b");
    expect(ranked[ranked.length - 1].id).toBe("a");
  });

  it("ranked patients have urgency field", () => {
    const ranked = rankPatientsAI([basePatient]);
    expect(["routine", "soon", "urgent", "immediate"]).toContain(ranked[0].urgency);
  });

  it("critical vitals produce immediate urgency", () => {
    const crit = { id: "x", riskScore: 10, vitals: { hr: 150, bpSys: 70, spo2: 82, temp: 105.0 } };
    const ranked = rankPatientsAI([crit]);
    expect(ranked[0].urgency).toBe("immediate");
  });
});

// ─── 2. Deterioration Prediction Engine ──────────────────────────────────────
import { predictDeterioration } from "../../server/prediction/deteriorationEngine";

describe("Batch41 — deteriorationEngine", () => {
  it("normal patient produces low risk", () => {
    const result = predictDeterioration({ id: "p1", vitals: { hr: 75, bpSys: 120, spo2: 98, temp: 98.6 } });
    expect(result.risk).toMatch(/low|moderate/);
  });

  it("sepsis vitals produce high or critical risk", () => {
    const result = predictDeterioration({ id: "p1", vitals: { hr: 115, bpSys: 88, spo2: 94, temp: 103.5 } });
    expect(["high", "critical"]).toContain(result.risk);
  });

  it("hypoxia flag raised when spo2 < 92", () => {
    const result = predictDeterioration({ id: "p1", vitals: { hr: 80, bpSys: 120, spo2: 88, temp: 98.6 } });
    expect(result.flags.some((f) => f.toLowerCase().includes("hypoxia"))).toBe(true);
  });

  it("dropping BP trend raises score significantly", () => {
    const noTrend  = predictDeterioration({ id: "p1", vitals: { hr: 90, bpSys: 100, spo2: 96, temp: 99.0 } });
    const withTrend = predictDeterioration({ id: "p1", vitals: { hr: 90, bpSys: 100, spo2: 96, temp: 99.0 }, trend: { bpTrend: -15 } });
    expect(withTrend.score).toBeGreaterThan(noTrend.score);
  });

  it("sepsisCriteria flag set correctly", () => {
    const septic = predictDeterioration({ id: "p1", vitals: { hr: 110, bpSys: 95, spo2: 94, temp: 103.2 } });
    expect(septic.sepsisCriteria).toBe(true);
  });

  it("shockCriteria set for hypotension + tachycardia", () => {
    const shock = predictDeterioration({ id: "p1", vitals: { hr: 125, bpSys: 80, spo2: 94, temp: 98.6 } });
    expect(shock.shockCriteria).toBe(true);
  });

  it("result always has prediction string", () => {
    const result = predictDeterioration({ id: "p1", vitals: { hr: 80, bpSys: 120, spo2: 98, temp: 98.6 } });
    expect(result.prediction.length).toBeGreaterThan(0);
  });

  it("rapid O2 decline trend raises flags", () => {
    const result = predictDeterioration({
      id: "p1",
      vitals: { hr: 90, bpSys: 110, spo2: 95, temp: 99.0 },
      trend: { spo2Trend: -4 },
    });
    expect(result.flags.some((f) => f.toLowerCase().includes("oxygen") || f.toLowerCase().includes("decline"))).toBe(true);
  });
});

// ─── 3. RLHF Clinical Learning Engine ────────────────────────────────────────
import { evaluateCase, runLearningLoop, getLearningStats, getWeights } from "../../server/learning/rlhfClinicalEngine";

describe("Batch41 — rlhfClinicalEngine", () => {
  it("correct disposition gives positive reward", () => {
    const reward = evaluateCase({ patientId: "p1", predictedDisposition: "ER", actualDisposition: "ER", predictedRisk: "high", outcome: "improved" });
    expect(reward).toBeGreaterThan(0);
  });

  it("wrong disposition gives negative reward", () => {
    const reward = evaluateCase({ patientId: "p1", predictedDisposition: "home", actualDisposition: "ICU", predictedRisk: "low", outcome: "hospitalized" });
    expect(reward).toBeLessThan(0);
  });

  it("outcome=worsened gives heavy penalty", () => {
    const worsened = evaluateCase({ patientId: "p1", predictedDisposition: "home", actualDisposition: "home", predictedRisk: "low", outcome: "worsened" });
    const improved = evaluateCase({ patientId: "p1", predictedDisposition: "home", actualDisposition: "home", predictedRisk: "low", outcome: "improved" });
    expect(worsened).toBeLessThan(improved);
  });

  it("physician override applies penalty", () => {
    const override = evaluateCase({ patientId: "p1", predictedDisposition: "home", actualDisposition: "home", predictedRisk: "low", outcome: "improved", physicianOverride: true });
    const noOverride = evaluateCase({ patientId: "p1", predictedDisposition: "home", actualDisposition: "home", predictedRisk: "low", outcome: "improved", physicianOverride: false });
    expect(override).toBeLessThan(noOverride);
  });

  it("runLearningLoop returns reward + update", async () => {
    const result = await runLearningLoop({
      patientId: "test-001", predictedDisposition: "ER", actualDisposition: "ER",
      predictedRisk: "high", outcome: "improved",
    });
    expect(typeof result.reward).toBe("number");
    expect(typeof result.update.adjustment).toBe("number");
    expect(Math.abs(result.update.adjustment)).toBeLessThanOrEqual(0.02);
  });

  it("adjustment is capped at ±0.02", async () => {
    const result = await runLearningLoop({
      patientId: "cap-test", predictedDisposition: "home", actualDisposition: "ICU",
      predictedRisk: "low", outcome: "icu",
    });
    expect(Math.abs(result.update.adjustment)).toBeLessThanOrEqual(0.02);
  });

  it("getLearningStats returns total + avgReward", async () => {
    await runLearningLoop({ patientId: "s1", predictedDisposition: "ER", actualDisposition: "ER", predictedRisk: "high", outcome: "improved" });
    const stats = getLearningStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.avgReward).toBe("number");
  });

  it("getWeights returns weight object", () => {
    const w = getWeights();
    expect(typeof w.risk_score_weight).toBe("number");
    expect(typeof w.sepsis_weight).toBe("number");
  });
});

// ─── 4. Order Executor ────────────────────────────────────────────────────────
import { executeOrder, executeBatchOrders } from "../../server/intervention/orderExecutor";

describe("Batch41 — orderExecutor", () => {
  it("executeOrder returns OrderResult", async () => {
    const result = await executeOrder("CBC + CMP", "p-test");
    expect(result.order).toBe("CBC + CMP");
    expect(result.patientId).toBe("p-test");
    expect(result.status).toBe("placed");
    expect(result.orderId).toBeTruthy();
  });

  it("adapter is mock when no EHR configured", async () => {
    const result = await executeOrder("Troponin", "p2");
    expect(result.adapter).toBe("mock");
  });

  it("executeBatchOrders returns array", async () => {
    const results = await executeBatchOrders(["CBC", "Troponin", "BNP"], "p-batch");
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "placed")).toBe(true);
  });
});
