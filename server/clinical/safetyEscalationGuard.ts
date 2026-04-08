/**
 * safetyEscalationGuard.ts
 * Global safety override — the final guardrail before output leaves the brain.
 *
 * No matter what the individual engines returned, this guard enforces hard
 * clinical safety rules that cannot be bypassed:
 *
 *   Rule 1: riskScore > 0.85 → disposition = "ER_NOW"
 *   Rule 2: critical red flag keywords → disposition = "ER_NOW"
 *   Rule 3: multiple critical oversight alerts → physician_required
 *   Rule 4: governance not approved + high uncertainty → physician_required
 *   Rule 5: chief resident escalation → physician_required
 *
 * This is the equivalent of the senior consultant stepping in and overriding
 * an AI decision that fails a sanity check.
 */

export interface SafetyGuardInput {
  disposition?:          string;
  riskScore?:            number | null;
  riskLevel?:            string;
  redFlags?:             string[];
  oversightAlerts?:      { severity: string; type: string }[];
  governanceApproved?:   boolean;
  uncertainty?:          number;
  chiefResidentEscalated?: boolean;
}

export interface SafetyGuardOutput {
  disposition:      string;
  overridden:       boolean;
  overrideReasons:  string[];
}

const CRITICAL_RED_FLAG_PATTERNS = [
  /chest\s*pain/i,
  /stroke/i,
  /seizure/i,
  /anaphylaxis/i,
  /septic\s*shock/i,
  /respiratory\s*failure/i,
  /suicid/i,
  /cardi[ao]genic\s*shock/i,
  /altered\s*mental\s*status/i,
  /unconscious/i,
  /unresponsive/i,
];

export function runSafetyEscalationGuard(input: SafetyGuardInput): SafetyGuardOutput {
  const reasons: string[] = [];
  let disposition = input.disposition ?? "physician_required";

  if ((input.riskScore ?? 0) > 0.85) {
    reasons.push(`Risk score ${input.riskScore?.toFixed(2)} exceeds hard threshold 0.85`);
    disposition = "ER_NOW";
  }

  if (input.riskLevel === "high" && (input.riskScore ?? 0) > 0.75) {
    reasons.push("High risk level with elevated risk score");
    disposition = "ER_NOW";
  }

  const redFlagsText = (input.redFlags ?? []).join(" ");
  const criticalFlag = CRITICAL_RED_FLAG_PATTERNS.find((p) => p.test(redFlagsText));
  if (criticalFlag) {
    reasons.push(`Critical red flag pattern detected: ${criticalFlag.source}`);
    disposition = "ER_NOW";
  }

  const highOversightAlerts = (input.oversightAlerts ?? []).filter(
    (a) => a.severity === "high",
  );
  if (highOversightAlerts.length >= 2) {
    reasons.push(`${highOversightAlerts.length} high-severity oversight alerts`);
    if (disposition !== "ER_NOW") disposition = "physician_required";
  }

  if (!input.governanceApproved && (input.uncertainty ?? 0) > 0.7) {
    reasons.push("Governance not approved with high uncertainty");
    if (disposition !== "ER_NOW") disposition = "physician_required";
  }

  if (input.chiefResidentEscalated) {
    reasons.push("Chief resident reflection escalated");
    if (disposition !== "ER_NOW") disposition = "physician_required";
  }

  return {
    disposition,
    overridden:      reasons.length > 0,
    overrideReasons: reasons,
  };
}
