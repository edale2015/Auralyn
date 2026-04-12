/**
 * Trace Inheritance Engine
 * Builds an immutable, SHA-256-hashed audit record from a ClinicalTokenSet.
 * Kills inconsistency by giving every pipeline run a unique, verifiable fingerprint.
 */

import crypto from "crypto";
import type { ClinicalTokenSet } from "../core/clinicalTokens";

export interface ClinicalTrace {
  id:               string;
  timestamp:        string;
  complaint:        string;
  posterior:        Record<string, number>;
  redFlags:         string[];
  riskLevel:        string;
  allowedDiagnoses: string[];
  temperature?:     string;
  hash:             string;
}

export function buildTrace(tokens: ClinicalTokenSet & { shadowOverrides?: any[] }): ClinicalTrace {
  const base = {
    id:               tokens.traceId,
    timestamp:        new Date().toISOString(),
    complaint:        tokens.complaint,
    posterior:        tokens.posterior,
    redFlags:         tokens.redFlags,
    riskLevel:        tokens.riskLevel,
    allowedDiagnoses: tokens.allowedDiagnoses,
  };

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(base))
    .digest("hex");

  return { ...base, hash };
}

/** Verify that a stored trace has not been tampered with */
export function verifyTrace(trace: ClinicalTrace): boolean {
  const { hash, ...rest } = trace;
  const recomputed = crypto
    .createHash("sha256")
    .update(JSON.stringify(rest))
    .digest("hex");
  return recomputed === hash;
}
