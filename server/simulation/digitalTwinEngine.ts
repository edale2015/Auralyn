export interface SimulationScenario {
  scenario: string;
  intervention: "none" | "treatment" | "delay";
  riskScore: number;
  outcome: string;
  timeToEvent: string;
  recommendation: string;
}

export function runDigitalTwin(params: { result: any }): SimulationScenario[] {
  const baseRisk = params.result.trajectory?.riskScore ?? params.result.uncertainty ?? 0.35;

  const calc = (delta: number) => {
    const r = Math.max(0, Math.min(1, baseRisk + delta));
    const outcome = r > 0.75 ? "High likelihood of deterioration" : r > 0.50 ? "Moderate risk — close monitoring needed" : r > 0.30 ? "Low-moderate risk — watchful waiting" : "Low risk — stable";
    const time = r > 0.75 ? "< 2 hours" : r > 0.50 ? "2-12 hours" : r > 0.30 ? "12-48 hours" : "stable";
    return { riskScore: Math.round(r * 1000) / 1000, outcome, timeToEvent: time };
  };

  return [
    { scenario: "No Action", intervention: "none", ...calc(+0.25), recommendation: "Do not delay — deterioration likely without intervention" },
    { scenario: "Immediate Treatment", intervention: "treatment", ...calc(-0.28), recommendation: "Initiate treatment now for best outcome trajectory" },
    { scenario: "Delayed Care (4-6h)", intervention: "delay", ...calc(+0.38), recommendation: "Avoid delay — 4-6 hour lag substantially worsens prognosis" },
  ];
}
