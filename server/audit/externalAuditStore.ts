import fs from 'node:fs/promises';
import path from 'node:path';

const AUDIT_DIR = process.env.EXTERNAL_AUDIT_DIR || path.resolve(process.cwd(), 'data', 'external-audit');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit_hash_chain.ndjson');
const MAX_FILE_BYTES = parseInt(process.env.AUDIT_NDJSON_MAX_BYTES || String(10 * 1024 * 1024), 10);

async function rotateIfNeeded(): Promise<void> {
  try {
    const stat = await fs.stat(AUDIT_FILE);
    if (stat.size >= MAX_FILE_BYTES) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotated = path.join(AUDIT_DIR, `audit_hash_chain_${timestamp}.ndjson`);
      await fs.rename(AUDIT_FILE, rotated);
      console.log(`[ExternalAuditStore] Rotated audit file → ${path.basename(rotated)}`);
    }
  } catch {
  }
}

export async function appendExternalAuditRecord(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await rotateIfNeeded();
  await fs.appendFile(AUDIT_FILE, JSON.stringify(record) + '\n', 'utf8');
}
