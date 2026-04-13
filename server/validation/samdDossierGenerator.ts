/**
 * SaMD Dossier Generator
 * Produces FDA 510(k)-aligned Software as a Medical Device documentation
 * for Class II AI-assisted clinical decision support systems.
 */

import type { ValidationMetrics } from "./clinicalValidationEngine";

export interface SaMDDossier {
  deviceName: string;
  classification: string;
  intendedUse: string;
  modelVersion: string;
  generatedAt: string;
  performance: ValidationMetrics & {
    meetsERNowSensitivityThreshold: boolean;
    clinicalSignificance: string;
  };
  riskAnalysis: {
    majorRisk: string;
    mitigationStrategy: string;
    residualRisk: string;
    riskClass: "IIa" | "IIb";
  };
  validationSummary: {
    datasetSize: number;
    erNowCases: number;
    validationMethod: string;
    validationDate: string;
    passed: boolean;
  };
  auditability: {
    traceLogging: boolean;
    hashChainVerification: boolean;
    replayCapability: boolean;
    physicianoversight: boolean;
  };
  regulatoryNotes: string[];
}

export function generateDossier(data: {
  metrics: ValidationMetrics;
  modelVersion: string;
  validationDate?: string;
}): SaMDDossier {
  const sensitivity = data.metrics.sensitivity;
  const passes = sensitivity >= 0.90;

  return {
    deviceName: "Auralyn Clinical AI Triage System",
    classification: "SaMD Class IIa — Clinical Decision Support",
    intendedUse:
      "AI-assisted clinical triage support for urgent care physicians. " +
      "Provides risk stratification (ROUTINE / URGENT / ER_NOW) to support, " +
      "not replace, physician clinical judgment.",
    modelVersion: data.modelVersion,
    generatedAt: new Date().toISOString(),

    performance: {
      ...data.metrics,
      meetsERNowSensitivityThreshold: passes,
      clinicalSignificance: passes
        ? `ER_NOW sensitivity of ${(sensitivity * 100).toFixed(1)}% meets the 90% minimum threshold for safe deployment.`
        : `⚠ ER_NOW sensitivity of ${(sensitivity * 100).toFixed(1)}% is BELOW the 90% minimum threshold. Deployment blocked.`,
    },

    riskAnalysis: {
      majorRisk: "Under-triage: AI classifies an ER_NOW patient as ROUTINE/URGENT",
      mitigationStrategy:
        "Fail-closed safety pipeline (Stage 3 CRITICAL) blocks output on safety failure. " +
        "Physician approval required for all dispositions before care pathway activation. " +
        "Unified red flag engine provides multi-source escalation.",
      residualRisk:
        "False negative rate of " + (data.metrics.falseNegativeRate * 100).toFixed(1) + "% — " +
        (data.metrics.falseNegativeRate < 0.10 ? "acceptable with physician oversight" : "above acceptable threshold"),
      riskClass: data.metrics.falseNegativeRate < 0.10 ? "IIa" : "IIb",
    },

    validationSummary: {
      datasetSize:      data.metrics.totalCases,
      erNowCases:       data.metrics.confusionMatrix.TP + data.metrics.confusionMatrix.FN,
      validationMethod: "Synthetic patient cohort — vitals-based ground truth labeling. " +
                        "Replace with real-world labeled outcomes before FDA submission.",
      validationDate:   data.validationDate ?? new Date().toISOString().split("T")[0],
      passed:           passes,
    },

    auditability: {
      traceLogging:             true,
      hashChainVerification:    true,
      replayCapability:         true,
      physicianoversight:       true,
    },

    regulatoryNotes: [
      "All AI recommendations require physician review before clinical action.",
      "Audit trail maintained per 21 CFR Part 11 requirements.",
      "Model updates gated by RLHF governance queue — no autonomous deployment.",
      "Validation dataset must be replaced with real-world labeled clinical data before 510(k) submission.",
      `Minimum ER_NOW sensitivity threshold: 90%. Current: ${(sensitivity * 100).toFixed(1)}%.`,
    ],
  };
}
