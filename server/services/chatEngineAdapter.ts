import type { ChatEngineRunInput, ChatEngineRunOutput } from "../types/chatEngine";
import type { CaseEngineResult } from "../types/case";
import type { CaseState } from "../../shared/agentTypes";
import { CaseStateSchema } from "../../shared/agentTypes";
import { runGenericComplaintV1 } from "../engines/genericComplaintEngineV1";
import { planNextQuestion } from "./chatQuestionPlanner";

function buildCaseState(caseRecord: any): CaseState {
  const now = new Date().toISOString();
  return CaseStateSchema.parse({
    caseId: caseRecord.caseId,
    createdAt: caseRecord.createdAt ?? now,
    updatedAt: now,
    chiefComplaint: caseRecord.complaintId,
    answers: caseRecord.answers ?? {},
    demographics: caseRecord.patientContext
      ? {
          age: typeof caseRecord.patientContext.age === "number"
            ? caseRecord.patientContext.age
            : undefined,
          sex: caseRecord.patientContext.sex ?? undefined,
        }
      : undefined,
    routing: { state: "CORE_QS_PENDING" },
  });
}

function mapGraphResultToEngineResult(
  complaintId: string,
  complaintLabel: string | undefined,
  graphResult: any
): CaseEngineResult {
  const state = graphResult.state ?? {};

  const disposition: string =
    state.disposition ?? "UNKNOWN";

  const confidence: string =
    state.caseConfidence ??
    (graphResult.pendingAction?.type === "ASK_QUESTION" ? "LOW" : "MODERATE");

  const triggeredRedFlags: string[] = state.redFlags ?? [];

  const activeClusters: string[] = state.activeClusters ?? [];
  const winningClusterId: string | undefined = activeClusters[0];

  const dxCandidates = (state.likelyDx ?? state.diagnosisCandidates ?? []).map((d: any) => ({
    id: d.id ?? d.diagnosisId ?? d.label ?? "",
    label: d.label ?? d.diagnosisName ?? "",
    score: d.score ?? d.confidence ?? 0,
    clusterId: d.clusterId ?? winningClusterId ?? "",
  }));

  const clusterScores: Array<{ clusterId: string; score: number }> = [];
  if (state.clusterScores && typeof state.clusterScores === "object") {
    for (const [clusterId, score] of Object.entries(state.clusterScores)) {
      clusterScores.push({ clusterId, score: Number(score) });
    }
  }

  const ruleTrace = (state.ruleTrace ?? []).map((r: any) => ({
    ruleId: r.ruleId ?? "",
    triggerLevel: r.triggerLevel ?? "",
    action: r.action ?? "",
    detail: r.detail,
  }));

  const returnPrecautions: string[] = state.returnPrecautions ?? [];

  return {
    complaintId,
    complaintLabel,
    recommendedDisposition: disposition,
    confidence,
    triggeredRedFlags,
    winningClusterId,
    dxCandidates,
    clusterScores,
    ruleTrace,
    returnPrecautions,
    render: state.formattedOutput ?? {},
    engineVersion: "GENERIC_V1",
  };
}

export async function runEngineForChatAdapter(
  input: ChatEngineRunInput
): Promise<ChatEngineRunOutput> {
  const { caseRecord } = input;

  const caseState = buildCaseState(caseRecord);

  const graphResult = await runGenericComplaintV1(
    caseState,
    caseRecord.complaintId
  );

  const engineResult = mapGraphResultToEngineResult(
    caseRecord.complaintId,
    caseRecord.complaintLabel,
    graphResult
  );

  const unansweredCriticalQuestions: string[] =
    graphResult.state?.requiredQuestionIdsMissing ?? [];

  if (
    !graphResult.done &&
    graphResult.pendingAction?.type === "ASK_QUESTION"
  ) {
    return {
      engineResult,
      nextQuestionToken: graphResult.pendingAction.questionId,
      nextQuestionText: graphResult.pendingAction.prompt,
      unansweredCriticalQuestions,
      completed: false,
    };
  }

  const next = await planNextQuestion(
    caseRecord.complaintId,
    caseRecord.answers ?? {},
    unansweredCriticalQuestions
  );

  return {
    engineResult,
    nextQuestionToken: next.token,
    nextQuestionText: next.text,
    unansweredCriticalQuestions,
    completed: graphResult.done ? next.completed : false,
  };
}
