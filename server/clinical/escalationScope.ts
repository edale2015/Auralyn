// ── Escalation scope and key derivation ──────────────────────────────────────
//
// FIXED: original escalationGuard.ts used global Redis keys (escalation:total,
// escalation:er). In a multi-tenant deployment this means one clinic's referral
// behaviour influences another clinic's suppression recommendation — a
// cross-contamination bug.
//
// Fix: scope is explicit. All counters are keyed by tenant + clinic + model +
// complaint. A scope object is passed everywhere, never derived from globals.

export interface EscalationScope {
  tenantId:       string;
  clinicId?:      string;
  modelVersion?:  string;
  complaint?:     string;
}

/**
 * Derives a Redis key for the given scope and metric.
 *
 * Format: escalation:{tenant}:{clinic}:{model}:{complaint}:{metric}
 *
 * All segments fall back to "all-*" when not provided so partial scopes
 * (e.g. tenant-only) still produce a valid, non-colliding key.
 */
export function buildEscalationKey(scope: EscalationScope, metric: "total" | "er"): string {
  const tenant    = scope.tenantId;
  const clinic    = scope.clinicId     ?? "all-clinics";
  const model     = scope.modelVersion ?? "all-models";
  const complaint = scope.complaint    ?? "all-complaints";
  return `escalation:${tenant}:${clinic}:${model}:${complaint}:${metric}`;
}

/** Default scope for dev/single-tenant deployments that don't pass a scope. */
export const DEFAULT_ESCALATION_SCOPE: EscalationScope = {
  tenantId:   "default",
  clinicId:   "default",
};
