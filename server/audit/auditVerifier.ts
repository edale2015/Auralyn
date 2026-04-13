/**
 * server/audit/auditVerifier.ts — Immutable Audit Trail Verification
 *
 * FIX (Batch-1 Finding #8 — High): verifyAuditBatch() was fetching records in
 * DESC order and computing a Merkle root, but the chain was written in ASC
 * order. A reversed Merkle root has no tamper-detection value. Now fixed to
 * use ASC order (chain order) and the batch range is stored for verification.
 *
 * Satisfies: 45 CFR §164.312(b) — audit controls must include ability to
 * verify data has not been altered. FDA 21 CFR Part 11 — electronic records
 * integrity with audit trail.
 */

import crypto   from "crypto";
import { db }   from "../db";
import { auditLogs } from "../../shared/schema";
import { asc }  from "drizzle-orm";
import { computeChainHash } from "./hashChain";
import { logger } from "../utils/logger";

export interface ChainVerificationResult {
  verified:         boolean;
  recordsChecked:   number;
  brokenAt?:        { recordIndex: number; traceId: string; claimedHash: string; expectedHash: string };
  genesisHash:      string;
  latestHash:       string;
  verifiedAt:       string;
  durationMs:       number;
}

export interface MerkleVerificationResult {
  merkleRoot:  string;
  verified:    boolean;
  batchSize:   number;
  startId?:    number;
  endId?:      number;
  verifiedAt:  string;
}

/**
 * Verifies the full audit chain from genesis to the most recent record.
 * Reads records in ascending ID order and recomputes each hash.
 */
export async function verifyFullAuditChain(): Promise<ChainVerificationResult> {
  const startMs = Date.now();
  let prevHash  = "GENESIS";
  let recordsChecked = 0;

  try {
    const records = await db
      .select()
      .from(auditLogs)
      .orderBy(asc(auditLogs.id));

    for (const record of records) {
      const entry: Record<string, unknown> = {
        traceId:  record.traceId,
        step:     record.step,
        input:    record.input,
        output:   record.output,
        metadata: record.metadata,
      };

      const expectedHash = computeChainHash(prevHash, entry);

      if (expectedHash !== record.hash) {
        logger.error("audit_chain_broken", {
          recordIndex: recordsChecked,
          traceId:     record.traceId,
          expectedHash,
          claimedHash: record.hash ?? "",
        });
        return {
          verified:       false,
          recordsChecked,
          brokenAt: {
            recordIndex: recordsChecked,
            traceId:     record.traceId ?? "",
            claimedHash: record.hash ?? "",
            expectedHash,
          },
          genesisHash: "GENESIS",
          latestHash:  record.hash ?? "",
          verifiedAt:  new Date().toISOString(),
          durationMs:  Date.now() - startMs,
        };
      }

      prevHash = record.hash ?? prevHash;
      recordsChecked++;
    }

    logger.info("audit_chain_verified", { recordsChecked, durationMs: Date.now() - startMs });

    return {
      verified:       true,
      recordsChecked,
      genesisHash:    "GENESIS",
      latestHash:     prevHash,
      verifiedAt:     new Date().toISOString(),
      durationMs:     Date.now() - startMs,
    };
  } catch (e: any) {
    logger.error("audit_chain_verification_error", { error: e?.message });
    return {
      verified: false, recordsChecked,
      genesisHash: "GENESIS", latestHash: "",
      verifiedAt: new Date().toISOString(), durationMs: Date.now() - startMs,
    };
  }
}

function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return crypto.createHash("sha256").update("empty").digest("hex");
  if (hashes.length === 1) return hashes[0];

  const parents: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left  = hashes[i];
    const right = hashes[i + 1] ?? hashes[i];
    parents.push(
      crypto.createHash("sha256").update(left + right).digest("hex")
    );
  }
  return computeMerkleRoot(parents);
}

/**
 * FIX (Finding #8): Batch Merkle root now uses ASC order (same as chain write
 * order). DESC was semantically broken — the root covered a reversed,
 * non-sequential subset with no tamper-detection value.
 */
export async function verifyAuditBatch(
  limit: number = 100
): Promise<MerkleVerificationResult> {
  try {
    const records = await db
      .select({ id: auditLogs.id, hash: auditLogs.hash })
      .from(auditLogs)
      .orderBy(asc(auditLogs.id))   // FIX: ASC — chain write order
      .limit(limit);

    const hashes    = records.map(r => r.hash ?? "").filter(Boolean);
    const merkleRoot = computeMerkleRoot(hashes);
    const startId   = records.at(0)?.id;
    const endId     = records.at(-1)?.id;

    return {
      merkleRoot,
      verified:   hashes.length === records.length,
      batchSize:  records.length,
      startId,
      endId,
      verifiedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      merkleRoot: "", verified: false,
      batchSize: 0, verifiedAt: new Date().toISOString(),
    };
  }
}

/**
 * Spot-check a specific audit record by recomputing its hash from content.
 */
export function verifyAuditRecord(
  record: { traceId: string; step: string; input: unknown; output: unknown; metadata: unknown; hash: string; prevHash: string }
): boolean {
  const entry: Record<string, unknown> = {
    traceId:  record.traceId,
    step:     record.step,
    input:    record.input,
    output:   record.output,
    metadata: record.metadata,
  };
  const expected = computeChainHash(record.prevHash, entry);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(record.hash, "hex")
    );
  } catch { return false; }
}
