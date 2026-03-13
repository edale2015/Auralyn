import * as fs from "fs/promises";
import * as path from "path";
import { ReleaseGateResult } from "./platformTypes";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");
const HISTORY_FILE = path.join(RUNTIME_DIR, "release_gate_history.ndjson");

async function ensureDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function appendReleaseGateHistory(result: ReleaseGateResult): Promise<void> {
  await ensureDir();
  const record = { ...result, evaluatedAt: new Date().toISOString() };
  await fs.appendFile(HISTORY_FILE, JSON.stringify(record) + "\n", "utf8");
}

export async function listReleaseGateHistory(
  complaint?: string,
  limit = 100
): Promise<any[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    let rows = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    if (complaint) {
      rows = rows.filter((r) => r.complaint === complaint);
    }

    return rows.slice(-limit).reverse();
  } catch {
    return [];
  }
}
