/**
 * Escalation Engine — routes patients to appropriate care level
 * ER · ICU · Rapid Response Team · Attending MD notification
 */

import { sendAlert } from "./alertEngine";

export type EscalationDestination = "ER" | "ICU" | "RRT" | "UrgentCare" | "Telemedicine";

export interface EscalationResult {
  escalationId:   string;
  patientId:      string;
  destination:    EscalationDestination;
  reason:         string;
  transport:      "Immediate" | "Urgent" | "Routine";
  notifiedAt:     string;
  estimatedETA?:  string;
}

const escalationLog: EscalationResult[] = [];

function escalationId(): string {
  return `ESC-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function chooseDestination(riskScore: number, flags: string[]): { dest: EscalationDestination; transport: EscalationResult["transport"] } {
  const sepsis    = flags.some((f) => f.toLowerCase().includes("sepsis") || f.toLowerCase().includes("hypotension") || f.toLowerCase().includes("dropping bp"));
  const hypoxia   = flags.some((f) => f.toLowerCase().includes("hypoxia") || f.toLowerCase().includes("oxygen"));
  const cardiacEv = flags.some((f) => f.toLowerCase().includes("chest") || f.toLowerCase().includes("cardiac"));

  if (riskScore >= 9 || sepsis)                      return { dest: "ICU",        transport: "Immediate" };
  if (riskScore >= 7 || hypoxia || cardiacEv)         return { dest: "ER",         transport: "Immediate" };
  if (riskScore >= 5)                                 return { dest: "RRT",        transport: "Urgent" };
  if (riskScore >= 3)                                 return { dest: "UrgentCare", transport: "Urgent" };
  return                                               { dest: "Telemedicine",     transport: "Routine" };
}

export async function escalatePatient(patient: {
  id:         string;
  name?:      string;
  riskScore?: number;
  flags?:     string[];
  reason?:    string;
}): Promise<EscalationResult> {
  const riskScore = patient.riskScore ?? 8;
  const flags     = patient.flags     ?? [];
  const { dest, transport } = chooseDestination(riskScore, flags);

  const reason = patient.reason ?? `Risk score ${riskScore} — ${flags.slice(0, 3).join(", ") || "clinical deterioration"}`;

  const result: EscalationResult = {
    escalationId: escalationId(),
    patientId:    patient.id,
    destination:  dest,
    reason,
    transport,
    notifiedAt:   new Date().toISOString(),
    estimatedETA: transport === "Immediate" ? "< 2 minutes" : transport === "Urgent" ? "< 15 minutes" : "< 60 minutes",
  };

  escalationLog.push(result);

  // Fire critical alert
  await sendAlert(
    `ESCALATION: ${patient.name ?? patient.id} → ${dest} | ${reason} | Transport: ${transport}`,
    transport === "Immediate" ? "critical" : "high",
    patient.id,
    "escalation-engine"
  );

  console.log(`[EscalationEngine] ${patient.id} → ${dest} (${transport})`);
  return result;
}

export function getEscalationLog(): EscalationResult[] {
  return [...escalationLog];
}
