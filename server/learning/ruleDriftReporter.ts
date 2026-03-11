import * as fs from "fs/promises";
import * as path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export async function generateRuleDriftReport() {
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");
  const failures = reconciliations.filter(
    (r) => !r.top_prediction_match || !r.disposition_match || r.safety_miss_flag
  );

  const byComplaint: Record<string, number> = {};

  for (const row of failures) {
    const complaint = row.case_id?.split("_")[0] ?? "unknown";
    byComplaint[complaint] = (byComplaint[complaint] ?? 0) + 1;
  }

  return {
    totalReconciliations: reconciliations.length,
    totalFailures: failures.length,
    byComplaint,
  };
}
