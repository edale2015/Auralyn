import type { ClinicalWorkflowInput, ClinicalWorkflowState } from "../types/clinical";
import { auditTraceService } from "../services/auditTraceService";
import { runToolWithTrace } from "../services/workflowRuntime";

const WORKFLOW_STEPS = [
  { stepName: "collect-intake",          toolName: "intake.collect",       notes: ["Normalise incoming payload"] },
  { stepName: "choose-next-question",    toolName: "questions.nextBest",   notes: ["Pick highest-yield next question"] },
  { stepName: "run-diagnosis",           toolName: "diagnosis.run",        notes: ["Run core diagnosis engine"] },
  { stepName: "specialist-council",      toolName: "council.run",          notes: ["Cross-check with specialist council"] },
  { stepName: "risk-assessment",         toolName: "risk.assess",          notes: ["Assign workflow risk level"] },
  { stepName: "monitoring-assessment",   toolName: "monitoring.assess",    notes: ["Check deterioration risk from vitals"] },
  { stepName: "determine-disposition",   toolName: "disposition.determine",notes: ["Finalise disposition"] },
  { stepName: "ehr-documentation",       toolName: "ehr.document",         notes: ["Write summary to EHR layer"] },
] as const;

export async function runClinicalWorkflow(
  input: ClinicalWorkflowInput
): Promise<ClinicalWorkflowState> {
  // Ensure tools are loaded before running
  await import("../mcp/loadTools");

  const traceId = auditTraceService.createTrace();
  const context = {
    patientId: input.patientId,
    complaint:  input.complaint,
    traceId,
  };

  let state: ClinicalWorkflowState = { ...input, traceId };

  for (const step of WORKFLOW_STEPS) {
    state = await runToolWithTrace(
      step.stepName,
      step.toolName,
      state,
      context,
      [...step.notes]
    );
  }

  state.traceSummary = auditTraceService.summarize(traceId);
  return state;
}
