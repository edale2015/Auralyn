import { runSafetyGate } from "./safetyGate";
import { applyGuardrailGate } from "./guardrailEngine";

export type SafetyLevel = "low" | "medium" | "high" | "critical";

export interface SafetyGuardResult {
  allowed: boolean;
  level: SafetyLevel;
  reason?: string;
  checks: {
    outputValid: boolean;
    diagnosisPresent: boolean;
    noRedFlags: boolean;
    confidenceOk: boolean;
    safetyGatePassed: boolean;
    guardrailPassed: boolean;
  };
  blockedAt?: string;
}

const blockLog: Array<{ ts: number; reason: string; level: SafetyLevel }> = [];

export function runSafetyGuard(output: any): SafetyGuardResult {
  const checks = {
    outputValid:       false,
    diagnosisPresent:  false,
    noRedFlags:        true,
    confidenceOk:      true,
    safetyGatePassed:  true,
    guardrailPassed:   true,
  };

  if (!output) {
    return block("No output produced", "high", checks);
  }
  checks.outputValid = true;

  if (output.blocked === true) {
    checks.diagnosisPresent = false;
    return block(output.reason ?? "Blocked by pipeline", "high", checks);
  }

  if (output.scores) {
    const topDx = output.scores?.primaryDiagnosis?.name ?? output.scores?.top?.name;
    checks.diagnosisPresent = !!topDx;
  } else {
    checks.diagnosisPresent = output.success !== false;
  }

  if (!checks.diagnosisPresent && output.success === false) {
    return block("Missing diagnosis in output", "medium", checks);
  }

  const redFlags: string[] = output.redFlags ?? output.scores?.redFlags ?? [];
  if (redFlags.length > 0) {
    checks.noRedFlags = false;
    return block(`Red flag detected: ${redFlags.slice(0, 2).join(", ")}`, "critical", checks);
  }

  const confidence = output.scores?.confidence ?? output.confidence;
  if (confidence != null && confidence < 0.2) {
    checks.confidenceOk = false;
    return block(`Confidence too low (${(confidence * 100).toFixed(0)}%)`, "medium", checks);
  }

  try {
    const gate = runSafetyGate(output, output.safetyChecks ?? {});
    if (!gate.allowed) {
      checks.safetyGatePassed = false;
      return block(gate.reasons.join("; "), "high", checks);
    }
  } catch {}

  try {
    const gr = applyGuardrailGate(output);
    if (gr && !gr.allowed) {
      checks.guardrailPassed = false;
      return block(gr.reason ?? "Guardrail triggered", "high", checks);
    }
  } catch {}

  return { allowed: true, level: "low", checks, reason: undefined };
}

function block(reason: string, level: SafetyLevel, checks: any): SafetyGuardResult {
  blockLog.push({ ts: Date.now(), reason, level });
  if (blockLog.length > 200) blockLog.shift();
  return { allowed: false, level, reason, checks, blockedAt: new Date().toISOString() };
}

export function getSafetyBlockLog() {
  return blockLog.slice().reverse();
}

export function getSafetySummary() {
  const total = blockLog.length;
  const byCritical = blockLog.filter(b => b.level === "critical").length;
  const byHigh     = blockLog.filter(b => b.level === "high").length;
  const last24h    = blockLog.filter(b => b.ts > Date.now() - 86_400_000).length;
  return { totalBlocks: total, criticalBlocks: byCritical, highBlocks: byHigh, last24hBlocks: last24h };
}
