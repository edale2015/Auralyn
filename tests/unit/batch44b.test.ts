import { describe, it, expect } from "vitest";

// ─── Symptom Text Analyzer ────────────────────────────────────────────────────
import { analyzeSymptomText } from "../../server/triage/symptomTextAnalyzer";

describe("Batch44b — symptomTextAnalyzer", () => {
  it("chest pain + diaphoresis → CRITICAL (2 red flags)", () => {
    const r = analyzeSymptomText("I have chest pain with diaphoresis and nausea");
    expect(r.riskLevel).toBe("CRITICAL");
    expect(r.primaryConditions).toContain("chest pain");
    expect(r.redFlags.length).toBeGreaterThanOrEqual(2);
  });

  it("chest pain alone (no co-occurrence) → MODERATE", () => {
    const r = analyzeSymptomText("I have chest pain");
    expect(r.riskLevel).toBe("MODERATE");
    expect(r.primaryConditions).toContain("chest pain");
  });

  it("chest pain + shortness of breath → HIGH (1 co-occurrence)", () => {
    const r = analyzeSymptomText("chest pain with shortness of breath");
    expect(["HIGH", "CRITICAL"]).toContain(r.riskLevel);
    expect(r.redFlags).toContain("shortness of breath");
  });

  it("fever + confusion → CRITICAL (2 co-occurrences with tachycardia)", () => {
    const r = analyzeSymptomText("high fever with confusion and tachycardia");
    expect(r.riskLevel).toBe("CRITICAL");
    expect(r.primaryConditions).toContain("fever");
  });

  it("headache without co-occurrence → MODERATE (headache is a flagged condition)", () => {
    const r = analyzeSymptomText("mild headache since this morning");
    // headache is in RED_FLAGS (thunderclap, meningitis risk) → MODERATE without co-occurrence
    expect(r.riskLevel).toBe("MODERATE");
    expect(r.redFlags).toHaveLength(0);
    expect(r.primaryConditions).toContain("headache");
  });

  it("auto-critical term 'cardiac arrest' → CRITICAL immediately", () => {
    const r = analyzeSymptomText("patient in cardiac arrest");
    expect(r.riskLevel).toBe("CRITICAL");
    expect(r.confidence).toBeGreaterThan(0.95);
  });

  it("auto-high term 'seizure' → HIGH", () => {
    const r = analyzeSymptomText("patient is having a seizure");
    expect(["HIGH", "CRITICAL"]).toContain(r.riskLevel);
  });

  it("cough + hemoptysis → HIGH (1 co-occurrence)", () => {
    const r = analyzeSymptomText("persistent cough with hemoptysis");
    expect(["HIGH", "CRITICAL"]).toContain(r.riskLevel);
    expect(r.redFlags).toContain("hemoptysis");
  });

  it("headache + worst headache of life → CRITICAL", () => {
    const r = analyzeSymptomText("worst headache of my life, sudden onset with vomiting");
    expect(r.riskLevel).toBe("CRITICAL");
  });

  it("normal sore throat → LOW", () => {
    const r = analyzeSymptomText("I have a mild sore throat and runny nose");
    expect(r.riskLevel).toBe("LOW");
  });

  it("returns required fields", () => {
    const r = analyzeSymptomText("test input");
    expect(typeof r.riskLevel).toBe("string");
    expect(Array.isArray(r.redFlags)).toBe(true);
    expect(Array.isArray(r.primaryConditions)).toBe(true);
    expect(Array.isArray(r.coOccurrences)).toBe(true);
    expect(typeof r.confidence).toBe("number");
    expect(typeof r.reasoning).toBe("string");
    expect(typeof r.analyzedAt).toBe("string");
  });
});

// ─── Smart Intake Router ──────────────────────────────────────────────────────
import { routeIntake, batchRouteIntake } from "../../server/triage/smartIntakeRouter";

describe("Batch44b — smartIntakeRouter", () => {
  it("CRITICAL risk → escalation stage + EMERGENCY disposition", () => {
    const r = routeIntake("p1", "cardiac arrest, not breathing");
    expect(r.stage).toBe("escalation");
    expect(r.disposition).toBe("EMERGENCY");
  });

  it("escalation stage has 911 / ER options", () => {
    const r = routeIntake("p1", "chest pain with diaphoresis and syncope");
    expect(r.stage).toBe("escalation");
    const actions = r.options.map((o) => o.action);
    expect(actions.some((a) => a.includes("911") || a.includes("er") || a.includes("nurse"))).toBe(true);
  });

  it("HIGH risk → escalation stage", () => {
    const r = routeIntake("p2", "chest pain with shortness of breath");
    expect(r.stage).toBe("escalation");
  });

  it("MODERATE risk → urgent_booking stage + URGENT disposition", () => {
    const r = routeIntake("p3", "I have a fever since yesterday");
    expect(r.stage).toBe("urgent_booking");
    expect(r.disposition).toBe("URGENT");
  });

  it("urgent_booking stage has book appointment option", () => {
    const r = routeIntake("p3", "I have a cough for a week");
    expect(r.stage).toBe("urgent_booking");
    const actions = r.options.map((o) => o.action);
    expect(actions.some((a) => a.includes("book") || a.includes("virtual"))).toBe(true);
  });

  it("LOW risk → routine_booking stage + ROUTINE disposition", () => {
    const r = routeIntake("p4", "mild sore throat and runny nose");
    expect(r.stage).toBe("routine_booking");
    expect(r.disposition).toBe("ROUTINE");
  });

  it("routine_booking has book appointment option", () => {
    const r = routeIntake("p4", "I would like a check-up");
    expect(r.stage).toBe("routine_booking");
    expect(r.options.length).toBeGreaterThan(0);
  });

  it("response includes analysis object", () => {
    const r = routeIntake("p5", "stomach ache");
    expect(r.analysis).toBeDefined();
    expect(r.analysis.riskLevel).toBeDefined();
  });

  it("safetyHooks is an array", () => {
    const r = routeIntake("p6", "chest pain with diaphoresis and nausea");
    expect(Array.isArray(r.safetyHooks)).toBe(true);
  });

  it("batchRouteIntake processes multiple patients", () => {
    const results = batchRouteIntake([
      { patientId: "p1", symptoms: "chest pain with diaphoresis" },
      { patientId: "p2", symptoms: "mild sore throat" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].stage).toBe("escalation");
    expect(results[1].stage).toBe("routine_booking");
  });

  it("redFlags array matches analyzer output", () => {
    const r = routeIntake("p7", "fever with confusion and tachycardia");
    expect(r.redFlags.length).toBeGreaterThan(0);
  });
});
