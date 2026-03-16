import crypto from "crypto";

export interface SafetyMetrics {
  redFlagAccuracy: number;
  diagnosticAccuracy: number;
  protocolCompliance: number;
  questionCoverage: number;
  dispositionAgreement: number;
}

export interface SafetyScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  metrics: SafetyMetrics;
  subscores: { metric: string; value: number; weight: number; weighted: number }[];
  timestamp: number;
  hash: string;
}

const WEIGHTS: Record<keyof SafetyMetrics, { weight: number; label: string }> = {
  redFlagAccuracy: { weight: 0.35, label: "Red Flag Detection" },
  diagnosticAccuracy: { weight: 0.30, label: "Diagnostic Accuracy" },
  protocolCompliance: { weight: 0.20, label: "Protocol Compliance" },
  questionCoverage: { weight: 0.10, label: "Question Coverage" },
  dispositionAgreement: { weight: 0.05, label: "Disposition Agreement" },
};

function gradeFromScore(score: number): SafetyScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export class ClinicalSafetyScoreEngine {
  calculate(metrics: SafetyMetrics): SafetyScore {
    const subscores = Object.entries(WEIGHTS).map(([key, { weight, label }]) => {
      const value = (metrics as any)[key] ?? 0;
      return { metric: label, value, weight, weighted: value * weight };
    });

    const score = subscores.reduce((sum, s) => sum + s.weighted, 0);

    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(metrics))
      .digest("hex")
      .slice(0, 16);

    return {
      score: Number(score.toFixed(2)),
      grade: gradeFromScore(score),
      metrics,
      subscores,
      timestamp: Date.now(),
      hash,
    };
  }

  getDefaultMetrics(): SafetyMetrics {
    return {
      redFlagAccuracy: 96,
      diagnosticAccuracy: 88,
      protocolCompliance: 91,
      questionCoverage: 85,
      dispositionAgreement: 90,
    };
  }
}

export const safetyScoreEngine = new ClinicalSafetyScoreEngine();
