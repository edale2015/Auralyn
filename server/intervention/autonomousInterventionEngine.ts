/**
 * Autonomous Intervention Engine — scope-gated suggestion + execution
 * Philosophy: ALWAYS suggest · EXECUTE only if within scope + confidence threshold
 * Uses intervention_agent role with explicit allowed/blocked boundaries
 */

import { executeWithScope } from "../execution/executeWithScope";

export interface AutonomousPatient {
  id:            string;
  vitals:        { hr: number; spo2: number; temp: number; systolicBP?: number; sbp?: number };
  level?:        "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  sepsisRisk?:   { highRisk: boolean; probability: number };
  symptoms?:     string[];
  context?:      { physicianSigned?: boolean; confidence?: number };
}

export interface InterventionResult {
  action:  string;
  payload: Record<string, any>;
  result:  { status: "APPROVED" | "BLOCKED" | "PENDING_OVERRIDE"; result?: any; guard?: any; durationMs: number };
}

const CONFIDENCE_DEFAULT = 0.92;

export async function runAutonomousInterventions(patient: AutonomousPatient): Promise<InterventionResult[]> {
  const sbp        = patient.vitals.systolicBP ?? patient.vitals.sbp ?? 120;
  const ctx        = patient.context ?? {};
  const confidence = ctx.confidence ?? CONFIDENCE_DEFAULT;
  const physicianSigned = ctx.physicianSigned ?? false;

  const interventions: Array<{ action: string; payload: Record<string, any> }> = [];

  // Sepsis bundle
  if (patient.sepsisRisk?.highRisk) {
    interventions.push({
      action:  "order:sepsis_bundle",
      payload: { labs: ["lactate", "blood cultures"], fluids: "30ml/kg", antibiotics: "broad-spectrum" },
    });
  }

  // Hypotension → fluids
  if (sbp < 90) {
    interventions.push({ action: "order:labs", payload: { type: "NS", amount: "1L", indication: "hypotension" } });
  }

  // Critical patient → ICU escalation
  if (patient.level === "CRITICAL") {
    interventions.push({ action: "execute:escalation", payload: { destination: "ICU", reason: "CRITICAL triage level" } });
  }

  // Low SpO2 → oxygen suggestion
  if (patient.vitals.spo2 < 92) {
    interventions.push({ action: "suggest:treatment", payload: { intervention: "supplemental_oxygen", target: "SpO2 > 94%" } });
  }

  // Execute each through scope engine
  const results: InterventionResult[] = [];

  for (const intervention of interventions) {
    const scopedResult = await executeWithScope(
      {
        agentRole: "intervention_agent",
        action:    intervention.action,
        context:   { confidence, physicianSigned },
      },
      async () => intervention.payload
    );
    results.push({ action: intervention.action, payload: intervention.payload, result: scopedResult });
  }

  return results;
}
