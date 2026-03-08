export interface ReasoningResult {
  hypothesis: string;
  confidence: number;
  evidenceSupporting: string[];
  evidenceAgainst: string[];
  nextSteps: string[];
}

export function runClinicalReasoning(symptoms: string[], history: string[]): ReasoningResult {
  const hypotheses: ReasoningResult[] = [];

  if (symptoms.some((s) => s.toLowerCase().includes("fever"))) {
    hypotheses.push({
      hypothesis: "Infectious process",
      confidence: 0.7,
      evidenceSupporting: symptoms.filter((s) => s.toLowerCase().includes("fever") || s.toLowerCase().includes("chills")),
      evidenceAgainst: [],
      nextSteps: ["CBC with differential", "Blood cultures if high fever"],
    });
  }

  if (symptoms.some((s) => s.toLowerCase().includes("cough"))) {
    hypotheses.push({
      hypothesis: "Upper respiratory infection",
      confidence: 0.6,
      evidenceSupporting: symptoms.filter((s) => s.toLowerCase().includes("cough") || s.toLowerCase().includes("congestion")),
      evidenceAgainst: [],
      nextSteps: ["Chest X-ray if persistent", "Consider rapid flu/COVID test"],
    });
  }

  if (hypotheses.length === 0) {
    hypotheses.push({
      hypothesis: "Further evaluation needed",
      confidence: 0.3,
      evidenceSupporting: symptoms,
      evidenceAgainst: [],
      nextSteps: ["Complete history and physical", "Basic labs"],
    });
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence)[0];
}
