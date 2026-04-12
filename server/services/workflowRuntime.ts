import { medicalMCP, type MCPContext } from "../mcp/medicalMCP";
import { auditTraceService } from "./auditTraceService";
import type { ClinicalWorkflowState } from "../types/clinical";

export async function runToolWithTrace(
  stepName: string,
  toolName: string,
  state:    ClinicalWorkflowState,
  context:  MCPContext,
  notes:    string[] = []
): Promise<ClinicalWorkflowState> {
  const traceId = context.traceId ?? auditTraceService.createTrace();
  context.traceId = traceId;

  auditTraceService.startStep(traceId, toolName, stepName, state, notes);

  try {
    const result = await medicalMCP.execute(toolName, state, context);
    auditTraceService.completeStep(traceId, stepName, result);
    return {
      ...result,
      traceId,
      traceSummary: auditTraceService.summarize(traceId),
    } as ClinicalWorkflowState;
  } catch (error) {
    auditTraceService.failStep(traceId, stepName, error);
    throw error;
  }
}
