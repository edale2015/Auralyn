import type { CaseState, AgentAction } from "../../../shared/agentTypes";
import type { TraceEvent } from "../../../shared/testingTypes";

export interface CouncilLLM {
  callJson(system: string, payload: any): Promise<any>;
}

function shouldInvoke(state: CaseState): boolean {
  const s: any = state;
  if (s.routing?.state === "EMERGENT_ESCALATION") return false;
  if (s.redFlagGate?.gateResult === "ER_SEND") return false;

  const low = s.caseConfidence === "LOW";
  const missingRequired = (s.questionQueue || []).some((q: any) => q.required && !q.answered);
  const conflict = s.__conflictFlag === true;
  return low || missingRequired || conflict;
}

function rankDisp(d: string): number {
  const r: Record<string, number> = {
    self_care: 1,
    supportive_care: 1,
    routine: 2,
    pcp: 2,
    urgent_care: 3,
    er_send: 4,
  };
  return r[d] ?? 2;
}

function pickKeyAnswers(state: CaseState) {
  const A = (state as any).answers || {};
  return {
    ST_DUR: A.ST_DUR,
    ST_FEVER: A.ST_FEVER,
    ST_COUGH: A.ST_COUGH,
    ST_RUNNY: A.ST_RUNNY,
    ST_HOARSE: A.ST_HOARSE,
    ST_SWALLOW: A.ST_SWALLOW,
    ST_DROOL: A.ST_DROOL,
    ST_BREATH: A.ST_BREATH,
    ST_TRISMUS: A.ST_TRISMUS,
    ST_ONE_SIDE: A.ST_ONE_SIDE,
    ST_MUFFLED: A.ST_MUFFLED,
    ST_EXUDATE: A.ST_EXUDATE,
    ST_TENDER_NODES: A.ST_TENDER_NODES,
    EXAM_TONSILLAR_EXUDATE: A.EXAM_TONSILLAR_EXUDATE,
    EXAM_TENDER_ANT_CERV_NODES: A.EXAM_TENDER_ANT_CERV_NODES,
  };
}

function missingRequiredIds(state: CaseState): string[] {
  const s: any = state;
  return (s.questionQueue || [])
    .filter((q: any) => q.required && !q.answered)
    .map((q: any) => String(q.questionId));
}

function findQuestionPrompt(state: CaseState, qid: string): string | undefined {
  const s: any = state;
  const q = (s.questionQueue || []).find((x: any) => String(x.questionId) === String(qid));
  return q?.questionText ? String(q.questionText) : undefined;
}

export interface CouncilResult {
  updated: CaseState;
  eventsToAdd: TraceEvent[];
  llmCalls: number;
  ruleRefs: string[];
  pendingAction?: AgentAction;
  outputs: Record<string, any>;
}

export async function runSpecialistCouncilNode(args: {
  state: CaseState;
  llm: CouncilLLM;
}): Promise<CouncilResult> {
  const { state, llm } = args;
  const s: any = state;

  if (process.env.ENABLE_COUNCIL !== "1" || !shouldInvoke(state)) {
    return {
      updated: state,
      eventsToAdd: [],
      llmCalls: 0,
      ruleRefs: [],
      outputs: { skipped: true },
    };
  }

  const snapshot = {
    cc: s.normalizedComplaint,
    system: s.system,
    disposition: s.disposition,
    dispositionReasonCodes: s.dispositionReasonCodes || [],
    scores: s.scores || {},
    redFlagGate: s.redFlagGate || {},
    activeClusters: s.activeClusters || [],
    dxCandidates: (s.diagnosisCandidates || []).slice(0, 4),
    keyAnswers: pickKeyAnswers(state),
    missingRequired: missingRequiredIds(state),
  };

  const systemPrompt = [
    "You are a clinical safety council.",
    "Constraints:",
    "1) Output STRICT JSON only.",
    "2) You may only escalate disposition (never de-escalate).",
    "3) If more info is needed, choose ONE questionId to ask next.",
    "4) You may add safety-net return precautions.",
    "Return keys: finalDisposition (optional), why (optional), askNextQuestionId (optional), safetyNetAdds (optional array).",
  ].join("\n");

  const clinician = await llm.callJson(systemPrompt, { role: "clinician", snapshot });
  const critic = await llm.callJson(systemPrompt, { role: "safety_critic", snapshot, clinician });
  const arbiter = await llm.callJson(systemPrompt, { role: "rules_arbiter", snapshot, clinician, critic });

  const decided = arbiter || critic || clinician || {};
  const proposedDisp = decided.finalDisposition ? String(decided.finalDisposition) : undefined;
  const askNext = decided.askNextQuestionId ? String(decided.askNextQuestionId) : undefined;
  const why = decided.why ? String(decided.why) : "";
  const safetyAdds: string[] = Array.isArray(decided.safetyNetAdds) ? decided.safetyNetAdds.map(String) : [];

  const newEvents: TraceEvent[] = [];
  let pendingAction: AgentAction | undefined;

  if (askNext) {
    const prompt = findQuestionPrompt(state, askNext);
    pendingAction = {
      type: "ASK_QUESTION",
      questionId: askNext,
      ...(prompt ? { prompt } : {}),
    };

    if (safetyAdds.length) s.__councilSafetyNetAdds = safetyAdds;

    newEvents.push({
      type: "COUNCIL_NEEDS_MORE_INFO",
      severity: "info",
      message: why || `Council requested more info: ${askNext}`,
    });

    return {
      updated: state,
      eventsToAdd: newEvents,
      llmCalls: 3,
      ruleRefs: ["COUNCIL"],
      pendingAction,
      outputs: { askNextQuestionId: askNext, safetyNetAddsCount: safetyAdds.length },
    };
  }

  if (proposedDisp) {
    const current = String(s.disposition || "");
    const finalDisp = rankDisp(proposedDisp) >= rankDisp(current) ? proposedDisp : current;
    if (finalDisp !== current) {
      s.disposition = finalDisp;
      s.dispositionReasonCodes = [...(s.dispositionReasonCodes || []), "COUNCIL_ESCALATION"];
      newEvents.push({
        type: "COUNCIL_ESCALATION",
        severity: "warn",
        message: why || `Council escalated disposition ${current} -> ${finalDisp}`,
      });
    } else if (why) {
      newEvents.push({ type: "COUNCIL_NOTE", severity: "info", message: why });
    }
  }

  if (safetyAdds.length) s.__councilSafetyNetAdds = safetyAdds;

  return {
    updated: state,
    eventsToAdd: newEvents,
    llmCalls: 3,
    ruleRefs: ["COUNCIL"],
    outputs: { finalDisposition: s.disposition, safetyNetAddsCount: safetyAdds.length },
  };
}
