import crypto from "crypto";

let lastHash = "GENESIS";

export function computeChainHash(prevHash: string, entry: Record<string, unknown>): string {
  const content = prevHash + JSON.stringify(entry);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function advanceChain(entry: Record<string, unknown>): { hash: string; prevHash: string } {
  const prevHash = lastHash;
  const hash = computeChainHash(prevHash, entry);
  lastHash = hash;
  return { hash, prevHash };
}

export function getCurrentChainHead(): string {
  return lastHash;
}

export function verifyChainLink(entry: Record<string, unknown>, prevHash: string, claimedHash: string): boolean {
  const expected = computeChainHash(prevHash, entry);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(claimedHash, "hex"));
  } catch {
    return false;
  }
}
