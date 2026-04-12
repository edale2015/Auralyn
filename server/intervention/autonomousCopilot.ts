/**
 * Autonomous Co-Pilot — generates structured intervention bundles
 * Each bundle is tagged with type, actions, confidence, and scope requirements.
 * Feeds into copilotDecision.ts for physician approval cards.
 */

import { logEvent } from "../ops/auditEvents";

export interface CopilotAction {
  action:      string;
  description: string;
  urgency:     "immediate" | "urgent" | "routine";
}

export interface InterventionBundle {
  type:        string;
  actions:     CopilotAction[];
  confidence:  number;
  evidence:    string[];
  requiresApproval: boolean;
}

export interface CopilotPatient {
  id:          string;
  vitals:      { hr: number; spo2: number; temp: number; systolicBP?: number; sbp?: number; rr?: number };
  symptoms?:   string[];
  sepsisRisk?: { highRisk: boolean; probability: number; factors?: string[] };
  level?:      "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  history?:    any[];
}

export async function generateInterventions(patient: CopilotPatient): Promise<InterventionBundle[]> {
  const actions: InterventionBundle[] = [];
  const sbp = patient.vitals.systolicBP ?? patient.vitals.sbp ?? 120;
  const spo2 = patient.vitals.spo2;

  // ── Sepsis bundle ─────────────────────────────────────────────────────────
  if (patient.sepsisRisk?.highRisk) {
    actions.push({
      type:       "SEPSIS_BUNDLE",
      confidence: 0.93,
      requiresApproval: false, // high confidence → auto-suggest
      evidence:   patient.sepsisRisk.factors ?? ["Sepsis probability > 60%"],
      actions: [
        { action: "order:lactate",        description: "Draw serum lactate",              urgency: "immediate" },
        { action: "order:blood_cultures", description: "2x blood cultures before antibiotics", urgency: "immediate" },
        { action: "give:fluids",          description: "30 mL/kg IV crystalloid bolus",   urgency: "immediate" },
        { action: "suggest:antibiotics",  description: "Broad-spectrum antibiotics (physician approval required)", urgency: "urgent" },
      ],
    });
  }

  // ── Hypotension protocol ──────────────────────────────────────────────────
  if (sbp < 90) {
    actions.push({
      type:       "HYPOTENSION_PROTOCOL",
      confidence: 0.91,
      requiresApproval: false,
      evidence:   [`SBP ${sbp} mmHg < 90 — hemodynamic instability`],
      actions: [
        { action: "give:fluids",     description: "1L NS IV bolus", urgency: "immediate" },
        { action: "order:ekg",       description: "12-lead ECG",    urgency: "urgent" },
        { action: "send:alert",      description: "Notify attending immediately", urgency: "immediate" },
      ],
    });
  }

  // ── Hypoxia protocol ──────────────────────────────────────────────────────
  if (spo2 < 92) {
    actions.push({
      type:       "HYPOXIA_PROTOCOL",
      confidence: 0.89,
      requiresApproval: false,
      evidence:   [`SpO2 ${spo2}% < 92 — supplemental oxygen indicated`],
      actions: [
        { action: "suggest:treatment", description: "Apply supplemental O2 — target SpO2 > 94%", urgency: "immediate" },
        { action: "order:labs",        description: "ABG / chest X-ray",                          urgency: "urgent" },
      ],
    });
  }

  // ── ICU escalation ────────────────────────────────────────────────────────
  if (patient.level === "CRITICAL") {
    actions.push({
      type:       "ICU_ESCALATION",
      confidence: 0.96,
      requiresApproval: true, // always requires physician sign for escalation
      evidence:   ["CRITICAL triage level", "Multiple organ system involvement"],
      actions: [
        { action: "execute:escalation", description: "Transfer to ICU", urgency: "immediate" },
        { action: "send:alert",         description: "Notify ICU team and attending", urgency: "immediate" },
      ],
    });
  }

  // Audit log
  if (actions.length > 0) {
    logEvent({ actor: "autonomous_copilot", action: "copilot:bundles_generated", entityType: "patient", entityId: patient.id, details: { bundleCount: actions.length, types: actions.map((a) => a.type) } });
  }

  return actions;
}
