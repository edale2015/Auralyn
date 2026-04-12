import type {
  ClinicalWorkflowState,
  MonitoringAssessment,
  MonitoringAlert,
  RiskLevel,
} from "../types/clinical";

function asNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function assessMonitoring(
  state: ClinicalWorkflowState | Record<string, unknown>
): MonitoringAssessment {
  const vitals = (state as any).vitals ?? state;

  const alerts: MonitoringAlert[] = [];
  const hr    = asNum(vitals.hr);
  const spo2  = asNum(vitals.spo2, 99);
  const rr    = asNum(vitals.rr, 16);
  const sbp   = asNum(vitals.systolicBP, 120);
  const tempF = asNum(vitals.tempF, 98.6);

  let score = 0;

  if (hr >= 120) {
    alerts.push({
      type: "tachycardia", severity: "high",
      message: `Heart rate ${hr} bpm suggests hemodynamic stress`,
    });
    score += 2;
  }

  if (spo2 <= 92) {
    const sev: RiskLevel = spo2 <= 90 ? "critical" : "high";
    alerts.push({
      type: "hypoxia", severity: sev,
      message: `SpO2 ${spo2}% is concerning`,
    });
    score += spo2 <= 90 ? 3 : 2;
  }

  if (sbp < 90) {
    alerts.push({
      type: "hypotension", severity: "critical",
      message: `Systolic BP ${sbp} mmHg suggests shock risk`,
    });
    score += 3;
  }

  if (tempF >= 102.5) {
    alerts.push({
      type: "fever", severity: "moderate",
      message: `High fever ${tempF}°F detected`,
    });
    score += 1;
  }

  if (rr >= 24) {
    const sev: RiskLevel = rr >= 30 ? "critical" : "high";
    alerts.push({
      type: "respiratory_distress", severity: sev,
      message: `Respiratory rate ${rr} breaths/min is elevated`,
    });
    score += rr >= 30 ? 3 : 2;
  }

  if (tempF >= 102.5 && (hr >= 120 || rr >= 24 || sbp < 90)) {
    alerts.push({
      type: "sepsis_risk", severity: "critical",
      message: "Pattern suggests possible sepsis physiology",
    });
    score += 3;
  }

  const reassessInMinutes =
    score >= 6 ? 5  :
    score >= 4 ? 10 :
    score >= 2 ? 30 : 60;

  return {
    alerts,
    deteriorationScore:    score,
    escalationRecommended: score >= 4,
    reassessInMinutes,
  };
}
