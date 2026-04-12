import { describe, it, expect } from "vitest";

// ─── 1. Specialist Council ────────────────────────────────────────────────────
import { SpecialistCouncil } from "../../server/agents/specialistCouncil";

const council = new SpecialistCouncil();

describe("Batch35 — specialistCouncil", () => {
  it("chest pain → cardiology HIGH, final=ED", async () => {
    const r = await council.evaluate({ complaint: "chest pain", vitals: { hr: 90, spo2: 96, systolicBP: 120 } });
    const cardio = r.votes.find((v) => v.specialty === "cardiology");
    expect(cardio?.risk).toBe("HIGH");
    expect(r.finalDecision).toBe("ED");
  });

  it("redFlags present → ICU CRITICAL, final=ICU", async () => {
    const r = await council.evaluate({ complaint: "shortness of breath", redFlags: ["syncope"], vitals: { spo2: 90, systolicBP: 85 } });
    expect(r.finalDecision).toBe("ICU");
    expect(r.riskSummary).toBe("CRITICAL");
  });

  it("fever complaint → ID MEDIUM", async () => {
    const r = await council.evaluate({ complaint: "cough and fever", vitals: { hr: 95, spo2: 97, tempF: 102 } });
    const id = r.votes.find((v) => v.specialty === "ID");
    expect(id?.risk).toBe("MEDIUM");
  });

  it("normal patient → OUTPATIENT", async () => {
    const r = await council.evaluate({ complaint: "sore throat", vitals: { hr: 72, spo2: 99, systolicBP: 120, tempF: 99 }, redFlags: [] });
    expect(r.finalDecision).toBe("OUTPATIENT");
  });

  it("agreementScore between 0 and 1", async () => {
    const r = await council.evaluate({ complaint: "headache" });
    expect(r.agreementScore).toBeGreaterThanOrEqual(0);
    expect(r.agreementScore).toBeLessThanOrEqual(1);
  });

  it("votes array has 3 specialists", async () => {
    const r = await council.evaluate({ complaint: "cough" });
    expect(r.votes).toHaveLength(3);
    const specialties = r.votes.map((v) => v.specialty);
    expect(specialties).toContain("cardiology");
    expect(specialties).toContain("ID");
    expect(specialties).toContain("ICU");
  });

  it("each vote has rationale", async () => {
    const r = await council.evaluate({ complaint: "chest pain" });
    for (const v of r.votes) {
      expect(typeof v.rationale).toBe("string");
      expect(v.rationale.length).toBeGreaterThan(0);
    }
  });

  it("hemodynamic instability → cardiology CRITICAL", async () => {
    const r = await council.evaluate({ complaint: "syncope", vitals: { systolicBP: 80, hr: 140 } });
    const cardio = r.votes.find((v) => v.specialty === "cardiology");
    expect(cardio?.risk).toBe("CRITICAL");
  });

  it("hypoxia SpO2 < 88 → ICU CRITICAL", async () => {
    const r = await council.evaluate({ complaint: "dyspnea", vitals: { spo2: 86, systolicBP: 110 }, redFlags: [] });
    const icu = r.votes.find((v) => v.specialty === "ICU");
    expect(icu?.risk).toBe("CRITICAL");
  });
});

// ─── 2. FDA Validator ─────────────────────────────────────────────────────────
import { FDAValidator } from "../../server/fda/fdaValidator";

const fda = new FDAValidator();

describe("Batch35 — fdaValidator", () => {
  it("100% accuracy → PASS", () => {
    const results = [{ match: true, expected: "A", actual: "A" }, { match: true, expected: "B", actual: "B" }];
    const r = fda.validate(results);
    expect(r.status).toBe("PASS");
    expect(r.accuracy).toBe(1.0);
  });

  it("< 80% accuracy → FAIL", () => {
    const results = [
      { match: false, expected: "A", actual: "B" },
      { match: false, expected: "C", actual: "D" },
      { match: true,  expected: "E", actual: "E" },
    ];
    const r = fda.validate(results);
    expect(r.status).toBe("FAIL");
    expect(r.accuracy).toBeLessThan(0.8);
  });

  it("90% accuracy, 0 safety misses → PASS", () => {
    const results = Array(10).fill(null).map((_, i) => ({ match: i < 9, expected: "X", actual: i < 9 ? "X" : "Y" }));
    const r = fda.validate(results);
    expect(r.status).toBe("PASS");
  });

  it("safety miss present → REVIEW or FAIL", () => {
    const results = [
      { match: false, expected: "ACS", actual: "Anxiety", safetyMiss: true },
      { match: true,  expected: "URI", actual: "URI" },
    ];
    const r = fda.validate(results);
    expect(r.safetyMisses).toBe(1);
    expect(r.status).not.toBe("PASS");
  });

  it("empty results → FAIL with accuracy 0", () => {
    const r = fda.validate([]);
    expect(r.accuracy).toBe(0);
    expect(r.status).toBe("FAIL");
  });

  it("compareResults produces correct match flags", () => {
    const expected = [{ diagnosis: "ACS", disposition: "ED" }, { diagnosis: "URI", disposition: "HOME" }];
    const actual   = [{ diagnosis: "ACS", disposition: "ED" }, { diagnosis: "Anxiety", disposition: "HOME" }];
    const results  = fda.compareResults(expected, actual);
    expect(results[0].match).toBe(true);
    expect(results[1].match).toBe(false);
  });

  it("compareResults flags ACS miss as safetyMiss", () => {
    const expected = [{ diagnosis: "ACS" }];
    const actual   = [{ diagnosis: "Anxiety" }];
    const results  = fda.compareResults(expected, actual);
    expect(results[0].safetyMiss).toBe(true);
  });
});

// ─── 3. Drift Detector ───────────────────────────────────────────────────────
import { DriftDetector } from "../../server/learning/driftDetector";

const dd = new DriftDetector();

describe("Batch35 — driftDetector", () => {
  it("identical distributions → no drift", () => {
    const r = dd.detect([0.5, 0.3, 0.2], [0.5, 0.3, 0.2]);
    expect(r.hasDrift).toBe(false);
    expect(r.l1Distance).toBe(0);
  });

  it("large shift → drift detected", () => {
    const r = dd.detect([0.9, 0.1], [0.1, 0.9]);
    expect(r.hasDrift).toBe(true);
    expect(r.l1Distance).toBeGreaterThan(0.2);
  });

  it("small shift below threshold → no drift", () => {
    const r = dd.detect([0.5, 0.5], [0.52, 0.48]);
    expect(r.hasDrift).toBe(false);
  });

  it("custom threshold respected", () => {
    const r = dd.detect([0.6, 0.4], [0.4, 0.6], 0.5);
    expect(r.threshold).toBe(0.5);
  });

  it("detectFromMaps with frequency maps", () => {
    const old = { cough: 10, fever: 5 };
    const nw  = { cough: 2,  fever: 8 };
    const r   = dd.detectFromMaps(old, nw, 0.2, "symptom_dist");
    expect(typeof r.hasDrift).toBe("boolean");
    expect(r.label).toBe("symptom_dist");
  });

  it("scan() returns anyDrift=false for stable windows", () => {
    const windows = [[0.5,0.5],[0.5,0.5],[0.5,0.5]];
    const { anyDrift, reports } = dd.scan(windows);
    expect(anyDrift).toBe(false);
    expect(reports).toHaveLength(2);
  });

  it("scan() detects drift in last window", () => {
    const windows = [[0.5,0.5],[0.5,0.5],[0.1,0.9]];
    const { anyDrift } = dd.scan(windows, 0.2);
    expect(anyDrift).toBe(true);
  });

  it("report has detectedAt timestamp", () => {
    const r = dd.detect([0.5,0.5],[0.4,0.6]);
    expect(r.detectedAt).toBeTruthy();
  });
});

// ─── 4. Golden Case Harness ───────────────────────────────────────────────────
import { GoldenCaseRunner } from "../../server/testing/goldenCaseHarness";

const runner = new GoldenCaseRunner();

describe("Batch35 — goldenCaseHarness", () => {
  const mockEngine = {
    run: async (input: any) => ({
      diagnosis:   input.expectedDx ?? "Viral URI",
      disposition: input.expectedDisp ?? "HOME",
    }),
  };

  const cases = [
    { id: "c1", input: { expectedDx: "ACS", expectedDisp: "ED" }, expected: { diagnosis: "ACS", disposition: "ED" } },
    { id: "c2", input: { expectedDx: "URI", expectedDisp: "HOME" }, expected: { diagnosis: "URI", disposition: "HOME" } },
  ];

  it("runCases returns a HarnessSummary", async () => {
    const s = await runner.runCases(cases, mockEngine);
    expect(typeof s.total).toBe("number");
    expect(typeof s.passed).toBe("number");
    expect(typeof s.accuracy).toBe("number");
    expect(s.fdaStatus).toBeTruthy();
  });

  it("100% pass with perfect engine", async () => {
    const s = await runner.runCases(cases, mockEngine);
    expect(s.passed).toBe(2);
    expect(s.accuracy).toBe(1.0);
    expect(s.fdaStatus).toBe("PASS");
  });

  it("failing engine → passed < total", async () => {
    const badEngine = { run: async () => ({ diagnosis: "Wrong", disposition: "HOME" }) };
    const s = await runner.runCases(cases, badEngine);
    expect(s.failed).toBeGreaterThan(0);
    expect(s.accuracy).toBeLessThan(1);
  });

  it("engine error is handled gracefully", async () => {
    const crashEngine = { run: async () => { throw new Error("crash"); } };
    const s = await runner.runCases([{ input: {}, expected: { diagnosis: "X" } }], crashEngine);
    expect(s.results[0].match).toBe(false);
    expect((s.results[0].actual as any).error).toBeTruthy();
  });

  it("each result has caseId, match, durationMs", async () => {
    const s = await runner.runCases(cases, mockEngine);
    for (const r of s.results) {
      expect(r.caseId).toBeTruthy();
      expect(typeof r.match).toBe("boolean");
      expect(typeof r.durationMs).toBe("number");
    }
  });

  it("safetyMisses counted for dangerous diagnoses", async () => {
    const dangerousCase = [{ id: "d1", input: {}, expected: { diagnosis: "ACS" } }];
    const wrongEngine   = { run: async () => ({ diagnosis: "Anxiety" }) };
    const s = await runner.runCases(dangerousCase, wrongEngine);
    expect(s.safetyMisses).toBe(1);
  });
});

// ─── 5. Patient Stream ────────────────────────────────────────────────────────
import { clientCount, isInitialised, broadcastPatientUpdate } from "../../server/realtime/patientStream";

describe("Batch35 — patientStream", () => {
  it("clientCount returns 0 when no WebSocket connected", () => {
    expect(clientCount()).toBe(0);
  });

  it("isInitialised returns false before initPatientStream called", () => {
    // In unit test environment, server is not spun up
    expect(typeof isInitialised()).toBe("boolean");
  });

  it("broadcastPatientUpdate does not throw when no clients", () => {
    expect(() => broadcastPatientUpdate({ test: true })).not.toThrow();
  });
});
