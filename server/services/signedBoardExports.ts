import crypto from "crypto";

export function canonicalJson(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value);
  }
  return JSON.stringify(
    value,
    Object.keys(value as Record<string, unknown>).sort()
  );
}

export function signBoardPayload(payload: unknown) {
  const serialized = canonicalJson(payload);
  const signature = crypto
    .createHmac(
      "sha256",
      process.env.BOARD_EXPORT_SIGNING_SECRET || "dev-board-secret"
    )
    .update(serialized)
    .digest("hex");

  return {
    payload,
    signature,
    algorithm: "HMAC-SHA256",
    signedAt: new Date().toISOString(),
  };
}

export function verifyBoardSignature(
  payload: unknown,
  signature: string
): boolean {
  const expected = crypto
    .createHmac(
      "sha256",
      process.env.BOARD_EXPORT_SIGNING_SECRET || "dev-board-secret"
    )
    .update(canonicalJson(payload))
    .digest("hex");

  return expected === signature;
}
