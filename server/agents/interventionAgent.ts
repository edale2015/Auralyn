export interface InterventionResult {
  action: "ESCALATE" | "FOLLOW_UP" | "REQUERY" | "MONITOR" | "NONE";
  urgency: "immediate" | "within_1h" | "within_4h" | "routine" | "none";
  message: string;
  channels: string[];
}

export function runIntervention(result: any): InterventionResult {
  const triage = result.triage?.level ?? "routine";
  const uncertainty = result.uncertainty ?? 0;
  const hasSafety = (result.safetyAlerts?.length ?? 0) > 0;
  const riskScore = result.trajectory?.riskScore ?? 0;
  const requery = result.requery?.shouldRequery ?? false;

  if (hasSafety || triage === "critical" || triage === "emergency") {
    return {
      action: "ESCALATE",
      urgency: "immediate",
      message: "Immediate physician notification triggered — safety alert or emergency triage",
      channels: ["physician_alert", "sms", "dashboard"],
    };
  }

  if (riskScore > 0.70 || triage === "urgent") {
    return {
      action: "ESCALATE",
      urgency: "within_1h",
      message: "High trajectory risk — urgent physician review within 1 hour",
      channels: ["physician_alert", "dashboard"],
    };
  }

  if (requery && uncertainty > 0.60) {
    return {
      action: "REQUERY",
      urgency: "within_4h",
      message: "High uncertainty — schedule urgent re-evaluation with targeted questions",
      channels: ["patient_message", "dashboard"],
    };
  }

  if (uncertainty > 0.45 || riskScore > 0.45) {
    return {
      action: "FOLLOW_UP",
      urgency: "within_4h",
      message: "Elevated risk — schedule follow-up within 4 hours",
      channels: ["patient_message"],
    };
  }

  if (riskScore > 0.25) {
    return {
      action: "MONITOR",
      urgency: "routine",
      message: "Low-moderate risk — routine monitoring recommended",
      channels: ["dashboard"],
    };
  }

  return { action: "NONE", urgency: "none", message: "No intervention required at this time", channels: [] };
}
