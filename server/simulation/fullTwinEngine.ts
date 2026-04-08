export interface TwinTimepoint {
  hour: number;
  risk: number;
  label: string;
}

export function runContinuousSimulation(params: { result: any; hours?: number }): TwinTimepoint[] {
  const hours = Math.min(params.hours ?? 24, 72);
  const baseRisk = params.result.trajectory?.riskScore ?? params.result.uncertainty ?? 0.35;
  const hasSafety = (params.result.safetyAlerts?.length ?? 0) > 0;
  const driftRate = hasSafety ? 0.025 : 0.008;

  const timeline: TwinTimepoint[] = [];
  let risk = baseRisk;

  for (let h = 1; h <= hours; h++) {
    const noise = (Math.random() - 0.42) * 0.06;
    const drift = hasSafety ? driftRate : (Math.random() > 0.65 ? -driftRate : driftRate * 0.5);
    risk = Math.max(0, Math.min(1, risk + drift + noise));

    const label = risk > 0.75 ? "critical" : risk > 0.55 ? "warning" : risk > 0.35 ? "elevated" : "stable";
    timeline.push({ hour: h, risk: Math.round(risk * 1000) / 1000, label });
  }

  return timeline;
}
