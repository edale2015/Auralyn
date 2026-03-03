import crypto from "node:crypto";

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function stableJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as any).sort());
}
