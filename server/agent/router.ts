import type { AgentAction, CaseState, NextActionResponse, AgentRunConfig } from "../../shared/agentTypes";
import { CENTOR_REQUIRED_QS } from "./scoring/centor";
import { detectRedFlags } from "./safety/redFlags";

function missingRequiredCentorQs(state: CaseState): string[] {
  const missing: string[] = [];
  for (const q of CENTOR_REQUIRED_QS) {
    if (!(q in state.answers)) missing.push(q);
    else if (state.answers[q] === null || state.answers[q] === "not_sure") {
      missing.push(q);
    }
  }
  return missing;
}

function normalizeChiefComplaint(cc: string): string {
  const s = cc.toLowerCase().trim().replace(/[\s_-]+/g, "_");
  if (s.includes("sore") && s.includes("throat")) return "sore_throat";
  if (s.includes("throat") && s.includes("pain")) return "sore_throat";
  if (s.includes("pharyngitis")) return "sore_throat";
  return s;
}

export function routeNextAction(state: CaseState, cfg: AgentRunConfig): NextActionResponse {
  if (state.routing.state === "EMERGENT_ESCALATION") {
    return {
      action: { type: "STOP", stopReason: "EMERGENT" },
      rationale: "Already escalated",
      requiredInputsMissing: [],
    };
  }
  
  if (state.routing.state === "REVIEW_REQUIRED") {
    return {
      action: { type: "STOP", stopReason: "REVIEW_READY" },
      rationale: "Review already required",
      requiredInputsMissing: [],
    };
  }

  const flags = detectRedFlags(state);
  if (flags.length > 0) {
    const action: AgentAction = {
      type: "FLAG_RED_FLAG",
      flagId: flags[0],
      severity: "hard",
      message: "Hard red flag detected; escalate.",
    };
    return { action, rationale: "Red flag present", requiredInputsMissing: [] };
  }

  const normalizedCC = normalizeChiefComplaint(state.chiefComplaint);
  
  if (normalizedCC === "sore_throat") {
    const missing = missingRequiredCentorQs(state);
    if (missing.length > 0) {
      return {
        action: { type: "ASK_QUESTION", questionId: missing[0] },
        rationale: "Missing Centor inputs",
        requiredInputsMissing: missing,
      };
    }

    if (typeof state.scores["centor"] !== "number") {
      return {
        action: { type: "COMPUTE_SCORE", scoreType: "centor" },
        rationale: "Compute Centor score",
        requiredInputsMissing: [],
      };
    }

    const centor = state.scores["centor"];
    if (centor >= 3) {
      return {
        action: {
          type: "SET_DISPOSITION",
          disposition: "urgent_care",
          reasonCodes: ["HIGH_CENTOR_SCORE"],
        },
        rationale: "Centor >= 3",
        requiredInputsMissing: [],
      };
    }

    return {
      action: {
        type: "SET_DISPOSITION",
        disposition: "routine",
        reasonCodes: ["LOW_CENTOR_SCORE"],
      },
      rationale: "Centor < 3",
      requiredInputsMissing: [],
    };
  }

  return {
    action: { type: "ESCALATE_TO_CLINICIAN", reason: "No complaint router implemented yet" },
    rationale: "Unsupported chief complaint in router v1",
    requiredInputsMissing: [],
  };
}
