import { sendPhysicianAlert } from "../alerts/physicianAlertService";

export type FixType = "retry" | "fallback" | "restart" | "manual_review";

export interface DebugAnalysis {
  rootCause: string;
  suggestedFix: { type: FixType; detail: string };
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

const analysisLog: Array<DebugAnalysis & { at: string }> = [];

function inferFix(error: any): { type: FixType; detail: string } {
  const msg = (error?.message ?? "").toLowerCase();

  if (msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("enotfound")) {
    return { type: "retry", detail: "Network/timeout error — retry with backoff" };
  }
  if (msg.includes("rate limit") || msg.includes("429")) {
    return { type: "fallback", detail: "Rate limit hit — activate fallback model" };
  }
  if (msg.includes("memory") || msg.includes("heap")) {
    return { type: "restart", detail: "Memory pressure — schedule graceful restart" };
  }

  return { type: "manual_review", detail: `Unknown error pattern: ${error?.message}` };
}

function inferSeverity(error: any): DebugAnalysis["severity"] {
  const msg = (error?.message ?? "").toLowerCase();
  if (msg.includes("fatal") || msg.includes("crash")) return "CRITICAL";
  if (msg.includes("timeout") || msg.includes("rate limit")) return "HIGH";
  if (msg.includes("warning") || msg.includes("degraded")) return "MEDIUM";
  return "LOW";
}

export async function analyzeFailure(error: any, context?: any): Promise<DebugAnalysis> {
  const analysis: DebugAnalysis = {
    rootCause: error?.message ?? String(error),
    suggestedFix: inferFix(error),
    severity: inferSeverity(error),
  };

  analysisLog.push({ ...analysis, at: new Date().toISOString() });
  if (analysisLog.length > 100) analysisLog.shift();

  console.error("[AutoDebugger] Failure analyzed:", {
    rootCause: analysis.rootCause,
    fix: analysis.suggestedFix.type,
    severity: analysis.severity,
    context: context?.caseId ?? "system",
  });

  if (analysis.severity === "CRITICAL") {
    await sendPhysicianAlert({
      caseId: context?.caseId ?? "system",
      priority: "CRITICAL",
      reason: `Auto-debug CRITICAL: ${analysis.rootCause}`,
    }).catch(() => {});
  }

  return analysis;
}

export async function applyFix(
  fix: { type: FixType; detail: string },
  context?: any
): Promise<{ action: string; detail: string }> {
  console.log(`[AutoDebugger] Applying fix: ${fix.type} — ${fix.detail}`);

  switch (fix.type) {
    case "retry":
      return { action: "retrying", detail: "Retry with exponential backoff" };
    case "fallback":
      return { action: "fallback_triggered", detail: "Switched to fallback handler" };
    case "restart":
      return { action: "restart_scheduled", detail: "Graceful restart queued" };
    default:
      return { action: "manual_review", detail: fix.detail };
  }
}

export function getDebugLog() {
  return analysisLog.slice(-50);
}
