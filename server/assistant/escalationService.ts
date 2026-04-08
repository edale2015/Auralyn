export interface EscalationBundle {
  caseId: string;
  priority: "urgent" | "emergency";
  reason: string;
  summary: string;
  triageLevel: string;
  topConcerns: string[];
  missingCriticalData: string[];
  recommendedActions: string[];
  trajectory?: string;
  createdAt: number;
}

export function buildEscalationBundle(params: { result: any; requery?: any }): EscalationBundle | null {
  const { result } = params;

  const isEmergency =
    result.triage?.level === "emergency" ||
    result.triage?.level === "critical" ||
    (result.safetyAlerts?.length ?? 0) > 0;

  const isUrgent =
    result.triage?.level === "urgent" ||
    result.triage?.level === "high" ||
    (result.uncertainty ?? 0) > 0.65 ||
    (result.trajectory?.riskScore ?? 0) > 0.70;

  if (!isEmergency && !isUrgent) return null;

  return {
    caseId: result.caseId,
    priority: isEmergency ? "emergency" : "urgent",
    reason: isEmergency
      ? "Safety alert or emergency triage triggered"
      : "High uncertainty, elevated risk trajectory, or urgent triage",
    summary: `Complaint: ${result.complaint ?? "unknown"} | Triage: ${result.triage?.level ?? "unknown"}`,
    triageLevel: result.triage?.level ?? "unknown",
    topConcerns: [
      ...(result.safetyAlerts?.map((a: any) => a.message ?? String(a)).slice(0, 3) ?? []),
      ...(result.differential?.slice(0, 2).map((d: any) => d.diagnosis) ?? []),
    ].filter(Boolean),
    missingCriticalData: params.requery?.questionAsked ? [params.requery.questionAsked] : [],
    recommendedActions: isEmergency
      ? ["Immediate physician review", "Consider emergency escalation or ER referral", "Do not delay evaluation"]
      : ["Expedite telemedicine follow-up", "Collect missing clinical data", "Monitor for worsening"],
    trajectory: result.trajectory?.trend,
    createdAt: Date.now(),
  };
}
