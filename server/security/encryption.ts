import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

let warnedAboutDevKey = false;

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    return Buffer.from(envKey, "hex");
  }
  if (!warnedAboutDevKey) {
    console.warn("[Security] ENCRYPTION_KEY not set — using development fallback key. Set ENCRYPTION_KEY (64 hex chars) for production.");
    warnedAboutDevKey = true;
  }
  return crypto.createHash("sha256").update("default-dev-key-not-for-production").digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(data: string): string {
  const key = getKey();
  const [ivHex, encrypted] = data.split(":");
  if (!ivHex || !encrypted) throw new Error("Invalid encrypted data format");

  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function hashData(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
