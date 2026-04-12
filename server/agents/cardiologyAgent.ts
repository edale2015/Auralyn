/**
 * Cardiology Agent — evaluates cardiac risk (ACS, arrhythmia, HF)
 */

import type { AgentVitals, AgentOutput } from "./icuAgent";

export class CardiologyAgent {
  evaluate(patient: { vitals: AgentVitals; symptoms?: string[]; history?: any }): AgentOutput | null {
    const v        = patient.vitals;
    const symptoms = patient.symptoms ?? [];
    const hr       = v.hr ?? 70;
    const sbp      = v.sbp ?? v.systolicBP ?? 120;

    const criteria: string[] = [];

    const cardiacSymptoms = symptoms.some((s) =>
      ["chest pain", "chest pressure", "palpitations", "syncope", "dyspnea"].includes(s.toLowerCase())
    );

    if (cardiacSymptoms)  criteria.push("Cardiac symptoms present");
    if (hr > 150)         criteria.push(`Tachycardia HR ${hr} > 150`);
    if (hr < 40)          criteria.push(`Bradycardia HR ${hr} < 40`);
    if (sbp < 80)         criteria.push(`Severe hypotension SBP ${sbp} < 80`);

    if (criteria.length === 0) return null;

    const confidence = cardiacSymptoms ? 0.78 + (criteria.length - 1) * 0.05 : 0.72;

    return {
      agent:          "cardiology_agent",
      recommendation: cardiacSymptoms && hr > 130 ? "CARDIAC_MONITORING_ICU" : "CARDIOLOGY_CONSULT",
      confidence:     Math.min(0.95, confidence),
      reason:         criteria.join("; "),
      urgency:        criteria.length >= 2 ? "immediate" : "urgent",
    };
  }
}
