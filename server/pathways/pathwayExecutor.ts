import { emitClinicalEvent } from "../state/clinicalEventBus";
import { getClinicalState } from "../state/clinicalStateStore";
import { getPathwayByComplaintAndDisposition, getPathwaysForComplaint, type CarePathway } from "./pathwayRegistry";

export interface PathwayExecutionResult {
  pathway: CarePathway;
  executedAt: string;
  caseId?: string;
  statSummary: {
    totalSteps: number;
    labsOrdered: string[];
    medicationsPrescribed: string[];
    referralsPlaced: string[];
    followupScheduled: string[];
    contraindications: string[];
    escalationCriteria: string[];
  };
}

export function executeCarePathway(
  complaint: string,
  disposition: string,
  caseId?: string
): PathwayExecutionResult | null {
  const pathway = getPathwayByComplaintAndDisposition(complaint, disposition);
  if (!pathway) {
    const fallback = getPathwaysForComplaint(complaint)[0];
    if (!fallback) return null;
    return buildResult(fallback, caseId);
  }
  return buildResult(pathway, caseId);
}

function buildResult(pathway: CarePathway, caseId?: string): PathwayExecutionResult {
  const result: PathwayExecutionResult = {
    pathway,
    executedAt: new Date().toISOString(),
    caseId,
    statSummary: {
      totalSteps: pathway.steps.length,
      labsOrdered: pathway.steps.filter(s => s.type === "lab").map(s => s.action),
      medicationsPrescribed: pathway.steps.filter(s => s.type === "medication").map(s => s.action),
      referralsPlaced: pathway.steps.filter(s => s.type === "referral").map(s => s.action),
      followupScheduled: pathway.steps.filter(s => s.type === "followup").map(s => s.action),
      contraindications: pathway.contraindications,
      escalationCriteria: pathway.escalationCriteria,
    },
  };

  if (caseId) {
    emitClinicalEvent(caseId, "PATHWAY_EXECUTED", { pathway: result });
  }

  return result;
}
