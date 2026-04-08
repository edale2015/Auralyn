export interface TrajectoryPrediction {
  trend: "improving" | "stable" | "worsening";
  riskScore: number;
  timeHorizon: string;
  drivers: string[];
  escalationProbability: number;
}

export function predictTrajectory(result: any, memory: any[]): TrajectoryPrediction {
  let risk = 0.25;
  const drivers: string[] = [];

  if ((result.safetyAlerts?.length ?? 0) > 0) {
    risk += 0.45;
    drivers.push("active_safety_alerts");
  }

  const triageLevel = result.triage?.level ?? "routine";
  if (triageLevel === "urgent" || triageLevel === "high") { risk += 0.20; drivers.push("elevated_triage"); }
  if (triageLevel === "critical" || triageLevel === "emergency") { risk += 0.45; drivers.push("emergency_triage"); }

  if ((result.uncertainty ?? 0) > 0.5) { risk += 0.15; drivers.push("high_uncertainty"); }
  if ((result.uncertainty ?? 0) > 0.75) { risk += 0.10; drivers.push("very_high_uncertainty"); }

  if ((result.differential?.[0]?.confidence ?? 1) < 0.4) { risk += 0.10; drivers.push("low_diagnostic_confidence"); }

  if (memory.length >= 2) {
    const last = memory[memory.length - 1];
    const prev = memory[memory.length - 2];
    if (last?.triage !== prev?.triage) { risk += 0.15; drivers.push("changing_triage_over_time"); }
    if ((last?.uncertainty ?? 0) > (prev?.uncertainty ?? 0) + 0.1) { risk += 0.10; drivers.push("increasing_uncertainty"); }
  }

  risk = Math.max(0, Math.min(1, risk));
  const trend = risk > 0.65 ? "worsening" : risk > 0.40 ? "stable" : "improving";
  const timeHorizon = risk > 0.70 ? "< 2 hours" : risk > 0.50 ? "2-12 hours" : risk > 0.35 ? "12-48 hours" : "stable / 3+ days";
  const escalationProbability = Math.min(1, risk * 1.2);

  return { trend, riskScore: Math.round(risk * 1000) / 1000, timeHorizon, drivers, escalationProbability: Math.round(escalationProbability * 100) / 100 };
}
