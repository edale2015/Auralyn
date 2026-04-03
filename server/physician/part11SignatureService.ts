import crypto from "crypto";
import { pool } from "../db/pool";
import { SignatureMeaning } from "../db/sharedTypes";
import { appendAuditEvent } from "../governance/audit";

export interface SignatureRequest {
  tenantId: string;
  actorId: string;
  physicianPrintedName: string;
  passwordVerifier: (actorId: string, passwordOrPin: string) => Promise<boolean>;
  passwordOrPin: string;
  meaning: SignatureMeaning;
  statement: string;
  linkedEntityType: string;
  linkedEntityId: string;
  rationale?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface SignatureResult {
  signatureId: string;
  signedAt: string;
  signatureDigest: string;
}

export async function createPart11Signature(
  req: SignatureRequest
): Promise<SignatureResult> {
  if (!req.passwordOrPin?.trim()) {
    const err = new Error("SECOND_FACTOR_REQUIRED");
    (err as any).statusCode = 400;
    throw err;
  }

  const verified = await req.passwordVerifier(req.actorId, req.passwordOrPin);
  if (!verified) {
    const err = new Error("SIGNATURE_VERIFICATION_FAILED");
    (err as any).statusCode = 401;
    throw err;
  }

  const signedAt = new Date().toISOString();

  const canonical = JSON.stringify({
    tenantId: req.tenantId,
    actorId: req.actorId,
    physicianPrintedName: req.physicianPrintedName,
    meaning: req.meaning,
    statement: req.statement,
    linkedEntityType: req.linkedEntityType,
    linkedEntityId: req.linkedEntityId,
    rationale: req.rationale ?? null,
    signedAt,
  });

  const signatureDigest = crypto
    .createHash("sha256")
    .update(canonical)
    .digest("hex");

  const { rows } = await pool.query(
    `INSERT INTO electronic_signatures
     (tenant_id, actor_id, printed_name, meaning, statement_text,
      linked_entity_type, linked_entity_id, rationale, signed_at, signature_digest, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING id`,
    [
      req.tenantId,
      req.actorId,
      req.physicianPrintedName,
      req.meaning,
      req.statement,
      req.linkedEntityType,
      req.linkedEntityId,
      req.rationale ?? null,
      signedAt,
      signatureDigest,
      JSON.stringify({
        clientIp: req.clientIp ?? null,
        userAgent: req.userAgent ?? null,
      }),
    ]
  );

  await appendAuditEvent({
    tenantId: req.tenantId,
    actorId: req.actorId,
    action: "PART11_SIGNATURE_CAPTURED",
    entityType: req.linkedEntityType,
    entityId: req.linkedEntityId,
    justification: req.rationale ?? null,
    payload: {
      signatureId: rows[0].id,
      meaning: req.meaning,
      signedAt,
      printedName: req.physicianPrintedName,
      signatureDigest,
    },
  });

  return { signatureId: rows[0].id, signedAt, signatureDigest };
}
