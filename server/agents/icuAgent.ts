/**
 * ICU Agent — evaluates hemodynamic instability for ICU admission
 */

export interface AgentVitals {
  hr?: number; spo2?: number; o2?: number; sbp?: number; systolicBP?: number;
  rr?: number; temp?: number; mentalStatus?: string;
}

export interface AgentOutput {
  agent:          string;
  recommendation: string;
  confidence:     number;
  reason:         string;
  urgency:        "immediate" | "urgent" | "routine" | null;
}

export class ICUAgent {
  evaluate(patient: { vitals: AgentVitals; level?: string }): AgentOutput | null {
    const v   = patient.vitals;
    const sbp = v.sbp ?? v.systolicBP ?? 120;
    const spo2= v.spo2 ?? v.o2 ?? 98;
    const ms  = v.mentalStatus ?? "normal";

    const criteria: string[] = [];
    if (sbp < 90)                criteria.push(`SBP ${sbp} < 90 (hemodynamic instability)`);
    if (spo2 < 92)               criteria.push(`SpO2 ${spo2}% < 92 (respiratory failure)`);
    if (ms !== "normal")         criteria.push(`Altered mental status: ${ms}`);
    if (patient.level === "CRITICAL") criteria.push("CRITICAL triage level");

    if (criteria.length === 0) return null;

    const confidence = Math.min(0.98, 0.75 + criteria.length * 0.07);

    return {
      agent:          "icu_agent",
      recommendation: "ICU_ADMISSION",
      confidence,
      reason:         criteria.join("; "),
      urgency:        "immediate",
    };
  }
}
