import type { AgentAction, CaseState, NextActionResponse, AgentRunConfig } from "../../shared/agentTypes";
import { CENTOR_REQUIRED_QS } from "./scoring/centor";
import { detectRedFlags } from "./safety/redFlags";

const QUESTION_PROMPTS: Record<string, string> = {
  Q_FEVER: "Have you had a fever or felt feverish recently?",
  Q_COUGH: "Do you currently have a cough?",
  Q_TONSILLAR_EXUDATE: "Have you noticed any white patches or pus on your tonsils?",
  Q_TENDER_ANT_CERV_NODES: "Do you have tender or swollen glands in the front of your neck?",
  Q_SHORTNESS_OF_BREATH: "Are you experiencing any difficulty breathing or shortness of breath?",
  Q_CHEST_PAIN: "Are you having any chest pain?",
  Q_STRIDOR: "Do you hear a high-pitched noise when you breathe?",
  Q_UNABLE_TO_SWALLOW_SALIVA: "Are you unable to swallow your own saliva?",
};

function shouldReframe(cfg: AgentRunConfig): boolean {
  return cfg.llm?.enabled !== false;
}

function buildQuestionAction(questionId: string, cfg: AgentRunConfig): AgentAction {
  const originalPrompt = QUESTION_PROMPTS[questionId] ?? questionId;

  if (shouldReframe(cfg)) {
    return {
      type: "REFRAME_QUESTION",
      questionId,
      toneProfile: "empathetic",
      originalPrompt,
    };
  }

  return {
    type: "ASK_QUESTION",
    questionId,
    prompt: originalPrompt,
  };
}

function missingRequiredCentorQs(state: CaseState, cfg: AgentRunConfig): string[] {
  const missing: string[] = [];
  for (const q of CENTOR_REQUIRED_QS) {
    if (!(q in state.answers)) missing.push(q);
    else if (state.answers[q] === null) missing.push(q);
    else if (cfg.mode === "LIVE" && state.answers[q] === "not_sure") missing.push(q);
  }
  return missing;
}

function normalizeChiefComplaint(cc: string): string {
  const s = cc.toLowerCase().trim();
  const compact = s.replace(/[\s_-]+/g, " ");

  const synonyms = ["sore throat", "throat pain", "painful throat", "pharyngitis"];
  if (synonyms.some(x => compact.includes(x))) return "sore_throat";

  return compact.replace(/[\s_-]+/g, "_");
}

function terminalStopReason(
  st: CaseState["routing"]["state"]
): "EMERGENT" | "REVIEW_READY" | null {
  if (st === "EMERGENT_ESCALATION") return "EMERGENT";
  if (st === "REVIEW_REQUIRED") return "REVIEW_READY";
  return null;
}

export function routeNextAction(state: CaseState, cfg: AgentRunConfig): NextActionResponse {
  // Terminal state stop
  const terminal = terminalStopReason(state.routing.state);
  if (terminal) {
    return {
      action: { type: "STOP", stopReason: terminal },
      rationale: `Already in terminal state: ${state.routing.state}`,
      requiredInputsMissing: [],
    };
  }

  // If we are explicitly waiting on more info, do not churn.
  if (state.routing.state === "MORE_INFO_REQUIRED") {
    return {
      action: { type: "STOP", stopReason: "NEEDS_MORE_INFO" },
      rationale: "Waiting on missing patient input",
      requiredInputsMissing: state.requiredQuestionIdsMissing ?? [],
    };
  }

  // Red flag detection (router chooses meaning; supervisor must also hard-gate)
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

  // Sore throat flow → Centor scoring
  if (normalizedCC === "sore_throat") {
    const missing = missingRequiredCentorQs(state, cfg);
    if (missing.length > 0) {
      return {
        action: buildQuestionAction(missing[0], cfg),
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

    // Add dx cluster if missing
    const hasDx = state.diagnosisClusterIds?.includes("ENT_PHARYNGITIS");
    if (!hasDx) {
      return {
        action: { type: "ADD_DX", clusterIds: ["ENT_PHARYNGITIS"] },
        rationale: "Attach likely cluster for sore throat pathway",
        requiredInputsMissing: [],
      };
    }

    // Recommend actions if missing
    const hasActions = (state.recommendedActions?.length ?? 0) > 0;
    if (!hasActions) {
      const actions = centor >= 3
        ? [{ type: "STREP_TEST", priority: "high" as const }, { type: "SAFETY_NET", priority: "high" as const }]
        : [{ type: "SUPPORTIVE_CARE", priority: "medium" as const }];
      return {
        action: { type: "RECOMMEND_ACTIONS", actions },
        rationale: centor >= 3 ? "Recommend strep test + safety netting" : "Recommend supportive care",
        requiredInputsMissing: [],
      };
    }

    // Set disposition
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

  // Fallback for unsupported complaints
  return {
    action: { type: "ESCALATE_TO_CLINICIAN", reason: "No complaint router implemented yet" },
    rationale: "Unsupported chief complaint in router v1",
    requiredInputsMissing: [],
  };
}
