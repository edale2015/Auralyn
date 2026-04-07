// ── Execution Fingerprint ──────────────────────────────────────────────────────
//
// Generates a deterministic SHA-256 fingerprint of (context, execution plan).
// Stored in audit logs alongside every orchestrator run.
//
// Properties guaranteed:
//   • Two runs with identical inputs and identical plan always produce the
//     same fingerprint — reproducibility guarantee.
//   • Any change to context text, patientId, channel, or agent ordering
//     produces a different fingerprint — tamper-evidence.
//   • The fingerprint is a standard hex string, safe to store in any DB column.
//
// FDA 21 CFR Part 11 relevance:
//   The fingerprint creates a tamper-evident audit record linking every
//   clinical decision to its exact inputs and execution plan at the time
//   of the decision — satisfying the "complete and accurate" audit trail
//   requirement.

import crypto from "crypto";

export interface FingerprintContext {
  text?:      string;
  patientId?: string;
  channel?:   string;
  [key: string]: unknown;
}

export interface FingerprintPlanEntry {
  name:      string;
  priority:  number;
  dependsOn: string[];
}

/**
 * generateExecutionFingerprint
 *
 * @param context  - Sanitised subset of AgentContext (no PHI-sensitive fields)
 * @param plan     - Ordered execution plan (agent names + dependencies)
 * @returns        - 64-char lowercase hex SHA-256 fingerprint
 */
export function generateExecutionFingerprint(
  context: FingerprintContext,
  plan:    FingerprintPlanEntry[]
): string {
  const payload = JSON.stringify({
    context: {
      text:      context.text      ?? "",
      patientId: context.patientId ?? "",
      channel:   context.channel   ?? "",
    },
    plan: plan.map(a => ({
      name:      a.name,
      priority:  a.priority,
      dependsOn: [...(a.dependsOn ?? [])].sort(),  // canonical order
    })),
  });

  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * verifyFingerprint
 *
 * Recomputes and compares. Returns true if the stored fingerprint matches.
 * Provides tamper-detection for stored audit records.
 */
export function verifyFingerprint(
  context:            FingerprintContext,
  plan:               FingerprintPlanEntry[],
  storedFingerprint:  string
): boolean {
  const expected = generateExecutionFingerprint(context, plan);
  return crypto.timingSafeEqual(
    Buffer.from(expected,         "hex"),
    Buffer.from(storedFingerprint, "hex")
  );
}
