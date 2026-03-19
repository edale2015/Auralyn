import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { classifyRisk, validateSafeDischarge } from "../compliance/riskEngine";
import { publish } from "./eventBus";
import { logAgent } from "./tracking";

export const riskAgent: Agent = {
  name: "risk",
  priority: 25,

  run: async (ctx: AgentContext, priorResults): Promise<AgentOutput> => {
    const start = Date.now();

    const dx = priorResults.diagnosis?.dx;
    const triage = priorResults.diagnosis?.triage || priorResults.triage?.disposition;
    const confidence = priorResults.diagnosis?.confidence;

    const classification = classifyRisk({ triage, diagnosis: dx, confidence });

    const dischargeCheck = validateSafeDischarge({ triage, diagnosis: dx });

    const result = {
      level: classification.level,
      requiresPhysicianReview: classification.requiresPhysicianReview,
      requiresAuditTrail: classification.requiresAuditTrail,
      escalationRequired: classification.escalationRequired,
      reason: classification.reason,
      safeDischarge: dischargeCheck.safe,
      dischargeBlockReason: dischargeCheck.reason || null,
    };

    if (classification.level === "CRITICAL" || classification.level === "HIGH") {
      publish("risk:elevated", { level: classification.level, dx, triage });
    }

    if (!dischargeCheck.safe) {
      publish("risk:discharge_blocked", { reason: dischargeCheck.reason, dx, triage });
    }

    logAgent("risk", { level: classification.level, safeDischarge: dischargeCheck.safe }, Date.now() - start);
    return result;
  },
};
