import type { CaseRecord } from "../types/case";

export interface CaseSnapshot {
  caseId: string;
  complaintId: string;
  complaintLabel?: string;
  status: string;
  reviewStatus: string;
  recommendedDisposition?: string;
  confidence?: string;
  winningClusterId?: string;
  triggeredRedFlagCount: number;
  dxCandidateCount: number;
  answeredQuestionCount: number;
  sourceChannel?: string;
  assignedReviewerId?: string;
  createdAt?: string;
  updatedAt?: string;
  patientName?: string;
}

export function buildChatCaseSnapshot(caseRecord: CaseRecord): CaseSnapshot {
  const answers = caseRecord.answers ?? {};
  const engine = caseRecord.engineResult;
  const ctx = caseRecord.patientContext as any;

  return {
    caseId: caseRecord.caseId,
    complaintId: caseRecord.complaintId,
    complaintLabel: caseRecord.complaintLabel ?? undefined,
    status: caseRecord.status,
    reviewStatus: caseRecord.reviewStatus,
    recommendedDisposition: engine?.recommendedDisposition,
    confidence: engine?.confidence,
    winningClusterId: engine?.winningClusterId,
    triggeredRedFlagCount: engine?.triggeredRedFlags?.length ?? 0,
    dxCandidateCount: engine?.dxCandidates?.length ?? 0,
    answeredQuestionCount: Object.keys(answers).length,
    sourceChannel: caseRecord.sourceChannel,
    assignedReviewerId: caseRecord.assignedReviewerId ?? undefined,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    patientName: ctx?.name
      ? String(ctx.name)
      : ctx?.firstName
        ? [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || undefined
        : undefined,
  };
}
