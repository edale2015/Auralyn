import crypto from "crypto";

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}
