/**
 * server/automation/credentialVault.ts — Encrypted EHR automation credential store
 *
 * FIX (Code Review Critical Finding #4):
 *   secret_json was stored and returned as plaintext PostgreSQL JSONB.
 *   A SQL injection, misconfigured RLS, or database dump exposed every
 *   automation credential (EHR passwords, API keys, tokens) in cleartext.
 *   HIPAA Business Associate level secrets must be encrypted at rest.
 *
 *   Fixed: AES-256-GCM encryption applied at the application layer before write.
 *   Only ciphertext + IV + auth-tag are stored in the DB. Decryption happens
 *   on read using the CREDENTIAL_ENCRYPTION_KEY env var. Callers receive the
 *   decrypted secretJson but it is never logged or included in API responses
 *   (the list endpoint omits secret_json entirely — see listAutomationCredentials).
 *
 *   Key requirement: CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars).
 *   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from "crypto";
import { query } from "../db";

const ALGO      = "aes-256-gcm";
const IV_BYTES  = 12;   // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;

// ── Encryption key ────────────────────────────────────────────────────────────

function getDerivedKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY ?? "";
  if (!raw) {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      throw new Error(
        "FATAL: CREDENTIAL_ENCRYPTION_KEY is not set. " +
        "EHR automation credentials cannot be encrypted without it. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    console.warn(
      "[CredentialVault] CREDENTIAL_ENCRYPTION_KEY not set — using dev-only key. " +
      "Set in production before storing real EHR credentials."
    );
    return Buffer.from("0".repeat(64), "hex");  // dev fallback: all-zero key
  }

  if (raw.length !== 64) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(raw, "hex");
}

// ── Encryption / Decryption ───────────────────────────────────────────────────

interface EncryptedBlob {
  iv:  string;   // hex
  tag: string;   // hex (GCM auth tag)
  ct:  string;   // hex (ciphertext)
  v:   1;        // schema version — for future key rotation
}

function encryptSecret(plain: Record<string, any>): EncryptedBlob {
  const key  = getDerivedKey();
  const iv   = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const pt   = Buffer.from(JSON.stringify(plain), "utf8");
  const ct   = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag  = cipher.getAuthTag();

  return { iv: iv.toString("hex"), tag: tag.toString("hex"), ct: ct.toString("hex"), v: 1 };
}

function decryptSecret(blob: EncryptedBlob): Record<string, any> {
  const key    = getDerivedKey();
  const iv     = Buffer.from(blob.iv,  "hex");
  const tag    = Buffer.from(blob.tag, "hex");
  const ct     = Buffer.from(blob.ct,  "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * saveAutomationCredential — encrypt and store EHR credentials.
 * secretJson is encrypted before insert; only ciphertext reaches the DB.
 */
export async function saveAutomationCredential(input: {
  credentialKey: string;
  systemName:    string;
  username?:     string;
  secretJson:    Record<string, any>;
}) {
  const encrypted = encryptSecret(input.secretJson);

  const result = await query(
    `INSERT INTO automation_credentials
       (credential_key, system_name, username, secret_json, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (credential_key)
     DO UPDATE SET
       system_name = EXCLUDED.system_name,
       username    = EXCLUDED.username,
       secret_json = EXCLUDED.secret_json,
       updated_at  = NOW()
     RETURNING id, credential_key, system_name, username, created_at, updated_at`,
    [
      input.credentialKey,
      input.systemName,
      input.username || null,
      encrypted,       // ciphertext blob — NOT plaintext
    ]
  );

  return result.rows[0];
}

/**
 * getAutomationCredential — retrieve and decrypt EHR credentials.
 * Returns decrypted secretJson. NEVER log or expose this in API responses.
 */
export async function getAutomationCredential(
  credentialKey: string
): Promise<{ id: number; credentialKey: string; systemName: string; username: string | null; secretJson: Record<string, any> } | null> {
  const result = await query(
    `SELECT * FROM automation_credentials WHERE credential_key = $1 LIMIT 1`,
    [credentialKey]
  );

  const row = result.rows[0];
  if (!row) return null;

  const secretJson = decryptSecret(row.secret_json as EncryptedBlob);

  return {
    id:            row.id,
    credentialKey: row.credential_key,
    systemName:    row.system_name,
    username:      row.username,
    secretJson,    // decrypted in memory — never persisted
  };
}

/**
 * listAutomationCredentials — list credentials WITHOUT secretJson.
 * Metadata only. Never returns decrypted secrets.
 */
export async function listAutomationCredentials() {
  const result = await query(
    `SELECT id, credential_key, system_name, username, created_at, updated_at
     FROM automation_credentials
     ORDER BY updated_at DESC`
  );
  return result.rows;  // secretJson column excluded — safe for API responses
}
