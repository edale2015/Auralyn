/**
 * Cryptographic audit chain for FDA 21 CFR Part 11 compliance.
 *
 * Each entry is linked to the previous via SHA-256 so the chain
 * cannot be tampered with without invalidating all subsequent hashes.
 *
 * The genesis entry is anchored to the string "GENESIS".
 */

import crypto from "crypto";

export interface AuditEntry {
  [key: string]: unknown;
}

export interface ChainedEntry extends AuditEntry {
  hash:     string;
  prevHash: string;
}

/**
 * Build a forward-linked audit chain from an array of entries.
 *
 * @param entries  ordered list of audit payload objects
 * @returns        same entries with `hash` and `prevHash` fields appended
 */
export function buildAuditChain(entries: AuditEntry[]): ChainedEntry[] {
  let prevHash = "GENESIS";

  return entries.map((e) => {
    const hash = crypto
      .createHash("sha256")
      .update(prevHash + JSON.stringify(e))
      .digest("hex");

    const chained: ChainedEntry = { ...e, prevHash, hash };
    prevHash = hash;
    return chained;
  });
}

/**
 * Verify the integrity of a previously built chain.
 * Returns false if any link is broken.
 */
export function verifyAuditChain(chain: ChainedEntry[]): boolean {
  let prevHash = "GENESIS";

  for (const entry of chain) {
    const { hash, prevHash: storedPrev, ...payload } = entry;

    if (storedPrev !== prevHash) return false;

    const expected = crypto
      .createHash("sha256")
      .update(prevHash + JSON.stringify(payload))
      .digest("hex");

    if (expected !== hash) return false;
    prevHash = hash;
  }

  return true;
}
