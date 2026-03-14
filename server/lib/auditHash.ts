import * as crypto from "crypto"

export function hashPayload(payload: unknown): string {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload)
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16)
}

export function buildAuditEntry(
  action: string,
  actorId: string,
  payload: unknown
): {
  action: string
  actorId: string
  payloadHash: string
  ts: string
} {
  return {
    action,
    actorId,
    payloadHash: hashPayload(payload),
    ts: new Date().toISOString(),
  }
}
