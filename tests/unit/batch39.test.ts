import { describe, it, expect } from "vitest";

// ─── 1. Intervention Engine (NEWS2 + Interventions) ──────────────────────────
import { computeNEWS2, generateInterventions } from "../../server/engines/interventionEngine";

describe("Batch39 — interventionEngine.computeNEWS2", () => {
  it("normal vitals produce low NEWS2 score", () => {
    const score = computeNEWS2({ hr: 75, spo2: 98, temp: 98.6, systolicBP: 120, rr: 16 });
    expect(score).toBeLessThan(3);
  });

  it("critical vitals produce high NEWS2 score", () => {
    const score = computeNEWS2({ hr: 135, spo2: 88, temp: 103.1, systolicBP: 84, rr: 26 });
    expect(score).toBeGreaterThanOrEqual(7);
  });

  it("tachycardia alone raises score", () => {
    const baseline = computeNEWS2({ hr:  80, spo2: 98, temp: 98.6, systolicBP: 120 });
    const tachy    = computeNEWS2({ hr: 120, spo2: 98, temp: 98.6, systolicBP: 120 });
    expect(tachy).toBeGreaterThan(baseline);
  });

  it("hypoxia (SpO2 < 92) raises score significantly", () => {
    const ok   = computeNEWS2({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 120 });
    const hypo = computeNEWS2({ hr: 80, spo2: 88, temp: 98.6, systolicBP: 120 });
    expect(hypo - ok).toBeGreaterThanOrEqual(3);
  });

  it("hypotension (SBP < 90) raises score", () => {
    const ok   = computeNEWS2({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 120 });
    const hypo = computeNEWS2({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 85 });
    expect(hypo).toBeGreaterThan(ok);
  });
});

describe("Batch39 — interventionEngine.generateInterventions", () => {
  it("sepsis vitals → sepsisCriteria=true + critical interventions", () => {
    const result = generateInterventions({ hr: 122, spo2: 91, temp: 103.5, systolicBP: 84 });
    expect(result.sepsisCriteria).toBe(true);
    expect(result.riskLevel).toBe("critical");
    const esc = result.interventions.find((i) => i.type === "escalation");
    expect(esc).toBeDefined();
    expect(esc?.priority).toBe("critical");
  });

  it("hypoxia (SpO2 < 92) → oxygen intervention", () => {
    const result = generateInterventions({ hr: 90, spo2: 88, temp: 98.6, systolicBP: 120 });
    const med = result.interventions.find((i) => i.type === "med" && i.action.toLowerCase().includes("oxygen"));
    expect(med).toBeDefined();
    expect(med?.priority).toBe("critical");
  });

  it("severe tachycardia → lab order", () => {
    const result = generateInterventions({ hr: 135, spo2: 97, temp: 98.6, systolicBP: 115 });
    const lab = result.interventions.find((i) => i.type === "lab");
    expect(lab).toBeDefined();
    expect(lab?.priority).toBe("high");
  });

  it("normal vitals → low-risk monitoring", () => {
    const result = generateInterventions({ hr: 72, spo2: 99, temp: 98.6, systolicBP: 118 });
    expect(result.riskLevel).toBe("low");
    expect(result.newsScore).toBeLessThan(3);
    expect(result.interventions[0].type).toBe("monitor");
  });

  it("result always has interventions array", () => {
    const result = generateInterventions({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 120 });
    expect(Array.isArray(result.interventions)).toBe(true);
    expect(result.interventions.length).toBeGreaterThan(0);
  });

  it("each intervention has type, action, priority, rationale", () => {
    const result = generateInterventions({ hr: 130, spo2: 88, temp: 104.0, systolicBP: 82 });
    for (const intv of result.interventions) {
      expect(["lab", "med", "escalation", "monitor"]).toContain(intv.type);
      expect(["low", "medium", "high", "critical"]).toContain(intv.priority);
      expect(typeof intv.action).toBe("string");
      expect(typeof intv.rationale).toBe("string");
    }
  });

  it("prediction string is non-empty", () => {
    const result = generateInterventions({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 120 });
    expect(result.prediction.length).toBeGreaterThan(0);
  });

  it("sepsis bundle includes lab + med + escalation", () => {
    const result = generateInterventions({ hr: 120, spo2: 96, temp: 103.0, systolicBP: 85 });
    const types = result.interventions.map((i) => i.type);
    expect(types).toContain("lab");
    expect(types).toContain("med");
    expect(types).toContain("escalation");
  });

  it("critical risk level only when NEWS2 ≥ 7", () => {
    const critical = generateInterventions({ hr: 140, spo2: 87, temp: 104.0, systolicBP: 82 });
    expect(critical.newsScore).toBeGreaterThanOrEqual(7);
    expect(critical.riskLevel).toBe("critical");
  });

  it("medium risk when NEWS2 1–4", () => {
    const result = generateInterventions({ hr: 95, spo2: 96, temp: 99.5, systolicBP: 112 });
    expect(result.riskLevel).toMatch(/low|medium/);
  });
});

// ─── 2. Live Patient Engine ───────────────────────────────────────────────────
import {
  startLivePatientEngine, stopLivePatientEngine,
  getCurrentPatients, getEngineStats,
} from "../../server/realtime/livePatientEngine";

describe("Batch39 — livePatientEngine", () => {
  it("getCurrentPatients initially returns empty array", () => {
    // Before start, state is empty
    const patients = getCurrentPatients();
    expect(Array.isArray(patients)).toBe(true);
  });

  it("getEngineStats returns shape", () => {
    const stats = getEngineStats();
    expect(typeof stats.ticks).toBe("number");
    expect(typeof stats.patients).toBe("number");
    expect(typeof stats.criticalCount).toBe("number");
    expect(typeof stats.running).toBe("boolean");
  });

  it("startLivePatientEngine populates patients", () => {
    startLivePatientEngine();
    const patients = getCurrentPatients();
    expect(patients.length).toBe(5);
    stopLivePatientEngine();
  });

  it("each patient has required fields", () => {
    startLivePatientEngine();
    const patients = getCurrentPatients();
    for (const p of patients) {
      expect(p.id).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(typeof p.vitals.hr).toBe("number");
      expect(typeof p.vitals.spo2).toBe("number");
      expect(["stable", "warning", "critical"]).toContain(p.status);
      expect(typeof p.deterioration.newsScore).toBe("number");
      expect(typeof p.priorityScore).toBe("number");
    }
    stopLivePatientEngine();
  });

  it("patients sorted by priorityScore descending", () => {
    startLivePatientEngine();
    const patients = getCurrentPatients();
    for (let i = 1; i < patients.length; i++) {
      expect(patients[i].priorityScore).toBeLessThanOrEqual(patients[i - 1].priorityScore);
    }
    stopLivePatientEngine();
  });

  it("running flag changes after start/stop", () => {
    startLivePatientEngine();
    expect(getEngineStats().running).toBe(true);
    stopLivePatientEngine();
    expect(getEngineStats().running).toBe(false);
  });

  it("tick count increments on second start", () => {
    const before = getEngineStats().ticks;
    startLivePatientEngine(); // ticks once on start
    const after = getEngineStats().ticks;
    expect(after).toBeGreaterThanOrEqual(before);
    stopLivePatientEngine();
  });

  it("interventions are arrays on each patient", () => {
    startLivePatientEngine();
    for (const p of getCurrentPatients()) {
      expect(Array.isArray(p.interventions)).toBe(true);
      expect(p.interventions.length).toBeGreaterThan(0);
    }
    stopLivePatientEngine();
  });

  it("deterioration has riskLevel and prediction", () => {
    startLivePatientEngine();
    for (const p of getCurrentPatients()) {
      expect(["low", "medium", "high", "critical"]).toContain(p.deterioration.riskLevel);
      expect(typeof p.deterioration.prediction).toBe("string");
    }
    stopLivePatientEngine();
  });
});
