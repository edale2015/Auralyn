import { computeScoringSystems } from "../engines/scoringSystemsEngine";
import { mapToBilling } from "../billing/codingEngine";
import { logOutcome } from "../learning/outcomeLearningEngine";
import { learningEngine as operatorLearning } from "../operator/learningEngine";
import { publish } from "../agents/eventBus";
import { multiAgentCoordinator } from "../agents/multiAgentCoordinator";
import { runSafetyGate, SafetyGateResult } from "../safety/safetyGate";
import { createTraceId, auditStep } from "../audit/auditLogger";
import { generateClinicalExplanation } from "../explainability/explainableAIEngine";
import { logEngineStatus } from "../monitoring/systemMonitor";

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
  safetyGate?: SafetyGateResult;
  explanation?: any;
  blocked?: boolean;
  learningTriggered: boolean;
  traceId?: string;
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

  const answers = input.answers as Record<string, any>;
  if ((answers.ageYears ?? answers.age ?? 99) < 1 && (answers.fever || (answers.temperature ?? 0) > 37.8)) {
    throw new Error("SAFETY BLOCK: Infant (<1yr) with fever must be escalated to ED immediately");
  }
  if (answers.oxygenSaturation !== undefined && answers.oxygenSaturation < 92) {
    throw new Error(`SAFETY BLOCK: Hypoxia detected (SpO₂ ${answers.oxygenSaturation}%) — urgent clinical intervention required`);
  }

  return {
    ...input,
    complaint: input.complaint.trim().slice(0, 500),
    channel: input.channel ?? "web",
  };
}

async function runScoring(input: ClinicalInput): Promise<any> {
  const t = Date.now();
  try {
    const result = await computeScoringSystems(input as any);
    await logEngineStatus("scoringSystemsEngine", "healthy", Date.now() - t);
    return result;
  } catch (e: any) {
    await logEngineStatus("scoringSystemsEngine", "error", Date.now() - t, e?.message);
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

async function triggerLearning(complaint: string, scores: any): Promise<void> {
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

function publishAudit(entry: { type: string; latency: number; success: boolean; error?: string }) {
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
  const traceId = createTraceId();

  multiAgentCoordinator.assign("ClinicalOrchestrator", "full_flow");

  try {
    const validated = validateInput(input);

    await auditStep({ traceId, step: "INPUT_VALIDATION", input, output: validated });

    const safetyChecks = {
      pediatric: (validated.answers.ageYears ?? 99) < 18 && validated.answers.fever
        ? { risk: (validated.answers.ageYears ?? 18) < 2 ? "HIGH" : "LOW" }
        : { risk: "LOW" },
      pregnancy: validated.answers.pregnant && validated.answers.medications?.includes("ibuprofen")
        ? { risk: "HIGH", reason: "NSAIDs unsafe in pregnancy" }
        : { risk: "LOW" },
      drug: [],
    };

    const safetyGate = runSafetyGate(validated.answers ?? {}, safetyChecks);

    await auditStep({ traceId, step: "SAFETY_GATE", input: safetyChecks, output: safetyGate });

    if (!safetyGate.allowed) {
      const latencyMs = Date.now() - start;
      publishAudit({ type: "FULL_FLOW_BLOCKED", latency: latencyMs, success: false, error: "Safety gate blocked" });
      await logEngineStatus("clinicalOrchestrator", "warning", latencyMs, `Safety gate blocked: ${safetyGate.reasons.join("; ")}`);

      const blockedResult: ClinicalFlowResult & { id: string } = {
        id, traceId,
        success: false,
        blocked: true,
        complaint: validated.complaint,
        safetyGate,
        learningTriggered: false,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
      flowLog.push(blockedResult);
      if (flowLog.length > 500) flowLog.shift();
      return blockedResult;
    }

    const scores = await runScoring(validated);
    await auditStep({ traceId, step: "SCORING", input: validated, output: scores });

    const billing = await runBilling(validated.complaint);
    await auditStep({ traceId, step: "BILLING", input: { complaint: validated.complaint }, output: billing });

    const explanation = generateClinicalExplanation({
      topDiagnosis: scores?.primaryDiagnosis ?? validated.complaint,
      probability: scores?.confidence ?? 0.5,
      disposition: scores?.disposition ?? "physician-review",
      protocol: scores?.protocol,
      redFlags: scores?.redFlags ?? safetyGate.reasons,
      differentials: scores?.differentials ?? [],
      enginesUsed: scores?.enginesUsed ?? ["scoringSystemsEngine"],
    });
    await auditStep({ traceId, step: "EXPLANATION", input: null, output: explanation });

    triggerLearning(validated.complaint, scores).catch(console.error);

    import("../engines/unifiedOutcomeLearning").then(({ recordOutcome, runLearningCycle }) => {
      recordOutcome({
        engineId: "clinicalOrchestrator",
        predicted: scores?.primaryDiagnosis ?? validated.complaint,
        actual: null,
        input: validated.answers ?? {},
        correct: null,
      }).then(() => runLearningCycle()).catch(() => {});
    }).catch(() => {});

    const latencyMs = Date.now() - start;
    totalLatency += latencyMs;

    publishAudit({ type: "FULL_FLOW", latency: latencyMs, success: true });
    await logEngineStatus("clinicalOrchestrator", "healthy", latencyMs);

    const result: ClinicalFlowResult & { id: string } = {
      id, traceId,
      success: true,
      patientId: input.patientId,
      complaint: validated.complaint,
      scores,
      billing,
      safetyGate,
      explanation,
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

    publishAudit({ type: "FULL_FLOW", latency: latencyMs, success: false, error: err.message });
    await logEngineStatus("clinicalOrchestrator", "error", latencyMs, err.message).catch(() => {});

    const result: ClinicalFlowResult & { id: string } = {
      id, traceId,
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
