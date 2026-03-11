import * as fs from "fs/promises";
import * as path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function appendGraphTraceLog(record: any) {
  await ensureDir();
  await fs.appendFile(
    path.join(RUNTIME_DIR, "graph_trace_log.ndjson"),
    JSON.stringify({
      ...record,
      timestamp: new Date().toISOString(),
    }) + "\n",
    "utf8"
  );
}
