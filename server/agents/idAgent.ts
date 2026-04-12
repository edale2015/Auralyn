/**
 * Infectious Disease Agent — evaluates infection severity + antibiotic stewardship
 */

import type { AgentVitals, AgentOutput } from "./icuAgent";

export class IDAgent {
  evaluate(patient: { vitals: AgentVitals; symptoms?: string[]; sepsisRisk?: { highRisk: boolean; probability: number } }): AgentOutput | null {
    const v        = patient.vitals;
    const symptoms = patient.symptoms ?? [];
    const temp     = v.temp ?? 98.6;

    const infectionSymptoms = symptoms.some((s) =>
      ["fever", "chills", "infection", "wound", "uti", "pneumonia", "cellulitis"].includes(s.toLowerCase())
    );

    const hyperthermia  = temp > 101.5;
    const hypothermia   = temp < 96.8;
    const sepsisHighRisk= patient.sepsisRisk?.highRisk ?? false;

    if (!infectionSymptoms && !hyperthermia && !hypothermia && !sepsisHighRisk) return null;

    const criteria: string[] = [];
    if (infectionSymptoms) criteria.push("Infection symptoms present");
    if (hyperthermia)      criteria.push(`Hyperthermia ${temp}°F > 101.5`);
    if (hypothermia)       criteria.push(`Hypothermia ${temp}°F < 96.8`);
    if (sepsisHighRisk)    criteria.push(`Sepsis probability ${((patient.sepsisRisk?.probability ?? 0) * 100).toFixed(0)}%`);

    const confidence = sepsisHighRisk ? 0.88 : 0.74;

    return {
      agent:          "id_agent",
      recommendation: sepsisHighRisk ? "SEPSIS_PROTOCOL" : "INFECTION_WORKUP",
      confidence,
      reason:         criteria.join("; "),
      urgency:        sepsisHighRisk ? "immediate" : "urgent",
    };
  }
}
