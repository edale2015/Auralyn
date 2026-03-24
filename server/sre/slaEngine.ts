import { exec } from "child_process";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";

export const SLA_CONFIG = {
  uptimeTarget: 0.999,
  latencyTarget: 1000,
  errorBudgetMinimum: 0.95,
};

let errors = 0;
let total = 0;
let rollbackCount = 0;
const breachLog: Array<{ type: string; at: string }> = [];

export function recordSREEvent(success: boolean): void {
  total++;
  if (!success) errors++;
}

export function getErrorBudget(): number {
  if (total === 0) return 1;
  return 1 - errors / total;
}

export function getSREState() {
  return {
    total,
    errors,
    errorBudget: getErrorBudget(),
    rollbackCount,
    breachLog: breachLog.slice(-20),
  };
}

export function checkSLABreach(metrics: { avgLatency: number; errorRate: number }): string | null {
  if (metrics.avgLatency > SLA_CONFIG.latencyTarget) return "LATENCY_BREACH";
  if (getErrorBudget() < SLA_CONFIG.errorBudgetMinimum) return "ERROR_BUDGET_EXCEEDED";
  if (metrics.errorRate > 0.05) return "HIGH_ERROR_RATE";
  return null;
}

export function rollbackDeployment(): void {
  rollbackCount++;
  breachLog.push({ type: "ROLLBACK", at: new Date().toISOString() });
  console.warn("[SRE] Triggering deployment rollback");
  if (process.env.NODE_ENV === "production") {
    exec("flyctl releases rollback --yes", { timeout: 30_000 }, (err) => {
      if (err) console.error("[SRE] Rollback exec failed:", err.message);
      else console.log("[SRE] Rollback succeeded");
    });
  } else {
    console.log("[SRE] Rollback skipped (non-production)");
  }
}

export async function handleSLABreach(breach: string, metrics: any): Promise<void> {
  breachLog.push({ type: breach, at: new Date().toISOString() });
  console.error(`[SRE] SLA breach: ${breach}`, metrics);

  await sendPhysicianAlert({
    caseId: "system",
    priority: "CRITICAL",
    reason: `SLA breach: ${breach} — avgLatency=${metrics.avgLatency}ms errorRate=${metrics.errorRate}`,
  }).catch(() => {});

  if (breach === "ERROR_BUDGET_EXCEEDED") {
    rollbackDeployment();
  }
}
