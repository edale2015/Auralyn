import { publish } from "./eventBus";
import type { AgentOutput } from "./orchestrator";

export interface DecisionResult {
  actions: string[];
  priority: "critical" | "high" | "normal" | "low";
  reasoning: string[];
  requiresPhysicianReview: boolean;
  autoRespondEligible: boolean;
}

export function decideNextActions(
  agentResults: Record<string, AgentOutput>,
  agentErrors: Record<string, string> = {},
): DecisionResult {
  const actions: string[] = [];
  const reasoning: string[] = [];
  let priority: DecisionResult["priority"] = "normal";
  let requiresPhysicianReview = false;
  let autoRespondEligible = true;

  const criticalAgents = ["safety", "triage", "diagnosis", "risk"];
  const failedCritical = criticalAgents.filter((a) => a in agentErrors);
  if (failedCritical.length > 0) {
    actions.push("escalate_to_physician");
    priority = "high";
    requiresPhysicianReview = true;
    autoRespondEligible = false;
    reasoning.push(`Critical agent(s) failed: ${failedCritical.join(", ")} — forcing physician review for safety`);
  }

  const safety = agentResults.safety;
  if (safety?.alert === "ER_NOW" || safety?.alert === "EMERGENCY") {
    actions.push("send_emergency_alert");
    actions.push("escalate_to_physician");
    priority = "critical";
    requiresPhysicianReview = true;
    autoRespondEligible = false;
    reasoning.push(`Safety agent triggered ${safety.alert} — emergency escalation required`);
    publish("decision:emergency", { alert: safety.alert, redFlags: safety.redFlags });
  }

  const triage = agentResults.triage;
  if (triage?.severity === "high" || triage?.severity === "critical") {
    if (!actions.includes("escalate_to_physician")) {
      actions.push("escalate_to_physician");
    }
    priority = priority === "critical" ? "critical" : "high";
    requiresPhysicianReview = true;
    autoRespondEligible = false;
    reasoning.push(`High-severity triage (${triage.severity}) — physician review needed`);
  }

  const diagnosis = agentResults.diagnosis;
  if (diagnosis && diagnosis.confidence !== undefined && diagnosis.confidence < 0.6) {
    actions.push("request_physician_review");
    requiresPhysicianReview = true;
    autoRespondEligible = false;
    reasoning.push(`Low diagnostic confidence (${(diagnosis.confidence * 100).toFixed(0)}%) — physician verification required`);
  }

  const risk = agentResults.risk;
  if (risk?.level === "CRITICAL" || risk?.level === "HIGH") {
    if (!actions.includes("escalate_to_physician")) {
      actions.push("escalate_to_physician");
    }
    requiresPhysicianReview = true;
    autoRespondEligible = false;
    reasoning.push(`Risk classification ${risk.level} — ${risk.reason}`);
  }

  const billing = agentResults.billing;
  if (billing?.denialRisk > 0.5) {
    actions.push("flag_billing_review");
    reasoning.push(`High denial risk (${(billing.denialRisk * 100).toFixed(0)}%) — billing review flagged`);
  }

  if (autoRespondEligible) {
    actions.push("send_patient_response");
    reasoning.push("All checks passed — patient response eligible for auto-send");
  }

  if (agentResults.followup?.scheduled) {
    actions.push("schedule_followup");
    reasoning.push(`Follow-up scheduled at ${agentResults.followup.scheduledTime || "6h"}`);
  }

  actions.push("log_encounter");

  publish("decision:completed", { actions, priority, requiresPhysicianReview });

  return { actions, priority, reasoning, requiresPhysicianReview, autoRespondEligible };
}
