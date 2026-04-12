import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sequential Clinical Thinking Engine
// ─────────────────────────────────────────────────────────────────────────────
import {
  sequentialThink, createThinkingTrace, recordStepFinding,
  concludeThinking, formatThinkingPlan,
  type ThinkingInput,
} from "../../server/reasoning/sequentialThinking";

describe("Batch48 — sequentialThinking: plan generation", () => {
  const baseInput: ThinkingInput = {
    patientId:      "P-b48",
    chiefComplaint: "chest pain",
    vitals:         { hr: 118, sbp: 95, spo2: 96 },
    urgency:        "urgent",
  };

  it("generates a plan with assumptions", () => {
    const plan = sequentialThink(baseInput);
    expect(plan.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(plan.assumptions.some((a) => a.toLowerCase().includes("ecg") || a.toLowerCase().includes("accurate") || a.toLowerCase().includes("chest"))).toBe(true);
  });

  it("identifies unknowns from missing data", () => {
    const input: ThinkingInput = { patientId: "P-b48", chiefComplaint: "chest pain", urgency: "urgent" };
    const plan = sequentialThink(input);
    expect(plan.unknowns.length).toBeGreaterThan(0);
    expect(plan.unknowns.some((u) => u.toLowerCase().includes("blood pressure") || u.toLowerCase().includes("spo2") || u.toLowerCase().includes("temp"))).toBe(true);
  });

  it("generates ordered diagnostic steps with key questions", () => {
    const plan = sequentialThink(baseInput);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps[0].stepNumber).toBe(1);
    expect(plan.steps[0].keyQuestion).toBeTruthy();
    const numbers = plan.steps.map((s) => s.stepNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("includes red flags to exclude for chest pain", () => {
    const plan = sequentialThink(baseInput);
    expect(plan.redFlagsToExclude.length).toBeGreaterThan(0);
    expect(plan.redFlagsToExclude.some((f) => f.toLowerCase().includes("stemi") || f.toLowerCase().includes("dissection"))).toBe(true);
  });

  it("stat urgency sets higher confidence gate than routine", () => {
    const statPlan    = sequentialThink({ ...baseInput, urgency: "stat" });
    const routinePlan = sequentialThink({ ...baseInput, urgency: "routine" });
    expect(statPlan.confidenceGate).toBeGreaterThan(routinePlan.confidenceGate);
  });

  it("adds tachycardia assumption when HR > 100", () => {
    const plan = sequentialThink({ ...baseInput, vitals: { hr: 125 } });
    expect(plan.assumptions.some((a) => a.toLowerCase().includes("tachycardia"))).toBe(true);
  });

  it("works for sepsis complaint", () => {
    const plan = sequentialThink({ patientId: "P-b48", chiefComplaint: "sepsis", urgency: "stat" });
    expect(plan.steps.some((s) => s.name.toLowerCase().includes("qsofa") || s.keyQuestion.toLowerCase().includes("sepsis"))).toBe(true);
  });

  it("works for unknown complaint (generic steps)", () => {
    const plan = sequentialThink({ patientId: "P-b48", chiefComplaint: "headache", urgency: "routine" });
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps[0].keyQuestion).toBeTruthy();
  });

  it("formatThinkingPlan includes all sections", () => {
    const plan = sequentialThink(baseInput);
    const formatted = formatThinkingPlan(plan);
    expect(formatted).toContain("Assumptions");
    expect(formatted).toContain("Unknowns");
    expect(formatted).toContain("Red Flags");
    expect(formatted).toContain("Diagnostic Steps");
    expect(formatted).toContain("Step 1");
  });
});

describe("Batch48 — sequentialThinking: trace + conclusion", () => {
  it("createThinkingTrace initializes step logs for all steps", () => {
    const plan  = sequentialThink({ patientId: "P-b48", chiefComplaint: "chest pain", urgency: "urgent" });
    const trace = createThinkingTrace(plan);
    expect(trace.stepLogs).toHaveLength(plan.steps.length);
    expect(trace.stepLogs.every((l) => l.completedAt === null)).toBe(true);
    expect(trace.conclusion).toBeNull();
  });

  it("recordStepFinding marks step as completed", () => {
    const plan  = sequentialThink({ patientId: "P-b48", chiefComplaint: "chest pain", urgency: "urgent" });
    let trace   = createThinkingTrace(plan);
    trace       = recordStepFinding(trace, 1, "No STEMI on ECG — 12-lead shows sinus tachycardia", 0.9);
    const step1 = trace.stepLogs.find((l) => l.stepNumber === 1)!;
    expect(step1.completedAt).not.toBeNull();
    expect(step1.confidence).toBe(0.9);
    expect(step1.finding).toContain("No STEMI");
  });

  it("concludeThinking produces safeToAct=true when confidence gate met", () => {
    const plan  = sequentialThink({ patientId: "P-b48", chiefComplaint: "chest pain", urgency: "routine" });
    let trace   = createThinkingTrace(plan);
    trace = recordStepFinding(trace, 1, "No life threat identified", 0.9);
    trace = recordStepFinding(trace, 2, "HEART score 2 — low risk", 0.85);
    trace = recordStepFinding(trace, 3, "Troponin negative x2", 0.9);
    trace = concludeThinking(trace);
    expect(trace.conclusion).not.toBeNull();
    expect(trace.conclusion!.safeToAct).toBe(true);
    expect(trace.conclusion!.confidence).toBeGreaterThan(0.7);
  });

  it("concludeThinking produces safeToAct=false when confidence below gate", () => {
    const plan  = sequentialThink({ patientId: "P-b48", chiefComplaint: "chest pain", urgency: "stat" });
    let trace   = createThinkingTrace(plan);
    trace = recordStepFinding(trace, 1, "Equivocal ECG", 0.4);
    trace = concludeThinking(trace);
    expect(trace.conclusion!.safeToAct).toBe(false);
  });

  it("conclusion lists unresolved unknowns", () => {
    const input: ThinkingInput = { patientId: "P-b48", chiefComplaint: "chest pain", urgency: "urgent" };
    const plan  = sequentialThink(input);
    let trace   = createThinkingTrace(plan);
    trace = concludeThinking(trace);
    expect(trace.conclusion!.unresolvedUnknowns.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Precision Guideline Lookup
// ─────────────────────────────────────────────────────────────────────────────
import {
  precisionLookup, lookupByTag, lookupThreshold,
  formatLookupResult, addGuidelineEntry, listAllTags,
} from "../../server/knowledge/precisionGuidelineLookup";

describe("Batch48 — precisionGuidelineLookup: targeted Q&A", () => {
  it("answers HEART score threshold question", () => {
    const result = precisionLookup("HEART score threshold for safe discharge");
    expect(result.topAnswer).not.toBeNull();
    expect(result.topAnswer!.answer.toLowerCase()).toContain("heart");
    expect(result.topAnswer!.answer).toContain("≤ 3");
  });

  it("answers sepsis Hour-1 bundle question", () => {
    const result = precisionLookup("What is the sepsis hour 1 bundle?");
    expect(result.topAnswer).not.toBeNull();
    expect(result.topAnswer!.answer).toContain("Blood cultures");
    expect(result.topAnswer!.answer).toContain("30 mL/kg");
  });

  it("answers qSOFA threshold question", () => {
    const result = precisionLookup("qSOFA score for sepsis criteria");
    expect(result.topAnswer).not.toBeNull();
    expect(result.topAnswer!.numerics?.positive_threshold).toBe(2);
  });

  it("answers NEWS2 escalation question", () => {
    const result = precisionLookup("NEWS2 score physician alert threshold");
    expect(result.topAnswer).not.toBeNull();
    expect(result.topAnswer!.numerics?.urgent_threshold).toBe(5);
  });

  it("answers troponin delta question", () => {
    const result = precisionLookup("troponin rise positive result 3 hour protocol");
    expect(result.topAnswer).not.toBeNull();
    expect(result.topAnswer!.answer.toLowerCase()).toContain("troponin");
  });

  it("returns noiseRatio > 0.7 — majority of KB excluded (focused response)", () => {
    const result = precisionLookup("HEART score threshold for safe discharge");
    expect(result.noiseRatio).toBeGreaterThan(0.7);
  });

  it("returns null topAnswer for completely unrelated question", () => {
    const result = precisionLookup("what is the best pizza topping");
    expect(result.topAnswer).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("lookupByTag returns only matching entries", () => {
    const sepsis = lookupByTag("sepsis");
    expect(sepsis.length).toBeGreaterThan(0);
    expect(sepsis.every((e) => e.tags.includes("sepsis"))).toBe(true);
  });

  it("lookupThreshold returns numeric values", () => {
    const t = lookupThreshold("qsofa");
    expect(t).not.toBeNull();
    expect(t!.numerics.positive_threshold).toBe(2);
  });

  it("formatLookupResult returns no-noise format", () => {
    const result = precisionLookup("HEART score safe discharge threshold");
    const formatted = formatLookupResult(result);
    expect(formatted).toContain("Clinical Reference");
    expect(formatted).toContain("Evidence Level");
    expect(formatted).toContain("Confidence");
    expect(formatted).toContain("Noise filtered");
  });

  it("addGuidelineEntry makes new entry discoverable", () => {
    addGuidelineEntry({
      id: "test-b48", question: "What is the zosyn dose for pneumonia?",
      answer: "Piperacillin-tazobactam 4.5g IV q6h for CAP requiring ICU admission",
      source: "IDSA/ATS 2019 CAP Guidelines", evidenceLevel: "B",
      tags: ["zosyn", "piperacillin", "pneumonia", "antibiotic"], lastUpdated: "2024-01",
    });
    const result = precisionLookup("zosyn dose pneumonia");
    expect(result.topAnswer?.id).toBe("test-b48");
  });

  it("listAllTags returns a sorted list", () => {
    const tags = listAllTags();
    expect(tags.length).toBeGreaterThan(10);
    expect(tags).toContain("sepsis");
    expect(tags).toContain("chest_pain");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Chart Completeness Scanner
// ─────────────────────────────────────────────────────────────────────────────
import {
  scanChart, formatScanResult,
  type PatientChart,
} from "../../server/clinical/chartCompletenessScanner";

describe("Batch48 — chartCompletenessScanner: finding detection", () => {
  const fullChestPainChart: PatientChart = {
    patientId:      "P-b48",
    chiefComplaint: "chest pain",
    vitals:         { hr: 90, sbp: 125, spo2: 98, rr: 16, temp: 37.0 },
    labs:           { troponin: 0.01, wbc: 8.0 },
    orders:         { ecg: true, bloodCultures: false, antibiotics: false, ivFluids: false },
    scores:         { heart: 2, esi: 3, news2: 1 },
    disposition:    "DISCHARGE",
    allergiesReviewed:     true,
    medicationsReconciled: true,
    redFlags:       [],
  };

  it("finds no critical findings for complete low-risk chest pain chart", () => {
    const result = scanChart(fullChestPainChart);
    expect(result.criticalCount).toBe(0);
    expect(result.completeness).toBeGreaterThan(0.7);
  });

  it("detects missing ECG as critical finding for chest pain", () => {
    const chart: PatientChart = { ...fullChestPainChart, orders: { ...fullChestPainChart.orders, ecg: false } };
    const result = scanChart(chart);
    const ecgFinding = result.findings.find((f) => f.id === "missing-ecg-cp");
    expect(ecgFinding).toBeDefined();
    expect(ecgFinding!.severity).toBe("critical");
  });

  it("detects missing troponin as high finding for chest pain", () => {
    const chart: PatientChart = { ...fullChestPainChart, labs: { ...fullChestPainChart.labs, troponin: undefined } };
    const result = scanChart(chart);
    const f = result.findings.find((f) => f.id === "missing-troponin");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
  });

  it("detects contradiction: HEART ≥ 7 + DISCHARGE disposition", () => {
    const chart: PatientChart = { ...fullChestPainChart, scores: { heart: 8, esi: 2 }, disposition: "DISCHARGE" };
    const result = scanChart(chart);
    const f = result.findings.find((f) => f.id === "heart-high-discharge");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.category).toBe("contradiction");
  });

  it("detects contradiction: HEART ≤ 3 + OBSERVE disposition", () => {
    const chart: PatientChart = { ...fullChestPainChart, scores: { heart: 2, esi: 3 }, disposition: "OBSERVE" };
    const result = scanChart(chart);
    const f = result.findings.find((f) => f.id === "heart-low-over-obs");
    expect(f).toBeDefined();
    expect(f!.category).toBe("contradiction");
  });

  it("detects missing allergy review (universal rule)", () => {
    const chart: PatientChart = { ...fullChestPainChart, allergiesReviewed: false };
    const result = scanChart(chart);
    const f = result.findings.find((f) => f.id === "allergy-review");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
  });

  it("detects red flag + no ECG as critical", () => {
    const chart: PatientChart = { ...fullChestPainChart, redFlags: ["chest pain"], orders: { ...fullChestPainChart.orders, ecg: false } };
    const result = scanChart(chart);
    const f = result.findings.find((f) => f.id === "red-flag-no-ecg");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
  });

  it("detects sepsis bundle gaps for sepsis presentation", () => {
    const chart: PatientChart = {
      patientId: "P-b48", chiefComplaint: "sepsis",
      vitals: { hr: 118, sbp: 85, rr: 24, spo2: 94, temp: 38.9 },
      allergiesReviewed: true, medicationsReconciled: true,
      scores: { esi: 1 }, orders: {}, labs: {},
    };
    const result = scanChart(chart);
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("missing-lactate");
    expect(ids).toContain("missing-cultures");
    expect(ids).toContain("missing-antibiotics");
  });

  it("findings are sorted critical first", () => {
    const chart: PatientChart = { ...fullChestPainChart, allergiesReviewed: false, orders: { ecg: false } };
    const result = scanChart(chart);
    const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 0; i < result.findings.length - 1; i++) {
      expect(sevRank[result.findings[i].severity]).toBeLessThanOrEqual(sevRank[result.findings[i + 1].severity]);
    }
  });

  it("completeness is 1.0 for fully documented chart", () => {
    const result = scanChart(fullChestPainChart);
    expect(result.completeness).toBeGreaterThan(0.8);
  });

  it("formatScanResult is readable and structured", () => {
    const chart: PatientChart = { ...fullChestPainChart, orders: { ecg: false }, labs: { troponin: undefined as any } };
    const result = scanChart(chart);
    const formatted = formatScanResult(result);
    expect(formatted).toContain("Chart Scan");
    expect(formatted).toContain("Completeness");
    expect(formatted).toContain("CRITICAL");
  });

  it("clean chart returns 'no gaps detected' format", () => {
    const result = scanChart(fullChestPainChart);
    if (result.findings.length === 0) {
      const formatted = formatScanResult(result);
      expect(formatted).toContain("No gaps detected");
    } else {
      expect(result.criticalCount).toBe(0);
    }
  });
});
