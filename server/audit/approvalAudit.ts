/**
 * server/audit/approvalAudit.ts
 *
 * FIX (Batch-1 Finding #2 — Critical): logApproval() now routes through auditStep()
 * instead of raw SQL. This means every physician action:
 *   1. Goes through the advisory-lock serialization queue
 *   2. Gets a proper prevHash → hash chain link
 *   3. Is included in verifyEntireChain() / verifyFullAuditChain()
 *
 * Previously: direct db.execute(sql`INSERT INTO audit_logs ...`) with no hash/prevHash,
 * silently breaking the chain at every physician approval.
 */

import { auditStep, createTraceId } from "./auditLogger";

export async function logApproval({
  patientId,
  physicianId,
  action,
  overrideData,
}: {
  patientId:     string;
  physicianId:   string;
  action:        "approve" | "override" | "escalate";
  overrideData?: any;
}): Promise<void> {
  // FIX: use auditStep() — goes through the advisory lock + hash chain.
  // If this throws, the caller learns immediately (no silent swallow).
  await auditStep({
    traceId:  createTraceId(),
    step:     "PHYSICIAN_ACTION",
    input:    { action, patientId },
    output:   overrideData ?? null,
    metadata: {
      physicianId,
      timestamp: new Date().toISOString(),
    },
  });
}
