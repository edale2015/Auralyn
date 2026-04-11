import { calculateCentorScore } from "../clinical/centorEngine";
import { calculateStrepProbability } from "../clinical/bayesianStrepEngine";
import { evaluateRisk, type RiskAlert } from "../monitoring/riskGovernanceEngine";
import { calculateConfidence, type ConfidenceTier } from "../clinical/confidenceEngine";

export interface SimulationPatient {
  centor: number;
  prob: number;
  decision: "ANTIBIOTIC" | "NO_ANTIBIOTIC";
  correctDecision: boolean;
  confidence: ConfidenceTier;
  riskFlags: RiskAlert[];
  symptoms: {
    fever: boolean;
    tonsillarExudate: boolean;
    tenderAnteriorCervicalNodes: boolean;
    absenceOfCough: boolean;
    age: number;
  };
}

export interface SimulationSummary {
  totalRuns: number;
  antibioticRate: number;
  noAntibioticRate: number;
  meanCentorScore: number;
  meanProbability: number;
  highProbabilityCount: number;
  accuracy: number;
  criticalRiskCount: number;
  warningRiskCount: number;
  highConfidenceRate: number;
}

export interface ScenarioSummary {
  scenario: string;
  summary: SimulationSummary;
}

function syntheticSymptoms(scenario: string): {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderAnteriorCervicalNodes: boolean;
  absenceOfCough: boolean;
  age: number;
} {
  switch (scenario) {
    case "high_acuity":
      return {
        fever:                        Math.random() > 0.35,
        tonsillarExudate:             Math.random() > 0.45,
        tenderAnteriorCervicalNodes:  Math.random() > 0.40,
        absenceOfCough:               Math.random() > 0.30,
        age:                          Math.floor(Math.random() * 40) + 5,
      };
    case "low_acuity":
      return {
        fever:                        Math.random() > 0.85,
        tonsillarExudate:             Math.random() > 0.92,
        tenderAnteriorCervicalNodes:  Math.random() > 0.88,
        absenceOfCough:               Math.random() > 0.60,
        age:                          Math.floor(Math.random() * 40) + 30,
      };
    default:
      return {
        fever:                        Math.random() > 0.75,
        tonsillarExudate:             Math.random() > 0.85,
        tenderAnteriorCervicalNodes:  Math.random() > 0.70,
        absenceOfCough:               Math.random() > 0.50,
        age:                          Math.floor(Math.random() * 80),
      };
  }
}

export async function runSimulation(
  n: number = 10_000,
  scenario: string = "default"
): Promise<SimulationPatient[]> {
  const results: SimulationPatient[] = [];

  for (let i = 0; i < n; i++) {
    const symptoms = syntheticSymptoms(scenario);

    const centor = calculateCentorScore({
      fever:                       symptoms.fever,
      tonsillarExudate:            symptoms.tonsillarExudate,
      tenderAnteriorCervicalNodes: symptoms.tenderAnteriorCervicalNodes,
      absenceOfCough:              symptoms.absenceOfCough,
      age:                         symptoms.age,
    });

    const prob = calculateStrepProbability({
      fever:   symptoms.fever,
      exudate: symptoms.tonsillarExudate,
      nodes:   symptoms.tenderAnteriorCervicalNodes,
      cough:   !symptoms.absenceOfCough,
    });

    const decision: SimulationPatient["decision"] = prob > 0.5 ? "ANTIBIOTIC" : "NO_ANTIBIOTIC";

    const correctDecision =
      (prob > 0.6 && decision === "ANTIBIOTIC") ||
      (prob <= 0.6 && decision === "NO_ANTIBIOTIC");

    const confidence = calculateConfidence(prob);
    const riskFlags  = evaluateRisk({ decision, probability: prob, centorScore: centor });

    results.push({ centor, prob, decision, correctDecision, confidence, riskFlags, symptoms });
  }

  return results;
}

export function summarizeSimulation(results: SimulationPatient[]): SimulationSummary {
  const n = results.length;
  if (n === 0) {
    return {
      totalRuns: 0, antibioticRate: 0, noAntibioticRate: 0,
      meanCentorScore: 0, meanProbability: 0, highProbabilityCount: 0,
      accuracy: 0, criticalRiskCount: 0, warningRiskCount: 0, highConfidenceRate: 0,
    };
  }

  const antibioticCount  = results.filter((r) => r.decision === "ANTIBIOTIC").length;
  const correctCount     = results.filter((r) => r.correctDecision).length;
  const criticalRiskCount = results.filter((r) =>
    r.riskFlags.some((a) => a.severity === "critical")
  ).length;
  const warningRiskCount = results.filter((r) =>
    r.riskFlags.some((a) => a.severity === "warning")
  ).length;
  const highConfidenceCount = results.filter((r) => r.confidence === "HIGH").length;

  return {
    totalRuns:          n,
    antibioticRate:     Math.round((antibioticCount / n) * 1000) / 1000,
    noAntibioticRate:   Math.round(((n - antibioticCount) / n) * 1000) / 1000,
    meanCentorScore:    Math.round((results.reduce((s, r) => s + r.centor, 0) / n) * 100) / 100,
    meanProbability:    Math.round((results.reduce((s, r) => s + r.prob, 0) / n) * 1000) / 1000,
    highProbabilityCount: results.filter((r) => r.prob > 0.6).length,
    accuracy:           Math.round((correctCount / n) * 1000) / 1000,
    criticalRiskCount,
    warningRiskCount,
    highConfidenceRate: Math.round((highConfidenceCount / n) * 1000) / 1000,
  };
}

export async function runScenarios(n: number = 1_000): Promise<ScenarioSummary[]> {
  const scenarios = ["default", "high_acuity", "low_acuity"];
  const out: ScenarioSummary[] = [];

  for (const scenario of scenarios) {
    const results = await runSimulation(n, scenario);
    out.push({ scenario, summary: summarizeSimulation(results) });
  }

  return out;
}
