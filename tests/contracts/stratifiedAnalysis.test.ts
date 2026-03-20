import { describe, it, expect } from "vitest";
import { stratify } from "../../server/fda/stratifiedAnalysis";
import type { ValidationResult } from "../../server/fda/validationRunner";

function makeResult(overrides: Partial<ValidationResult> & { age?: number }): ValidationResult {
  const age = overrides.age ?? 30;
  return {
    input: { age, complaint: "cough" },
    predicted: "viral-uri",
    actual: "viral-uri",
    correct: overrides.correct ?? true,
    safety: overrides.safety ?? "LOW",
    confidence: overrides.confidence ?? 0.9,
  };
}

describe("Stratified Analysis — age grouping", () => {
  it("groups age < 18 into pediatric", () => {
    const results = [makeResult({ age: 8 }), makeResult({ age: 12 }), makeResult({ age: 25 })];
    const s = stratify(results);
    expect(s.pediatric.count).toBe(2);
    expect(s.adult.count).toBe(1);
  });

  it("puts age exactly 18 into adult", () => {
    const results = [makeResult({ age: 18 }), makeResult({ age: 17 })];
    const s = stratify(results);
    expect(s.adult.count).toBe(1);
    expect(s.pediatric.count).toBe(1);
  });

  it("handles all adults", () => {
    const results = [makeResult({ age: 30 }), makeResult({ age: 45 }), makeResult({ age: 65 })];
    const s = stratify(results);
    expect(s.adult.count).toBe(3);
    expect(s.pediatric.count).toBe(0);
  });

  it("handles all pediatric", () => {
    const results = [makeResult({ age: 5 }), makeResult({ age: 10 }), makeResult({ age: 15 })];
    const s = stratify(results);
    expect(s.pediatric.count).toBe(3);
    expect(s.adult.count).toBe(0);
  });
});

describe("Stratified Analysis — risk grouping", () => {
  it("groups safety HIGH into highRisk", () => {
    const results = [
      makeResult({ safety: "HIGH" }),
      makeResult({ safety: "HIGH" }),
      makeResult({ safety: "LOW" }),
    ];
    const s = stratify(results);
    expect(s.highRisk.count).toBe(2);
    expect(s.lowRisk.count).toBe(1);
  });

  it("groups safety CRITICAL into highRisk", () => {
    const results = [makeResult({ safety: "CRITICAL" }), makeResult({ safety: "LOW" })];
    const s = stratify(results);
    expect(s.highRisk.count).toBe(1);
    expect(s.lowRisk.count).toBe(1);
  });

  it("groups UNKNOWN safety into lowRisk", () => {
    const results = [makeResult({ safety: "UNKNOWN" })];
    const s = stratify(results);
    expect(s.lowRisk.count).toBe(1);
    expect(s.highRisk.count).toBe(0);
  });
});

describe("Stratified Analysis — metrics per group", () => {
  it("computes correct accuracy for each group", () => {
    const results = [
      makeResult({ age: 10, correct: true }),
      makeResult({ age: 10, correct: false }),
      makeResult({ age: 30, correct: true }),
    ];
    const s = stratify(results);
    expect(s.pediatric.metrics.accuracy).toBe(0.5);
    expect(s.adult.metrics.accuracy).toBe(1.0);
  });

  it("passesThreshold reflects group accuracy vs threshold", () => {
    const allCorrect = [makeResult({ age: 30, correct: true }), makeResult({ age: 35, correct: true })];
    const allWrong = [makeResult({ age: 10, correct: false }), makeResult({ age: 12, correct: false })];
    const s = stratify([...allCorrect, ...allWrong], 0.8);
    expect(s.adult.metrics.passesThreshold).toBe(true);
    expect(s.pediatric.metrics.passesThreshold).toBe(false);
  });
});

describe("Stratified Analysis — summary", () => {
  it("summary includes totalGroups and groupsPassing", () => {
    const results = [
      makeResult({ age: 30, correct: true }),
      makeResult({ age: 10, correct: false }),
    ];
    const s = stratify(results, 0.8);
    expect(s.summary.totalGroups).toBeGreaterThanOrEqual(2);
    expect(typeof s.summary.groupsPassing).toBe("number");
    expect(typeof s.summary.worstGroup).toBe("string");
    expect(typeof s.summary.bestGroup).toBe("string");
  });

  it("handles empty result set without crashing", () => {
    const s = stratify([]);
    expect(s.summary.totalGroups).toBe(0);
    expect(s.pediatric.count).toBe(0);
    expect(s.adult.count).toBe(0);
  });
});

describe("Stratified Analysis — combined scenarios", () => {
  it("high-risk pediatric case appears in both groups", () => {
    const results = [makeResult({ age: 8, safety: "HIGH", correct: true })];
    const s = stratify(results);
    expect(s.pediatric.count).toBe(1);
    expect(s.highRisk.count).toBe(1);
  });

  it("low-risk adult case appears in adult and lowRisk", () => {
    const results = [makeResult({ age: 40, safety: "LOW", correct: false })];
    const s = stratify(results);
    expect(s.adult.count).toBe(1);
    expect(s.lowRisk.count).toBe(1);
  });
});
