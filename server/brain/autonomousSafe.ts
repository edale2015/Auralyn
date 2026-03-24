import { runSystem } from "./fullLoop";
import { checkAutonomy } from "../clinical/autonomyGate";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export interface SafeAutonomousInput {
  patientId?: string;
  complaints?: string[];
  vitals?: Record<string, any>;
  history?: Record<string, any>;
  text?: string;
}

export interface SafeAutonomousResult {
  status: "autonomous_action" | "physician_review_required";
  autonomyGate?: ReturnType<typeof checkAutonomy>;
  result?: Awaited<ReturnType<typeof runSystem>>;
  completedAt: string;
}

export async function runSafeAutonomous(input: SafeAutonomousInput): Promise<SafeAutonomousResult> {
  const start = Date.now();
  auditLog({ actor: "safe_autonomous", action: "run_started", patientId: input.patientId });

  const result = await runSystem({
    id: input.patientId ?? `anon-${Date.now()}`,
    complaints: input.complaints ?? [],
    vitals: input.vitals,
    history: input.history,
    text: input.text,
  });

  const riskScore = result.decision?.scores?.overallRisk === "high" ? 0.8
    : result.decision?.scores?.overallRisk === "moderate" ? 0.5 : 0.15;

  const autonomyGate = checkAutonomy({
    riskScore,
    overallRisk: result.decision?.scores?.overallRisk,
    recommendation: result.decision?.recommendation,
    patientId: input.patientId,
  });

  logMetric("safe_autonomous.latency", Date.now() - start, "latency");

  if (!autonomyGate.allowed) {
    auditLog({
      actor: "safe_autonomous",
      action: "deferred_to_physician",
      patientId: input.patientId,
      riskScore,
      details: { reason: autonomyGate.reason },
    });
    return {
      status: "physician_review_required",
      autonomyGate,
      result,
      completedAt: new Date().toISOString(),
    };
  }

  auditLog({ actor: "safe_autonomous", action: "autonomous_action_taken", patientId: input.patientId, riskScore });
  return {
    status: "autonomous_action",
    autonomyGate,
    result,
    completedAt: new Date().toISOString(),
  };
}
