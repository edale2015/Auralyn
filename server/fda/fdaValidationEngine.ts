/**
 * FDA Validation Engine — scope-based compliance metrics for SaMD submission
 * Generates FDA-reportable data: allowed rate, blocked rate, override rate, safety score.
 */

import { scopeEngine }    from "../scope/agentScopeEngine";
import { detectScopeDrift } from "../monitoring/scopeDrift";

export interface FDAMetrics {
  total:        number;
  allowed:      number;
  blocked:      number;
  overrides:    number;
  allowedRate:  number;
  blockedRate:  number;
  overrideRate: number;
  fdaSafe:      boolean;
  safetyScore:  number;   // 0–100
  scopeDrift:   string;   // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  recommendation: string;
  generatedAt:  string;
}

export function generateFDAMetrics(logs?: any[]): FDAMetrics {
  // Pull from live scope engine if no logs provided
  const stats   = scopeEngine.getStats();
  const rawLogs = logs ?? scopeEngine.getLog().map((e) => ({
    ...e.decision,
    agentRole:           e.request.agentRole,
    action:              e.request.action,
    timestamp:           Date.now(),
    actionOutsideScope:  !e.decision.allowed && e.decision.authority === "unknown",
    newPermissionGranted:false,
  }));

  const total     = rawLogs.length || stats.total;
  const allowed   = rawLogs.filter((l: any) => l.allowed).length || stats.allowed;
  const blocked   = total - allowed;
  const overrides = rawLogs.filter((l: any) => l.requiresOverride).length || stats.overrides;

  const allowedRate  = total > 0 ? allowed / total : 1;
  const blockedRate  = total > 0 ? blocked / total : 0;
  const overrideRate = total > 0 ? overrides / total : 0;

  // FDA safety score: penalises high blocked rate and override rate
  const safetyScore = Math.max(0, Math.round(
    100 * (allowedRate * 0.6 + (1 - overrideRate) * 0.3 + (blockedRate < 0.05 ? 1 : 0) * 0.1)
  ));

  // Scope drift
  const drift = detectScopeDrift(rawLogs as any);
  const fdaSafe = blockedRate < 0.05 && overrideRate < 0.20 && drift.riskLevel === "LOW";

  const recommendation =
    !fdaSafe && blockedRate >= 0.05  ? "Review blocked actions — may indicate agent misconfiguration" :
    !fdaSafe && overrideRate >= 0.20 ? "High override rate — consider expanding express permissions for common actions" :
    fdaSafe ? "System is operating within FDA-safe scope boundaries" :
    "Review scope drift report";

  return {
    total, allowed, blocked, overrides,
    allowedRate:  Math.round(allowedRate  * 1000) / 1000,
    blockedRate:  Math.round(blockedRate  * 1000) / 1000,
    overrideRate: Math.round(overrideRate * 1000) / 1000,
    fdaSafe, safetyScore,
    scopeDrift:   drift.riskLevel,
    recommendation,
    generatedAt:  new Date().toISOString(),
  };
}
