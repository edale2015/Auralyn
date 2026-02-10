import crypto from "crypto";
import type { AgentAction, CaseState, AgentRunConfig } from "../../shared/agentTypes";
import type { TraceStep, TraceEvent } from "../../shared/testingTypes";
import { computeCentor } from "./scoring/centor";
import { detectRedFlags } from "./safety/redFlags";
import { reframeQuestion, draftSummary, type LlmCallContext } from "./llm/agentLlm";

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

export async function executeAction(
  state: CaseState,
  action: AgentAction,
  cfg: AgentRunConfig,
  stepNo: number
): Promise<ExecuteResult> {
  const updated: CaseState = {
    ...state,
    updatedAt: nowISO(),
    audit: { ...state.audit },
  };

  const events: TraceEvent[] = [];

  const llmCtx: LlmCallContext = {
    runId: cfg.runId,
    caseId: state.caseId,
    channel: cfg.mode === "LIVE" ? "web" : "test",
    stepNo,
  };

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

    case "REFRAME_QUESTION": {
      updated.routing = { ...updated.routing, state: "MORE_INFO_REQUIRED" };
      const llmEnabled = cfg.llm?.enabled !== false;

      if (!llmEnabled) {
        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "llm",
            action,
            inputsUsed: ["questionId", "toneProfile"],
            outputs: {
              questionId: action.questionId,
              reframedText: action.originalPrompt ?? action.questionId,
              llmSkipped: true,
            },
            ruleRefs: ["LLM_REFRAME_V1"],
          },
          events,
          stop: { reason: "NEEDS_MORE_INFO" },
        };
      }

      try {
        const result = await reframeQuestion(
          action.questionId,
          action.originalPrompt ?? action.questionId,
          action.toneProfile ?? "empathetic",
          updated,
          cfg,
          llmCtx
        );

        events.push({
          type: "LLM_CALL",
          severity: "info",
          message: `Reframed ${action.questionId} (${result.model}, ${result.tokensOut ?? 0} tokens)`,
        });

        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "llm",
            action,
            inputsUsed: ["questionId", "toneProfile", "chiefComplaint", "demographics"],
            outputs: {
              questionId: action.questionId,
              reframedText: result.reframedText,
              model: result.model,
              tokensOut: result.tokensOut,
            },
            ruleRefs: ["LLM_REFRAME_V1"],
          },
          events,
          stop: { reason: "NEEDS_MORE_INFO" },
        };
      } catch (err: any) {
        console.error("[Executor] REFRAME_QUESTION LLM error:", err?.message);
        events.push({
          type: "LLM_ERROR",
          severity: "warn",
          message: `LLM reframe failed: ${err?.message}`,
        });

        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "llm",
            action,
            inputsUsed: ["questionId"],
            outputs: {
              questionId: action.questionId,
              reframedText: action.originalPrompt ?? action.questionId,
              llmError: true,
            },
            ruleRefs: ["LLM_REFRAME_V1"],
          },
          events,
          stop: { reason: "NEEDS_MORE_INFO" },
        };
      }
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
      const llmEnabled = cfg.llm?.enabled !== false;

      if (!llmEnabled) {
        events.push({ type: "SUMMARY_DRAFTED", severity: "info", message: `${action.style} (LLM off)` });
        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "scribe",
            action,
            inputsUsed: ["answers", "scores"],
            outputs: { summary: "[LLM disabled - summary placeholder]", llmSkipped: true },
            ruleRefs: ["SCRIBE_V1"],
          },
          events,
        };
      }

      try {
        const result = await draftSummary(action.style ?? "clinician", updated, cfg, llmCtx);

        events.push({
          type: "SUMMARY_DRAFTED",
          severity: "info",
          message: `${action.style} summary (${result.model}, ${result.tokensOut ?? 0} tokens)`,
        });

        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "scribe",
            action,
            inputsUsed: ["answers", "scores", "disposition", "redFlags", "recommendedActions"],
            outputs: {
              summary: result.summaryText,
              model: result.model,
              tokensOut: result.tokensOut,
            },
            ruleRefs: ["SCRIBE_V1"],
          },
          events,
        };
      } catch (err: any) {
        console.error("[Executor] DRAFT_SUMMARY LLM error:", err?.message);
        events.push({
          type: "LLM_ERROR",
          severity: "warn",
          message: `LLM summary failed: ${err?.message}`,
        });

        return {
          state: updated,
          step: {
            step: stepNo,
            actor: "scribe",
            action,
            inputsUsed: ["answers", "scores"],
            outputs: { summary: "[summary generation failed]", llmError: true },
            ruleRefs: ["SCRIBE_V1"],
          },
          events,
        };
      }
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
