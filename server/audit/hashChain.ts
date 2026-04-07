import crypto from "crypto";

// ── Canonical serialization ───────────────────────────────────────────────────
//
// WHY NOT JSON.stringify:
//   JSON.stringify key order is insertion-order dependent. Two logically
//   identical objects built in different orders produce different strings and
//   therefore different hashes. This silently breaks cross-restart verification.
//
// WHY NOT a partial fix (sort top-level keys only):
//   Claude's version sorted top-level keys but fell back to JSON.stringify for
//   arrays, which does NOT sort nested object keys. [{b:1,a:2}] still
//   depends on insertion order inside the array.
//
// FIX (ChatGPT suggestion, adopted here):
//   Fully recursive canonicalize() handles every type uniformly:
//   - null                → "null"
//   - undefined (in obj)  → key is skipped (consistent with JSON spec)
//   - undefined (in arr)  → "null" (matches JSON.stringify behavior)
//   - primitives          → JSON.stringify
//   - arrays              → recurse each element
//   - objects             → sort keys, recurse each value

function canonicalize(value: unknown, inArray = false): string {
  if (value === null) return "null";

  if (value === undefined) {
    // In arrays undefined serialises as null (mirrors JSON.stringify)
    // In objects undefined means skip — handled at the object branch
    return inArray ? "null" : "";
  }

  const t = typeof value;

  if (t === "string" || t === "number" || t === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(v => canonicalize(v, true)).join(",") + "]";
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort();
    return "{" + keys.map(k =>
      JSON.stringify(k) + ":" + canonicalize(obj[k], false)
    ).join(",") + "}";
  }

  // Fallback for functions, symbols, bigint — should never appear in audit data
  return JSON.stringify(String(value));
}

export function stableStringify(value: unknown): string {
  return canonicalize(value, false);
}

// ── Hash computation ──────────────────────────────────────────────────────────
//
// Pure function — no side effects, no in-memory state.
// The DB is the only source of truth for the chain head.

export function computeChainHash(
  prevHash: string,
  entry: Record<string, unknown>,
): string {
  const content = prevHash + stableStringify(entry);
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

// ── Link verification ─────────────────────────────────────────────────────────
//
// Three layers of safety (Claude + ChatGPT both recommended these):
//  1. Hex-format guard  — rejects malformed inputs before any buffer ops
//  2. Length guard      — timingSafeEqual requires equal-length buffers
//  3. Constant-time compare — prevents timing-based hash oracle attacks

export function verifyChainLink(
  entry: Record<string, unknown>,
  prevHash: string,
  claimedHash: string,
): boolean {
  try {
    // Must be a 64-char hex string (SHA-256 output is always 32 bytes = 64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(claimedHash)) return false;

    const expected   = computeChainHash(prevHash, entry);
    const expectedBuf = Buffer.from(expected, "hex");
    const claimedBuf  = Buffer.from(claimedHash, "hex");

    if (expectedBuf.length !== claimedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, claimedBuf);
  } catch {
    return false;
  }
}
