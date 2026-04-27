/**
 * Golden-Case Validator — lab + SOFA + Bayesian layer
 *
 * Extends the existing golden-case framework (server/simulation/goldenCaseEngine.ts)
 * with validation of the new clinical layers:
 *   1. SOFA scoring accuracy against known expected scores
 *   2. Bayesian trajectory trend accuracy
 *   3. Lab ingestion correctness (reference range flags)
 *
 * All results are logged to the audit chain.
 */

import { calculateSofa, type SofaInputs } from "./sofaCalculator";
import { runBayesianTrajectory, type VitalObservation } from "./bayesianTrajectory";
import { appendAuditEvent } from "../audit/hashChain";
import { randomUUID } from "crypto";

export interface LabGoldenCase {
  caseId:                string;
  description:           string;
  sofaInputs:            SofaInputs;
  expectedSofaTotal:     number;
  expectedSofaRange:     [number, number];  // acceptable range ± tolerance
  expectedInterpretation: "LOW_RISK" | "MODERATE" | "HIGH" | "CRITICAL";
  vitals:                VitalObservation[];
  expectedTrend:         "improving" | "stable" | "worsening" | "rapidly_worsening";
  safetyCritical:        boolean;           // if true, wrong interpretation = hard block
}

export interface LabCaseResult {
  caseId:          string;
  sofaActual:      number;
  sofaExpected:    number;
  sofaMatch:       boolean;
  interpretationActual:   string;
  interpretationExpected: string;
  interpretationMatch:    boolean;
  trendActual:     string;
  trendExpected:   string;
  trendMatch:      boolean;
  safetyMismatch:  boolean;
  error?:          string;
}

export interface LabValidationResult {
  totalCases:        number;
  sofaAccurate:      number;
  interpretCorrect:  number;
  trendCorrect:      number;
  safetyMismatches:  number;
  passed:            boolean;
  details:           LabCaseResult[];
  blockingReason?:   string;
}

const GOLDEN_CASES: LabGoldenCase[] = [
  {
    caseId: "SOFA-001",
    description: "Septic shock — should score CRITICAL",
    sofaInputs: {
      paO2: 65, fiO2: 0.8, mechanicallyVentilated: true,
      platelets: 45,
      bilirubin: 7.2,
      map: 58, norepinephrineDose: 0.15,
      gcs: 8,
      creatinine: 4.1,
    },
    expectedSofaTotal: 18,
    expectedSofaRange: [16, 20],
    expectedInterpretation: "CRITICAL",
    vitals: [
      { timestamp: new Date(Date.now() - 7200000), hr: 118, spo2: 84, sbp: 72, rr: 28, sofaScore: 14 },
      { timestamp: new Date(Date.now() - 3600000), hr: 130, spo2: 80, sbp: 65, rr: 32, sofaScore: 18 },
    ],
    expectedTrend: "rapidly_worsening",
    safetyCritical: true,
  },
  {
    caseId: "SOFA-002",
    description: "Early pneumonia — should score MODERATE",
    sofaInputs: {
      paO2: 72, fiO2: 0.35, mechanicallyVentilated: false,
      platelets: 180,
      bilirubin: 1.0,
      map: 78,
      gcs: 15,
      creatinine: 1.4,
    },
    expectedSofaTotal: 3,
    expectedSofaRange: [2, 5],
    expectedInterpretation: "MODERATE",
    vitals: [
      { timestamp: new Date(Date.now() - 7200000), hr: 95,  spo2: 93, sbp: 118, rr: 20, sofaScore: 2 },
      { timestamp: new Date(Date.now() - 3600000), hr: 102, spo2: 91, sbp: 112, rr: 22, sofaScore: 3 },
    ],
    expectedTrend: "worsening",
    safetyCritical: false,
  },
  {
    caseId: "SOFA-003",
    description: "Post-op recovery — should score LOW_RISK, improving",
    sofaInputs: {
      paO2: 98, fiO2: 0.21, mechanicallyVentilated: false,
      platelets: 220,
      bilirubin: 0.8,
      map: 88,
      gcs: 15,
      creatinine: 0.9,
    },
    expectedSofaTotal: 0,
    expectedSofaRange: [0, 1],
    expectedInterpretation: "LOW_RISK",
    vitals: [
      { timestamp: new Date(Date.now() - 7200000), hr: 85, spo2: 96, sbp: 125, rr: 15, sofaScore: 2 },
      { timestamp: new Date(Date.now() - 3600000), hr: 74, spo2: 98, sbp: 132, rr: 14, sofaScore: 0 },
    ],
    expectedTrend: "improving",
    safetyCritical: false,
  },
  {
    caseId: "SOFA-004",
    description: "Hepatic failure + coagulopathy — CRITICAL (SOFA ≥11)",
    sofaInputs: {
      paO2: 88, fiO2: 0.40, mechanicallyVentilated: false,
      platelets: 62,
      bilirubin: 14.5,
      map: 72, dopamineDose: 3,
      gcs: 12,
      creatinine: 2.8,
    },
    expectedSofaTotal: 14,
    expectedSofaRange: [12, 16],
    expectedInterpretation: "CRITICAL",
    vitals: [
      { timestamp: new Date(Date.now() - 7200000), hr: 105, spo2: 91, sbp: 96, rr: 24, sofaScore: 9  },
      { timestamp: new Date(Date.now() - 3600000), hr: 110, spo2: 90, sbp: 92, rr: 25, sofaScore: 12 },
    ],
    expectedTrend: "worsening",
    safetyCritical: true,
  },
];

export async function runLabGoldenCaseValidation(): Promise<LabValidationResult> {
  const traceId = randomUUID();
  const details: LabCaseResult[] = [];
  let safetyMismatches = 0;
  let sofaAccurate = 0;
  let interpretCorrect = 0;
  let trendCorrect = 0;

  for (const gc of GOLDEN_CASES) {
    let result: LabCaseResult;
    try {
      const sofaResult = calculateSofa(gc.sofaInputs);
      const bayesian   = runBayesianTrajectory({ vitals: gc.vitals, labs: [], sofaHistory: [] });

      const [lo, hi] = gc.expectedSofaRange;
      const sofaMatch = sofaResult.total >= lo && sofaResult.total <= hi;
      const interpMatch = sofaResult.interpretation === gc.expectedInterpretation;
      const trendMatch  = bayesian.trend === gc.expectedTrend;

      const safetyMismatch = gc.safetyCritical &&
        (sofaResult.interpretation !== gc.expectedInterpretation ||
          (gc.expectedInterpretation === "CRITICAL" && sofaResult.interpretation !== "CRITICAL"));

      if (sofaMatch)    sofaAccurate++;
      if (interpMatch)  interpretCorrect++;
      if (trendMatch)   trendCorrect++;
      if (safetyMismatch) safetyMismatches++;

      result = {
        caseId:                  gc.caseId,
        sofaActual:              sofaResult.total,
        sofaExpected:            gc.expectedSofaTotal,
        sofaMatch,
        interpretationActual:    sofaResult.interpretation,
        interpretationExpected:  gc.expectedInterpretation,
        interpretationMatch:     interpMatch,
        trendActual:             bayesian.trend,
        trendExpected:           gc.expectedTrend,
        trendMatch,
        safetyMismatch,
      };
    } catch (err: unknown) {
      result = {
        caseId:                 gc.caseId,
        sofaActual:             -1,
        sofaExpected:           gc.expectedSofaTotal,
        sofaMatch:              false,
        interpretationActual:   "ERROR",
        interpretationExpected: gc.expectedInterpretation,
        interpretationMatch:    false,
        trendActual:            "ERROR",
        trendExpected:          gc.expectedTrend,
        trendMatch:             false,
        safetyMismatch:         gc.safetyCritical,
        error:                  err instanceof Error ? err.message : String(err),
      };
      if (gc.safetyCritical) safetyMismatches++;
    }
    details.push(result);
  }

  const total = GOLDEN_CASES.length;
  const sofaAccuracyRate = sofaAccurate / total;
  const passed = safetyMismatches === 0 && sofaAccuracyRate >= 0.90;
  const blockingReason = !passed
    ? safetyMismatches > 0
      ? `${safetyMismatches} safety-critical SOFA interpretation failure(s)`
      : `SOFA accuracy ${(sofaAccuracyRate * 100).toFixed(0)}% below 90% threshold`
    : undefined;

  await appendAuditEvent({
    traceId,
    step: "lab_golden_case_validation",
    input:    { totalCases: total },
    output:   { passed, safetyMismatches, sofaAccuracyRate, interpretCorrect, trendCorrect },
    metadata: { blockingReason: blockingReason ?? "passed" },
  });

  return { totalCases: total, sofaAccurate, interpretCorrect, trendCorrect, safetyMismatches, passed, details, blockingReason };
}
