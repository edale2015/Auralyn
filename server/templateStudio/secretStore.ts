import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { SecretRecord } from "../../shared/templateStudio";

const DATA_DIR = path.join(process.cwd(), "data", "template-studio");
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");

function getKey(): Buffer {
  const raw = process.env.TEMPLATE_SECRET_KEY || "dev-only-32-byte-secret-key-1234";
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(payload: string): string {
  const [ivHex, dataHex] = payload.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readSecrets(): Promise<SecretRecord[]> {
  try {
    const raw = await fs.readFile(SECRETS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeSecrets(data: SecretRecord[]) {
  await ensureDir();
  await fs.writeFile(SECRETS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export class SecretStore {
  async list(): Promise<Omit<SecretRecord, "encryptedValue">[]> {
    const secrets = await readSecrets();
    return secrets.map(({ encryptedValue: _ev, ...rest }) => rest);
  }

  async create(
    name: string,
    value: string,
    provider: SecretRecord["provider"] = "local",
    tags: string[] = []
  ) {
    const secrets = await readSecrets();
    const now = new Date().toISOString();
    const record: SecretRecord = {
      id: crypto.randomUUID(),
      name,
      provider,
      encryptedValue: encrypt(value),
      createdAt: now,
      updatedAt: now,
      tags,
    };
    secrets.push(record);
    await writeSecrets(secrets);
    return { id: record.id, name: record.name, provider: record.provider, createdAt: record.createdAt, updatedAt: record.updatedAt, tags: record.tags };
  }

  async resolve(secretRef: string): Promise<string | null> {
    const secrets = await readSecrets();
    const record = secrets.find(s => s.id === secretRef || s.name === secretRef);
    if (!record) return null;
    return decrypt(record.encryptedValue);
  }
}
