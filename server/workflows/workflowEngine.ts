import { earExamWorkflow, EarExamInput } from "./earExam";
import { logMetric } from "../monitoring/metrics";
import { auditLog } from "../security/auditLogger";

export type WorkflowType = "ear" | "throat" | "vitals_check" | "triage";

export interface WorkflowInput {
  patientId: string;
  [key: string]: any;
}

export interface WorkflowResult {
  workflowType: WorkflowType;
  patientId: string;
  result: any;
  durationMs: number;
  completedAt: string;
}

async function throatExamWorkflow(patient: WorkflowInput): Promise<any> {
  return {
    classification: "pharyngitis_suspect",
    findings: ["tonsillar_erythema", "mild_exudate"],
    confidence: 0.81,
    recommendedAction: "centor_scoring_then_antibiotic_decision",
  };
}

async function vitalsCheckWorkflow(patient: WorkflowInput): Promise<any> {
  return {
    vitalsReviewed: true,
    alerts: patient.vitals?.oxygenSaturation < 94 ? ["low_spo2"] : [],
    riskFlag: patient.vitals?.systolicBp < 90,
  };
}

async function triageWorkflow(patient: WorkflowInput): Promise<any> {
  return {
    triageLevel: patient.riskScore > 0.7 ? "immediate" : patient.riskScore > 0.4 ? "urgent" : "routine",
    assignedTo: "physician_queue",
  };
}

export async function runWorkflow(type: WorkflowType, patient: WorkflowInput): Promise<WorkflowResult> {
  const start = Date.now();

  auditLog({ actor: "workflow_engine", action: `workflow_start:${type}`, patientId: patient.patientId });

  let result: any;
  switch (type) {
    case "ear":
      result = await earExamWorkflow(patient as EarExamInput);
      break;
    case "throat":
      result = await throatExamWorkflow(patient);
      break;
    case "vitals_check":
      result = await vitalsCheckWorkflow(patient);
      break;
    case "triage":
      result = await triageWorkflow(patient);
      break;
    default:
      throw new Error(`Unknown workflow type: ${type}`);
  }

  const durationMs = Date.now() - start;
  logMetric(`workflow.${type}.duration`, durationMs, "latency", { type });

  return {
    workflowType: type,
    patientId: patient.patientId,
    result,
    durationMs,
    completedAt: new Date().toISOString(),
  };
}

export async function runWorkflowBatch(
  items: Array<{ type: WorkflowType; patient: WorkflowInput }>
): Promise<WorkflowResult[]> {
  return Promise.all(items.map(({ type, patient }) => runWorkflow(type, patient)));
}
