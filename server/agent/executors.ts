import crypto from "crypto";
import type { AgentAction, CaseState, AgentRunConfig } from "../../shared/agentTypes";
import type { TraceStep, TraceEvent } from "../../shared/testingTypes";
import { computeCentor } from "./scoring/centor";
import { detectRedFlags } from "./safety/redFlags";

function nowISO() {
  return new Date().toISOString();
}

export function hashNormalized(final: unknown): string {
  const json = JSON.stringify(final);
  return crypto.createHash("sha256").update(json).digest("hex");
}

export type ExecuteResult = {
  state: CaseState;
  step?: TraceStep;
  events?: TraceEvent[];
  stop?: { reason: "REVIEW_READY" | "EMERGENT" | "NEEDS_MORE_INFO" | "MAX_STEPS" };
};

export function executeAction(
  state: CaseState,
  action: AgentAction,
  cfg: AgentRunConfig,
  stepNo: number
): ExecuteResult {
  const updated: CaseState = {
    ...state,
    updatedAt: nowISO(),
    audit: { ...state.audit },
  };

  const events: TraceEvent[] = [];

  switch (action.type) {
    case "NOOP": {
      return { state: updated };
    }

    case "ASK_QUESTION": {
      updated.routing = { ...updated.routing, state: "MORE_INFO_REQUIRED" };
      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "router",
          action,
          inputsUsed: [],
          outputs: { questionId: action.questionId, prompt: action.prompt ?? null },
          ruleRefs: ["ROUTER_V1"],
        },
        events,
        stop: { reason: "NEEDS_MORE_INFO" },
      };
    }

    case "COMPUTE_SCORE": {
      if (action.scoreType === "centor") {
        const { centor, inputsUsed } = computeCentor(updated);
        updated.scores = { ...updated.scores, centor };

        events.push({
          type: "SCORE_COMPUTED",
          severity: "info",
          ruleId: "SCORES!CENTOR_v1",
          message: `Centor=${centor}`,
        });

        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "scorer",
            action,
            inputsUsed,
            outputs: { centor },
            ruleRefs: ["SCORES!CENTOR_v1"],
          },
          events,
        };
      }
      return { state: updated };
    }

    case "SET_DISPOSITION": {
      updated.disposition = action.disposition;
      updated.dispositionReasonCodes = action.reasonCodes ?? [];
      updated.routing = { ...updated.routing, state: "REVIEW_REQUIRED" };

      events.push({
        type: "DISPOSITION_SET",
        severity: "info",
        message: `${action.disposition}`,
      });

      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "engine",
          action,
          inputsUsed: ["scores", "answers"],
          outputs: { disposition: updated.disposition, reasonCodes: updated.dispositionReasonCodes },
          ruleRefs: ["DISPOSITION_V1"],
        },
        events,
        stop: { reason: "REVIEW_READY" },
      };
    }

    case "ADD_DX": {
      updated.diagnosisClusterIds = Array.from(new Set([...updated.diagnosisClusterIds, ...action.clusterIds]));
      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "engine",
          action,
          inputsUsed: [],
          outputs: { diagnosisClusterIds: updated.diagnosisClusterIds },
          ruleRefs: ["DX_V1"],
        },
        events,
      };
    }

    case "RECOMMEND_ACTIONS": {
      updated.recommendedActions = [...(updated.recommendedActions || []), ...action.actions];
      events.push({ type: "ACTIONS_RECOMMENDED", severity: "info", message: `Count=${action.actions.length}` });
      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "engine",
          action,
          inputsUsed: [],
          outputs: { recommendedActions: updated.recommendedActions },
          ruleRefs: ["ACTIONS_V1"],
        },
        events,
      };
    }

    case "DRAFT_SUMMARY": {
      events.push({ type: "SUMMARY_DRAFTED", severity: "info", message: action.style });
      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "scribe",
          action,
          inputsUsed: ["answers", "scores"],
          outputs: { summary: "[summary placeholder]" },
          ruleRefs: ["SCRIBE_V1"],
        },
        events,
      };
    }

    case "ESCALATE_TO_CLINICIAN": {
      updated.routing = { ...updated.routing, state: "REVIEW_REQUIRED" };
      events.push({ type: "ESCALATE", severity: "warn", message: action.reason });

      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "supervisor",
          action,
          inputsUsed: [],
          outputs: { reason: action.reason },
          ruleRefs: ["SUPERVISOR_V1"],
        },
        events,
        stop: { reason: "REVIEW_READY" },
      };
    }

    case "FLAG_RED_FLAG": {
      updated.redFlags = Array.from(new Set([...updated.redFlags, action.flagId]));
      updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
      events.push({ type: "RED_FLAG", severity: "error", ruleId: action.flagId, message: action.message });

      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "triage",
          action,
          inputsUsed: ["answers"],
          outputs: { redFlags: updated.redFlags },
          ruleRefs: ["RED_FLAGS_V1"],
        },
        events,
        stop: { reason: "EMERGENT" },
      };
    }

    case "STOP": {
      const map: Record<string, CaseState["routing"]["state"]> = {
        REVIEW_READY: "REVIEW_REQUIRED",
        EMERGENT: "EMERGENT_ESCALATION",
        NEEDS_MORE_INFO: "MORE_INFO_REQUIRED",
        MAX_STEPS: updated.routing.state,
      };
      updated.routing = { ...updated.routing, state: map[action.stopReason] ?? updated.routing.state };
      return {
        state: updated,
        step: {
          step: stepNo,
          actor: "router",
          action,
          inputsUsed: [],
          outputs: { stopReason: action.stopReason },
          ruleRefs: ["ROUTER_V1"],
        },
        events,
        stop: { reason: action.stopReason },
      };
    }

    default:
      return { state: updated };
  }
}
