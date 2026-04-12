/**
 * Master Orchestrator — "The Brain"
 * Coordinates: Workflow → RAG → LangGraph → Specialist Council → LangSmith
 * One entry point for the full clinical AI pipeline.
 */

import { buildPatientWorkflow, type PatientWorkflowInput } from "./events/workflowEngine";
import { runTriageGraph }                                   from "./langgraph/triageGraph";
import { logTriageSession }                                 from "./observability/langsmith";

export interface OrchestratorInput {
  patientId?: string;
  symptoms:   string;
  vitals?:    {
    hr?:        number;
    spo2?:      number;
    temp?:      number;
    systolicBP?:number;
  };
}

export interface OrchestratorResult {
  patientId:   string;
  ragDiagnosis?: any;
  triage:        any;
  council?:      any;
  disposition:   string;
  riskLevel:     string;
  workflowSteps: any[];
  auditTraceId?: string;
  durationMs:    number;
  timestamp:     string;
}

export async function runFullTriage(patient: OrchestratorInput): Promise<OrchestratorResult> {
  const start     = Date.now();
  const patientId = patient.patientId ?? `anon-${Date.now()}`;

  // ── Phase 1: Full workflow (intake → RAG → iterative graph → council) ─────────
  let workflowOutput: any = null;
  let workflowSteps: any[] = [];

  try {
    const workflow = buildPatientWorkflow();
    const run      = await workflow.run({ patientId, symptoms: patient.symptoms, vitals: patient.vitals as any });
    workflowOutput  = run.output;
    workflowSteps   = run.steps;
  } catch (err) {
    console.warn("[Orchestrator] Workflow partial failure — running fallback graph:", String(err));

    // Fallback: run triage graph alone
    const triage = await runTriageGraph(patient.symptoms);
    workflowOutput = { triage };
    workflowSteps  = [{ name: "triage_graph_fallback", success: true }];
  }

  // ── Phase 2: Extract final risk + disposition ─────────────────────────────────
  const triage   = workflowOutput?.triage   ?? { disposition: "urgent care", riskScore: 5, flags: [] };
  const council  = workflowOutput?.council  ?? null;
  const ragResult = workflowOutput?.ragDiagnosis ?? null;

  const finalRisk = council?.finalRisk ?? (
    triage.riskScore >= 8 ? "critical" :
    triage.riskScore >= 6 ? "high" :
    triage.riskScore >= 4 ? "medium" : "low"
  );

  const disposition = council?.disposition ?? triage.disposition ?? "urgent care";

  const result: OrchestratorResult = {
    patientId,
    ragDiagnosis:  ragResult,
    triage,
    council,
    disposition,
    riskLevel:     finalRisk,
    workflowSteps,
    durationMs:    Date.now() - start,
    timestamp:     new Date().toISOString(),
  };

  // ── Phase 3: Log everything (FDA-ready trace) ─────────────────────────────────
  try {
    const trace = await logTriageSession(
      { id: patientId, symptoms: patient.symptoms },
      result
    );
    result.auditTraceId = trace.runId ?? `local-${Date.now()}`;
  } catch {
    result.auditTraceId = `local-${Date.now()}`;
  }

  return result;
}
