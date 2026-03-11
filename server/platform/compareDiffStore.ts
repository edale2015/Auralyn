import fs from "fs/promises";
import path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function appendCompareDiff(record: any) {
  await ensureDir();
  await fs.appendFile(
    path.join(RUNTIME_DIR, "compare_mode_diffs.ndjson"),
    JSON.stringify({
      ...record,
      timestamp: new Date().toISOString(),
    }) + "\n",
    "utf8"
  );
}

export async function listCompareDiffs(limit = 100) {
  try {
    const raw = await fs.readFile(
      path.join(RUNTIME_DIR, "compare_mode_diffs.ndjson"),
      "utf8"
    );
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}
