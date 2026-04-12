/**
 * Scope Drift Detection — monitors for scope creep and permission expansion
 * "Scope creep is the biggest risk in multi-agent AI systems" — Auralyn Safety Layer
 */

export interface ScopeLogEntry {
  timestamp:           number;
  agentRole:           string;
  action:              string;
  allowed:             boolean;
  actionOutsideScope?: boolean;
  newPermissionGranted?:boolean;
  requiresOverride?:   boolean;
}

export interface ScopeDriftReport {
  violations:       ScopeLogEntry[];
  expansions:       ScopeLogEntry[];
  overrides:        ScopeLogEntry[];
  riskLevel:        "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  violationRate:    number;
  expansionRate:    number;
  topViolators:     { agentRole: string; count: number }[];
  recommendation:   string;
  generatedAt:      string;
}

export function detectScopeDrift(actionLogs: ScopeLogEntry[]): ScopeDriftReport {
  const total      = actionLogs.length;
  const violations = actionLogs.filter((l) => l.actionOutsideScope === true || (!l.allowed && !l.requiresOverride));
  const expansions = actionLogs.filter((l) => l.newPermissionGranted === true);
  const overrides  = actionLogs.filter((l) => l.requiresOverride === true);

  const violationRate = total > 0 ? violations.length / total : 0;
  const expansionRate = total > 0 ? expansions.length / total : 0;

  // Risk classification
  let riskLevel: ScopeDriftReport["riskLevel"] = "LOW";
  if (violations.length > 10 || expansions.length > 10) riskLevel = "CRITICAL";
  else if (violations.length > 5  || expansions.length > 5)  riskLevel = "HIGH";
  else if (violations.length > 0  || expansions.length > 2)  riskLevel = "MEDIUM";

  // Top violators
  const violatorMap = new Map<string, number>();
  for (const v of violations) {
    violatorMap.set(v.agentRole, (violatorMap.get(v.agentRole) ?? 0) + 1);
  }
  const topViolators = [...violatorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([agentRole, count]) => ({ agentRole, count }));

  const recommendation =
    riskLevel === "CRITICAL" ? "IMMEDIATE REVIEW: Multiple scope violations detected — audit all agent actions now" :
    riskLevel === "HIGH"     ? "Scope violations detected — review agent permissions and reduce scope" :
    riskLevel === "MEDIUM"   ? "Some scope activity detected — monitor closely" :
    "Scope is healthy — agents operating within defined boundaries";

  return {
    violations, expansions, overrides, riskLevel,
    violationRate: Math.round(violationRate * 1000) / 1000,
    expansionRate: Math.round(expansionRate * 1000) / 1000,
    topViolators,
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}

// ── Scope heatmap: which agents use the most scope ──────────────────────────
export function generateScopeHeatmap(actionLogs: ScopeLogEntry[]): Record<string, { total: number; allowed: number; denied: number; heat: number }> {
  const map: Record<string, { total: number; allowed: number; denied: number }> = {};

  for (const log of actionLogs) {
    if (!map[log.agentRole]) map[log.agentRole] = { total: 0, allowed: 0, denied: 0 };
    map[log.agentRole].total++;
    if (log.allowed) map[log.agentRole].allowed++;
    else             map[log.agentRole].denied++;
  }

  const result: Record<string, any> = {};
  for (const [role, stats] of Object.entries(map)) {
    result[role] = { ...stats, heat: stats.total / Math.max(actionLogs.length, 1) };
  }
  return result;
}
