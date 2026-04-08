export interface RequeryDecision {
  shouldRequery: boolean;
  reason: string;
  priority: "low" | "medium" | "high";
}

export function shouldTriggerRequery(params: {
  uncertainty: number;
  debate?: { consensusScore?: number; disagreement?: number };
  subServiceFailures?: string[];
  safetyAlerts?: any[];
}): RequeryDecision {
  const { uncertainty, debate, subServiceFailures = [], safetyAlerts = [] } = params;

  if (safetyAlerts.length > 0) {
    return { shouldRequery: false, reason: "Safety alert present — escalate immediately, do not re-query", priority: "high" };
  }

  if (uncertainty >= 0.60) {
    return { shouldRequery: true, reason: `High uncertainty (${(uncertainty * 100).toFixed(0)}%) — re-query needed`, priority: "high" };
  }

  if ((debate?.consensusScore ?? 1) <= 0.40) {
    return { shouldRequery: true, reason: `Low agent consensus (${((debate?.consensusScore ?? 1) * 100).toFixed(0)}%) — agents strongly disagree`, priority: "high" };
  }

  if ((debate?.disagreement ?? 0) >= 0.30) {
    return { shouldRequery: true, reason: `High inter-agent disagreement (${((debate?.disagreement ?? 0) * 100).toFixed(0)}%)`, priority: "medium" };
  }

  if (subServiceFailures.length >= 2) {
    return { shouldRequery: true, reason: `Multiple sub-service failures: ${subServiceFailures.join(", ")}`, priority: "medium" };
  }

  return { shouldRequery: false, reason: "Decision confidence sufficient — no re-query needed", priority: "low" };
}
