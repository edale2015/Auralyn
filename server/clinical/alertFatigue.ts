export type AlertLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface ClinicalAlert {
  alertId: string;
  level: AlertLevel;
  message: string;
  source: string;
  suppressed?: boolean;
  suppressReason?: string;
}

const SUPPRESS_LEVELS: AlertLevel[] = ["LOW", "INFO"];
let totalGenerated = 0;
let totalSuppressed = 0;

export function generateAlerts(input: {
  sepsisRisk?: boolean;
  sepsisScore?: number;
  pewsScore?: number;
  mentalHealthRisk?: boolean;
  mentalHealthRiskLevel?: string;
  mildFever?: boolean;
  minorCough?: boolean;
  customAlerts?: Array<{ level: AlertLevel; message: string; source: string }>;
}): ClinicalAlert[] {
  const raw: ClinicalAlert[] = [];

  if (input.sepsisRisk) {
    raw.push({
      alertId: `ALT-SEPSIS-${Date.now()}`,
      level: "CRITICAL",
      message: `Possible sepsis — qSOFA/NEWS2 score ${input.sepsisScore ?? "≥2"}. Immediate assessment required.`,
      source: "sepsis_engine",
    });
  }

  if ((input.pewsScore ?? 0) >= 6) {
    raw.push({
      alertId: `ALT-PEWS-${Date.now()}`,
      level: "CRITICAL",
      message: `Pediatric PEWS ${input.pewsScore} — critical threshold exceeded.`,
      source: "pediatric_engine",
    });
  } else if ((input.pewsScore ?? 0) >= 4) {
    raw.push({
      alertId: `ALT-PEWS-${Date.now()}`,
      level: "HIGH",
      message: `Pediatric PEWS ${input.pewsScore} — urgent review required.`,
      source: "pediatric_engine",
    });
  }

  if (input.mentalHealthRisk) {
    const level: AlertLevel = input.mentalHealthRiskLevel === "imminent" ? "CRITICAL" : "HIGH";
    raw.push({
      alertId: `ALT-MH-${Date.now()}`,
      level,
      message: `Mental health crisis detected — ${input.mentalHealthRiskLevel ?? "high"} risk. Immediate intervention.`,
      source: "mental_health_engine",
    });
  }

  if (input.mildFever) {
    raw.push({
      alertId: `ALT-FEVER-${Date.now()}`,
      level: "LOW",
      message: "Low-grade fever detected — monitor temperature trend.",
      source: "vital_signs",
    });
  }

  if (input.minorCough) {
    raw.push({
      alertId: `ALT-COUGH-${Date.now()}`,
      level: "INFO",
      message: "Minor cough reported — no action required.",
      source: "symptom_checker",
    });
  }

  if (input.customAlerts) {
    raw.push(...input.customAlerts.map((a) => ({ ...a, alertId: `ALT-CUSTOM-${Date.now()}` })));
  }

  totalGenerated += raw.length;
  const filtered = suppressLowValue(raw);
  return filtered;
}

export function suppressLowValue(alerts: ClinicalAlert[]): ClinicalAlert[] {
  return alerts
    .map((a) => {
      if (SUPPRESS_LEVELS.includes(a.level)) {
        totalSuppressed++;
        return { ...a, suppressed: true, suppressReason: "low_clinical_value" };
      }
      return a;
    })
    .filter((a) => !a.suppressed);
}

export function getAlertFatigueStats() {
  return {
    active: true,
    totalGenerated,
    totalSuppressed,
    suppressRate: totalGenerated > 0 ? +((totalSuppressed / totalGenerated) * 100).toFixed(1) : 0,
    suppressedLevels: SUPPRESS_LEVELS,
  };
}
