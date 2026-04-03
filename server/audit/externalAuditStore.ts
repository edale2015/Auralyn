import fs from 'node:fs/promises';
import path from 'node:path';

const AUDIT_DIR = process.env.EXTERNAL_AUDIT_DIR || path.resolve(process.cwd(), 'data', 'external-audit');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit_hash_chain.ndjson');

export async function appendExternalAuditRecord(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await fs.appendFile(AUDIT_FILE, JSON.stringify(record) + '\n', 'utf8');
}
