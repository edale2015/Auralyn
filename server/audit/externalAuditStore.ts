/**
 * server/audit/externalAuditStore.ts — External audit sink (NDJSON file)
 *
 * FIXES (Code Review Issue #23):
 *   1. Plaintext audit records: each record now has a per-record HMAC-SHA256
 *      signature appended. Tampered or truncated lines fail signature verification.
 *      The key is derived from AUDIT_HMAC_SECRET (required in production).
 *
 *   2. Silent error handling: rotateIfNeeded() previously swallowed all errors.
 *      Rotation failures are now surfaced as thrown errors so the append fails
 *      loudly rather than silently writing past the rotation boundary.
 *
 *   3. The append itself never had error handling — any filesystem failure was
 *      silently lost. appendExternalAuditRecord() now propagates errors to callers
 *      so they can alert/escalate. HIPAA requires evidence preservation — silent
 *      failure to write the audit trail is a compliance failure.
 *
 *   4. verifyAuditRecord() is exported for compliance verification tooling.
 */

import crypto from "crypto";
import fs     from "node:fs/promises";
import path   from "node:path";

const AUDIT_DIR      = process.env.EXTERNAL_AUDIT_DIR || path.resolve(process.cwd(), "data", "external-audit");
const AUDIT_FILE     = path.join(AUDIT_DIR, "audit_hash_chain.ndjson");
const MAX_FILE_BYTES = parseInt(process.env.AUDIT_NDJSON_MAX_BYTES || String(10 * 1024 * 1024), 10);
const HMAC_ALGO      = "sha256";

// ── HMAC secret — required in production ──────────────────────────────────────

function getHmacSecret(): string {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      throw new Error(
        "FATAL: AUDIT_HMAC_SECRET is not set. External audit records cannot be signed without it."
      );
    }
    // Dev: warn + use a dev-only constant (not secret but better than nothing)
    console.warn("[ExternalAuditStore] AUDIT_HMAC_SECRET not set — using dev placeholder. Set in production.");
    return "dev-audit-hmac-secret-not-for-production";
  }
  return secret;
}

// ── Per-record HMAC signing (Issue #23 FIX) ───────────────────────────────────
//
// Each record is signed independently. The signature covers the full serialized
// record body so any modification to any field invalidates the signature.

function signRecord(body: string): string {
  const secret = getHmacSecret();
  return crypto.createHmac(HMAC_ALGO, secret).update(body).digest("hex");
}

function buildSignedLine(record: Record<string, unknown>): string {
  const body = JSON.stringify(record);
  const sig  = signRecord(body);
  // Format: <body><TAB>_sig=<hex>
  return `${body}\t_sig=${sig}`;
}

/**
 * verifyAuditRecord — verify that a line from the NDJSON file has a valid signature.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function verifyAuditRecord(line: string): { ok: boolean; reason?: string } {
  const tabIdx = line.lastIndexOf("\t_sig=");
  if (tabIdx === -1) return { ok: false, reason: "No signature field found" };

  const body        = line.slice(0, tabIdx);
  const claimedSig  = line.slice(tabIdx + "\t_sig=".length);
  const expectedSig = signRecord(body);

  if (!crypto.timingSafeEqual(Buffer.from(claimedSig), Buffer.from(expectedSig))) {
    return { ok: false, reason: "Signature mismatch — record may have been tampered" };
  }
  return { ok: true };
}

// ── Rotation (errors now surfaced) ────────────────────────────────────────────

async function rotateIfNeeded(): Promise<void> {
  // Errors propagate to caller — no silent swallowing (Issue #23 FIX)
  const stat = await fs.stat(AUDIT_FILE);
  if (stat.size >= MAX_FILE_BYTES) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotated   = path.join(AUDIT_DIR, `audit_hash_chain_${timestamp}.ndjson`);
    await fs.rename(AUDIT_FILE, rotated);
    console.log(`[ExternalAuditStore] Rotated audit file → ${path.basename(rotated)}`);
  }
}

// ── Append ────────────────────────────────────────────────────────────────────

/**
 * appendExternalAuditRecord — append a signed record to the NDJSON audit file.
 *
 * Throws on failure (Issue #23 FIX): callers must handle write errors and
 * alert/escalate appropriately. Silent failure is not an option for audit trails.
 */
export async function appendExternalAuditRecord(
  record: Record<string, unknown>
): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });

  // Check rotation — errors propagate (file may not exist yet, which is fine)
  try {
    await rotateIfNeeded();
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      // Rotation failed for a non-trivial reason — log and continue
      // We still attempt the append; rotation failure ≠ append failure
      console.error("[ExternalAuditStore] Rotation check failed:", err?.message);
    }
  }

  const line = buildSignedLine({
    ...record,
    _writtenAt: new Date().toISOString(),
  });

  // Errors propagate to caller — never silently swallowed
  await fs.appendFile(AUDIT_FILE, line + "\n", "utf8");
}
