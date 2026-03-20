import { computeScoringSystems } from "../engines/scoringSystemsEngine";
import { mapToBilling } from "../billing/codingEngine";
import { logOutcome } from "../learning/outcomeLearningEngine";
import { learningEngine as operatorLearning } from "../operator/learningEngine";
import { publish } from "../agents/eventBus";
import { multiAgentCoordinator } from "../agents/multiAgentCoordinator";

export interface ClinicalInput {
  patientId?: string;
  complaint: string;
  answers: Record<string, any>;
  channel?: "web" | "whatsapp" | "telegram" | "voice";
  metadata?: Record<string, any>;
}

export interface ClinicalFlowResult {
  success: boolean;
  patientId?: string;
  complaint: string;
  scores?: any;
  billing?: any;
  learningTriggered: boolean;
  latencyMs: number;
  error?: string;
  timestamp: string;
}

const flowLog: Array<ClinicalFlowResult & { id: string }> = [];
let flowCounter = 0;
let totalErrors = 0;
let totalLatency = 0;

function validateInput(input: ClinicalInput): ClinicalInput {
  if (!input.complaint || typeof input.complaint !== "string") {
    throw new Error("complaint is required and must be a string");
  }
  if (!input.answers || typeof input.answers !== "object") {
    throw new Error("answers must be an object");
  }
  return {
    ...input,
    complaint: input.complaint.trim().slice(0, 500),
    channel: input.channel ?? "web",
  };
}

async function runScoring(input: ClinicalInput): Promise<any> {
  try {
    const result = await computeScoringSystems(input as any);
    return result;
  } catch {
    return { computed: false, reason: "scoring skipped" };
  }
}

async function runBilling(complaint: string): Promise<any> {
  try {
    return mapToBilling(complaint, "office_visit");
  } catch {
    return { coded: false, reason: "billing skipped" };
  }
}

async function runLearningCycle(complaint: string, scores: any): Promise<void> {
  try {
    logOutcome({
      packId: complaint,
      predictedDiagnosis: scores?.primaryDiagnosis ?? "unknown",
      actualDiagnosis: "pending",
      correct: false,
    });

    operatorLearning.logStep({
      stepId: flowCounter,
      action: "clinical_flow",
      field: "complaint",
      success: true,
      program: complaint,
      retryCount: 0,
      duration: 0,
    });
  } catch (e) {
    console.error("[ClinicalOrchestrator] Learning cycle error:", e);
  }
}

function auditLog(entry: { type: string; latency: number; success: boolean; error?: string }) {
  publish("clinical_flow_audit", {
    ...entry,
    timestamp: new Date().toISOString(),
    flowId: flowCounter,
  });

  if (entry.success) {
    multiAgentCoordinator.complete("ClinicalOrchestrator", "full_flow");
  } else {
    multiAgentCoordinator.fail("ClinicalOrchestrator", "full_flow");
  }
}

export async function runFullClinicalFlow(input: ClinicalInput): Promise<ClinicalFlowResult> {
  const start = Date.now();
  const id = `flow_${++flowCounter}_${Date.now()}`;

  multiAgentCoordinator.assign("ClinicalOrchestrator", "full_flow");

  try {
    const validated = validateInput(input);

    const scores = await runScoring(validated);

    const billing = await runBilling(validated.complaint);

    runLearningCycle(validated.complaint, scores).catch(console.error);

    const latencyMs = Date.now() - start;
    totalLatency += latencyMs;

    auditLog({ type: "FULL_FLOW", latency: latencyMs, success: true });

    const result: ClinicalFlowResult & { id: string } = {
      id,
      success: true,
      patientId: input.patientId,
      complaint: validated.complaint,
      scores,
      billing,
      learningTriggered: true,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    flowLog.push(result);
    if (flowLog.length > 500) flowLog.shift();

    return result;
  } catch (err: any) {
    totalErrors++;
    const latencyMs = Date.now() - start;

    auditLog({ type: "FULL_FLOW", latency: latencyMs, success: false, error: err.message });

    const result: ClinicalFlowResult & { id: string } = {
      id,
      success: false,
      complaint: input.complaint ?? "unknown",
      error: err.message,
      learningTriggered: false,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    flowLog.push(result);
    if (flowLog.length > 500) flowLog.shift();

    return result;
  }
}

export function getFlowLog(limit = 50): Array<ClinicalFlowResult & { id: string }> {
  return flowLog.slice(-limit);
}

export function getOrchestratorMetrics() {
  const total = flowCounter;
  const errors = totalErrors;
  const successRate = total > 0 ? (total - errors) / total : 1;
  const avgLatency = total > 0 ? totalLatency / total : 0;

  return {
    totalFlows: total,
    successRate: Number(successRate.toFixed(4)),
    errorRate: Number((1 - successRate).toFixed(4)),
    avgLatencyMs: Number(avgLatency.toFixed(1)),
    recentFlows: flowLog.slice(-10),
  };
}
