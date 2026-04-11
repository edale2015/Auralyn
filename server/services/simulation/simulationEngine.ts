import { calculateCentorScore } from "../clinical/centorEngine";
import { calculateStrepProbability } from "../clinical/bayesianStrepEngine";

export interface SimulationPatient {
  centor: number;
  prob: number;
  decision: "ANTIBIOTIC" | "NO_ANTIBIOTIC";
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
}

export async function runSimulation(n: number = 10_000): Promise<SimulationPatient[]> {
  const results: SimulationPatient[] = [];

  for (let i = 0; i < n; i++) {
    const symptoms = {
      fever:                      Math.random() > 0.7,
      tonsillarExudate:           Math.random() > 0.8,
      tenderAnteriorCervicalNodes: Math.random() > 0.75,
      absenceOfCough:             Math.random() > 0.5,
      age:                        Math.floor(Math.random() * 80),
    };

    const centor = calculateCentorScore({
      fever:                      symptoms.fever,
      tonsillarExudate:           symptoms.tonsillarExudate,
      tenderAnteriorCervicalNodes: symptoms.tenderAnteriorCervicalNodes,
      absenceOfCough:             symptoms.absenceOfCough,
      age:                        symptoms.age,
    });

    const prob = calculateStrepProbability({
      fever:   symptoms.fever,
      exudate: symptoms.tonsillarExudate,
      nodes:   symptoms.tenderAnteriorCervicalNodes,
      cough:   !symptoms.absenceOfCough,
    });

    const decision: SimulationPatient["decision"] = prob > 0.5 ? "ANTIBIOTIC" : "NO_ANTIBIOTIC";

    results.push({ centor, prob, decision, symptoms });
  }

  return results;
}

export function summarizeSimulation(results: SimulationPatient[]): SimulationSummary {
  const n = results.length;
  if (n === 0) {
    return { totalRuns: 0, antibioticRate: 0, noAntibioticRate: 0, meanCentorScore: 0, meanProbability: 0, highProbabilityCount: 0 };
  }

  const antibioticCount = results.filter((r) => r.decision === "ANTIBIOTIC").length;

  return {
    totalRuns: n,
    antibioticRate:        Math.round((antibioticCount / n) * 1000) / 1000,
    noAntibioticRate:      Math.round(((n - antibioticCount) / n) * 1000) / 1000,
    meanCentorScore:       Math.round((results.reduce((s, r) => s + r.centor, 0) / n) * 100) / 100,
    meanProbability:       Math.round((results.reduce((s, r) => s + r.prob, 0) / n) * 1000) / 1000,
    highProbabilityCount:  results.filter((r) => r.prob > 0.6).length,
  };
}
