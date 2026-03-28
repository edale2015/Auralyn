/**
 * Cryptographic Audit Log — FDA 21 CFR Part 11 Grade
 *
 * Each record is:
 *   1. Serialized as JSON
 *   2. Hashed with SHA-256 chained to the previous record's hash
 *      (blockchain-style tamper evidence)
 *   3. Appended to data/secure_audit.log (append-only)
 *
 * Verification: re-hash the chain and compare against stored hashes.
 * Any modification to a previous record will break the chain.
 */

import crypto from "crypto";
import fs      from "fs";
import path    from "path";

const LOG_DIR  = path.resolve(process.cwd(), "data");
const LOG_FILE = path.join(LOG_DIR, "secure_audit.log");

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* exists */ }

// In-memory chain head — persists across calls within the same process
let lastHash = "";

/** Load the last hash from disk on startup to survive restarts */
function initChainHead(): void {
  if (lastHash) return;
  try {
    if (!fs.existsSync(LOG_FILE)) { lastHash = "GENESIS"; return; }
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length === 0) { lastHash = "GENESIS"; return; }
    const last = JSON.parse(lines[lines.length - 1]);
    lastHash = last.hash ?? "GENESIS";
  } catch {
    lastHash = "GENESIS";
  }
}

export interface SecureAuditRecord {
  id:        string;
  timestamp: string;
  type:      string;
  actor?:    string;
  clinicId?: string;
  entityId?: string;
  payload?:  Record<string, unknown>;
  hash:      string;
  prevHash:  string;
}

/**
 * Append a cryptographically chained audit record.
 * Fire-and-forget: never throws — errors are logged internally.
 */
export function logSecureEvent(event: {
  type:     string;
  actor?:   string;
  clinicId?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}): void {
  initChainHead();

  const id = `SAUD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const timestamp = new Date().toISOString();
  const prevHash  = lastHash;

  // Hash = SHA-256(JSON(payload) + prevHash)
  const payloadStr = JSON.stringify({ ...event, timestamp, id });
  const hash = crypto
    .createHash("sha256")
    .update(payloadStr + prevHash)
    .digest("hex");

  const record: SecureAuditRecord = {
    id,
    timestamp,
    type:     event.type,
    actor:    event.actor,
    clinicId: event.clinicId,
    entityId: event.entityId,
    payload:  event.payload,
    hash,
    prevHash,
  };

  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
    lastHash = hash;
  } catch (err) {
    console.error("[SecureAudit] Failed to write:", err);
  }
}

/**
 * Verify the integrity of the entire chain.
 * Returns a per-record pass/fail and a top-level verdict.
 */
export function verifyChain(): {
  valid: boolean;
  totalRecords: number;
  firstTampered?: number;
  records: Array<{ index: number; id: string; hashOk: boolean }>;
} {
  try {
    if (!fs.existsSync(LOG_FILE)) return { valid: true, totalRecords: 0, records: [] };
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    const records: Array<{ index: number; id: string; hashOk: boolean }> = [];

    let prev = "GENESIS";
    let firstTampered: number | undefined;

    for (let i = 0; i < lines.length; i++) {
      const rec: SecureAuditRecord = JSON.parse(lines[i]);
      const payloadStr = JSON.stringify({
        type:     rec.type,
        actor:    rec.actor,
        clinicId: rec.clinicId,
        entityId: rec.entityId,
        payload:  rec.payload,
        timestamp: rec.timestamp,
        id:       rec.id,
      });
      const expected = crypto
        .createHash("sha256")
        .update(payloadStr + prev)
        .digest("hex");

      const hashOk = expected === rec.hash && rec.prevHash === prev;
      records.push({ index: i, id: rec.id, hashOk });
      if (!hashOk && firstTampered === undefined) firstTampered = i;
      prev = rec.hash;
    }

    return { valid: firstTampered === undefined, totalRecords: lines.length, firstTampered, records };
  } catch (err) {
    return { valid: false, totalRecords: 0, records: [], firstTampered: 0 };
  }
}

/** Read the last N records */
export function getSecureAuditRecords(limit = 20): SecureAuditRecord[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l) as SecureAuditRecord);
  } catch { return []; }
}

export function getSecureAuditStats() {
  try {
    const stat  = fs.statSync(LOG_FILE);
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    return { total: lines.length, fileSizeBytes: stat.size, chainHead: lastHash.slice(0, 12) + "…" };
  } catch { return { total: 0, fileSizeBytes: 0, chainHead: "empty" }; }
}
