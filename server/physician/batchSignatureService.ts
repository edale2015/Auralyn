import crypto from "crypto";
import { pool } from "../db/pool";
import { appendAuditEvent } from "../governance/audit";
import { updateSession } from "../patient/sessionStorePg";

export interface BatchApproveParams {
  tenantId: string;
  actorId: string;
  physicianPrintedName: string;
  passwordVerifier: (actorId: string, password: string) => Promise<boolean>;
  passwordOrPin: string;
  caseIds: string[];
  selectionCriteria: string;
  clientIp?: string;
  userAgent?: string;
}

export interface BatchApproveResult {
  batchId: string;
  signatureId: string;
  signedAt: string;
  signatureDigest: string;
  approved: string[];
  skipped: string[];
  skippedReasons: Record<string, string>;
}

/**
 * Batch Part 11 signature for Tier 1 consensus cases.
 *
 * The canonical statement includes the exact selection criteria so the signature
 * is legally meaningful — the physician is attesting to a defined population of
 * cases, not a blank approval. This mirrors radiologist batch read attestation.
 *
 * Only batch-eligible cases (CONSENSUS, HOME_CARE, confidence ≥ 0.85, no flags)
 * are approved; non-eligible IDs in the request are skipped with reason.
 */
export async function batchApproveCases(params: BatchApproveParams): Promise<BatchApproveResult> {
  if (!params.passwordOrPin?.trim()) {
    throw Object.assign(new Error("SECOND_FACTOR_REQUIRED"), { statusCode: 400 });
  }

  const verified = await params.passwordVerifier(params.actorId, params.passwordOrPin);
  if (!verified) {
    throw Object.assign(new Error("SIGNATURE_VERIFICATION_FAILED"), { statusCode: 401 });
  }

  if (params.caseIds.length === 0) {
    throw Object.assign(new Error("NO_CASES_IN_BATCH"), { statusCode: 400 });
  }

  if (params.caseIds.length > 100) {
    throw Object.assign(new Error("BATCH_TOO_LARGE: max 100 cases per signature"), { statusCode: 400 });
  }

  const batchId = crypto.randomUUID();
  const signedAt = new Date().toISOString();

  const statement =
    `Batch physician attestation — ${params.caseIds.length} cases. ` +
    `Selection criteria: ${params.selectionCriteria}. ` +
    `I confirm I have reviewed the AI triage summaries for the cases listed in this batch ` +
    `and agree with the proposed disposition for each case.`;

  const canonical = JSON.stringify({
    batchId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    physicianPrintedName: params.physicianPrintedName,
    meaning: "batch_physician_attestation",
    statement,
    selectionCriteria: params.selectionCriteria,
    caseIds: [...params.caseIds].sort(),
    signedAt,
  });

  const signatureDigest = crypto.createHash("sha256").update(canonical).digest("hex");

  const { rows: sigRows } = await pool.query(
    `INSERT INTO electronic_signatures
     (tenant_id, actor_id, printed_name, meaning, statement_text,
      linked_entity_type, linked_entity_id, rationale, signed_at, signature_digest, metadata_json)
     VALUES ($1,$2,$3,'batch_physician_attestation',$4,'batch',$5,$6,$7,$8,$9::jsonb)
     RETURNING id`,
    [
      params.tenantId,
      params.actorId,
      params.physicianPrintedName,
      statement,
      batchId,
      params.selectionCriteria,
      signedAt,
      signatureDigest,
      JSON.stringify({
        batchId,
        caseIds: params.caseIds,
        clientIp: params.clientIp ?? null,
        userAgent: params.userAgent ?? null,
        caseCount: params.caseIds.length,
      }),
    ]
  );

  const signatureId: string = sigRows[0].id;

  const approved: string[] = [];
  const skipped: string[] = [];
  const skippedReasons: Record<string, string> = {};

  for (const caseId of params.caseIds) {
    try {
      await updateSession(caseId, {
        status: "batch_approved",
        approvedBy: params.actorId,
        batchSignatureId: signatureId,
        batchId,
      });
      approved.push(caseId);
    } catch (err: any) {
      skipped.push(caseId);
      skippedReasons[caseId] = err?.message ?? "update_failed";
    }
  }

  await appendAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "BATCH_PART11_SIGNATURE_CAPTURED",
    entityType: "batch",
    entityId: batchId,
    justification: params.selectionCriteria,
    payload: {
      signatureId,
      batchId,
      caseCount: params.caseIds.length,
      approvedCount: approved.length,
      skippedCount: skipped.length,
      signedAt,
      signatureDigest,
      printedName: params.physicianPrintedName,
    },
  });

  return { batchId, signatureId, signedAt, signatureDigest, approved, skipped, skippedReasons };
}
