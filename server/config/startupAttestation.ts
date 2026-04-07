import crypto from "crypto";
import type { CheckResult } from "./startupChecks";

// ── startupAttestation ────────────────────────────────────────────────────────
//
// Persists a signed, immutable record of what startup checks ran and passed.
//
// Why this matters:
//   - Audit trail for regulatory review: "what was the safety posture at the
//     time this deployment started handling patient data?"
//   - Incident response: correlate a clinical safety event to the exact config
//     version, node version, and threshold set active at startup.
//   - Compliance artifact under FDA 21 CFR Part 11 and HIPAA audit controls.
//
// The hash allows detecting tampering — if someone modifies a row in
// startup_attestations, the payload_hash will no longer match. This is not
// a strong tamper-proof guarantee (anyone with DB write access could change
// both columns), but it detects accidental corruption and makes tampering
// non-trivial to hide.
//
// Non-fatal by design: failure to record an attestation is logged as a warning
// but does not block startup. The attestation is an audit artifact, not a gate.
// The caller wraps this in .catch() — see server/index.ts.

export interface StartupAttestationPayload {
  timestamp:   string;
  nodeVersion: string;
  env:         string;
  hostname:    string;
  pid:         number;
  results:     CheckResult[];
}

export async function persistStartupAttestation(results: CheckResult[]): Promise<void> {
  const payload: StartupAttestationPayload = {
    timestamp:   new Date().toISOString(),
    nodeVersion: process.versions.node,
    env:         process.env.NODE_ENV ?? "unknown",
    hostname:    process.env.HOSTNAME ?? "unknown",
    pid:         process.pid,
    results,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadHash = crypto.createHash("sha256").update(payloadJson).digest("hex");

  // Dynamic import so tests can run without a real DB connection
  const { db }  = await import("../db");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`
    INSERT INTO startup_attestations (payload_json, payload_hash)
    VALUES (${payloadJson}, ${payloadHash})
  `);

  console.log(`[Startup] Attestation recorded (sha256: ${payloadHash.slice(0, 16)}...)`);
}
