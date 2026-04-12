/**
 * Sepsis Detection Skill — lightweight clinical workflow skill
 * Trigger: vitals abnormal OR infection suspected
 * Based on qSOFA + SIRS criteria for fast initial screening
 */

export interface SepsisSkillInput {
  vitals: {
    temp?:         number;   // °F
    hr?:           number;
    rr?:           number;
    sbp?:          number;
    systolicBP?:   number;
    mentalStatus?: "normal" | "altered" | "confused" | "unresponsive";
    o2?:           number;
    spo2?:         number;
  };
  complaint?: string;
  symptoms?:  string[];
}

export interface SepsisSkillOutput {
  skillName:  "sepsis-detection";
  qsofa:      number;
  sirsCount:  number;
  risk:       "LOW" | "MODERATE" | "HIGH";
  action:     "MONITOR" | "ALERT_PHYSICIAN" | "ESCALATE_IMMEDIATELY";
  reasons:    string[];
  triggeredAt:string;
}

export function detectSepsis(patient: SepsisSkillInput): SepsisSkillOutput {
  const v = patient.vitals;
  const sbp = v.sbp ?? v.systolicBP ?? 120;
  const rr  = v.rr  ?? 16;
  const hr  = v.hr  ?? 70;
  const temp= v.temp ?? 98.6;
  const spo2= v.spo2 ?? v.o2 ?? 98;
  const ms  = v.mentalStatus ?? "normal";

  // qSOFA
  let qsofa = 0;
  const reasons: string[] = [];
  if (sbp < 100)         { qsofa++; reasons.push(`SBP ${sbp} < 100 mmHg`); }
  if (rr > 22)           { qsofa++; reasons.push(`RR ${rr} > 22 bpm`); }
  if (ms !== "normal")   { qsofa++; reasons.push(`Altered mental status: ${ms}`); }

  // SIRS criteria
  let sirsCount = 0;
  if (temp > 100.4 || temp < 96.8)  { sirsCount++; reasons.push(`Temp ${temp}°F abnormal`); }
  if (hr > 90)                      { sirsCount++; reasons.push(`HR ${hr} > 90`); }
  if (rr > 20)                      { sirsCount++; reasons.push(`RR ${rr} > 20`); }

  const hasInfection = (patient.symptoms ?? []).some((s) =>
    ["fever", "chills", "infection", "pneumonia", "uti"].includes(s.toLowerCase())
  ) || (patient.complaint ?? "").toLowerCase().includes("fever");

  let risk: SepsisSkillOutput["risk"] = "LOW";
  let action: SepsisSkillOutput["action"] = "MONITOR";

  if (qsofa >= 2 || (sirsCount >= 2 && hasInfection)) {
    risk   = "HIGH";
    action = "ESCALATE_IMMEDIATELY";
    reasons.push("Sepsis criteria met — immediate intervention required");
  } else if (qsofa === 1 || sirsCount >= 2) {
    risk   = "MODERATE";
    action = "ALERT_PHYSICIAN";
    reasons.push("Sepsis risk — physician evaluation needed");
  }

  return {
    skillName:  "sepsis-detection",
    qsofa, sirsCount, risk, action, reasons,
    triggeredAt: new Date().toISOString(),
  };
}
