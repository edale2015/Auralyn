import { query } from "../db";

export async function saveAutomationCredential(input: {
  credentialKey: string;
  systemName: string;
  username?: string;
  secretJson: Record<string, any>;
}) {
  const result = await query(
    `INSERT INTO automation_credentials (credential_key, system_name, username, secret_json, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (credential_key)
     DO UPDATE SET
       system_name = EXCLUDED.system_name,
       username = EXCLUDED.username,
       secret_json = EXCLUDED.secret_json,
       updated_at = NOW()
     RETURNING id, credential_key, system_name, username, created_at, updated_at`,
    [
      input.credentialKey,
      input.systemName,
      input.username || null,
      input.secretJson,
    ]
  );
  return result.rows[0];
}

export async function getAutomationCredential(credentialKey: string) {
  const result = await query(
    `SELECT * FROM automation_credentials WHERE credential_key = $1 LIMIT 1`,
    [credentialKey]
  );
  return result.rows[0] ?? null;
}

export async function listAutomationCredentials() {
  const result = await query(
    `SELECT id, credential_key, system_name, username, created_at, updated_at
     FROM automation_credentials
     ORDER BY updated_at DESC`
  );
  return result.rows;
}
