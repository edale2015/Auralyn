/**
 * Governance lock — determines whether a proposed policy change
 * is safe to apply automatically vs. requiring physician approval.
 *
 * Rules:
 *  - Changes touching high-risk clinical domains always require approval.
 *  - Low-risk changes auto-apply only when the ENV flag is explicitly set.
 *  - Unknown / unclassified changes default to requiring approval.
 */
import { ENV } from "../config/env";

/** Domains that must never be auto-applied — always need physician sign-off. */
const HIGH_RISK_DOMAINS = new Set([
  "MEDICATION_RULES",
  "RED_FLAG_RULES",
  "DISPOSITION_RULES",
  "DOSING_RULES",
  "CONTRAINDICATION_RULES",
  "EMERGENCY_PROTOCOLS",
]);

/** Domains that are safe to auto-apply when the ENV flag is enabled. */
const LOW_RISK_DOMAINS = new Set([
  "UI_PREFERENCES",
  "NOTIFICATION_RULES",
  "ANALYTICS_THRESHOLDS",
  "AUDIT_SETTINGS",
  "SCHEDULING_RULES",
]);

export interface PolicyChange {
  target: string;          // e.g. "RED_FLAG_RULES"
  description?: string;
  magnitude?: "minor" | "moderate" | "major";
}

export interface PolicyGuardResult {
  safeToApply: boolean;
  requiresApproval: boolean;
  reason: string;
  domain: "HIGH_RISK" | "LOW_RISK" | "UNKNOWN";
}

export function evaluatePolicyChange(change: PolicyChange): PolicyGuardResult {
  const target = (change.target ?? "").toUpperCase();

  if (HIGH_RISK_DOMAINS.has(target)) {
    return {
      safeToApply:       false,
      requiresApproval:  true,
      reason: `Target '${target}' is a high-risk clinical domain — physician approval mandatory`,
      domain: "HIGH_RISK",
    };
  }

  if (LOW_RISK_DOMAINS.has(target)) {
    // Check ENV flag: if ALLOW_AUTO_POLICY_LOW_RISK is set, auto-apply
    const autoAllowed = !!(ENV as any).ALLOW_AUTO_POLICY_LOW_RISK;
    return {
      safeToApply:      autoAllowed,
      requiresApproval: !autoAllowed,
      reason: autoAllowed
        ? `Target '${target}' is a low-risk domain and auto-apply is enabled`
        : `Target '${target}' is low-risk but ALLOW_AUTO_POLICY_LOW_RISK is not set`,
      domain: "LOW_RISK",
    };
  }

  // Unclassified → conservative default: require approval
  return {
    safeToApply:      false,
    requiresApproval: true,
    reason: `Target '${target}' is not in any known domain — defaulting to require approval`,
    domain: "UNKNOWN",
  };
}

/** Convenience: returns true only when the change can be applied without human review. */
export function isSafeAutoApply(change: PolicyChange): boolean {
  return evaluatePolicyChange(change).safeToApply;
}
