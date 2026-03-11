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

export type HardeningQueueItem = {
  complaint: string;
  priority: "low" | "medium" | "high" | "critical";
  reason: string;
  failureCount: number;
  safetyMissCount: number;
  createdAt: string;
};

export async function buildComplaintHardeningQueue(): Promise<
  HardeningQueueItem[]
> {
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");

  const byComplaint: Record<
    string,
    { failures: number; safetyMisses: number }
  > = {};

  for (const row of reconciliations) {
    const complaintRaw =
      row.complaintId ??
      row.complaint_id ??
      (row.case_id ?? "").replace(/^[A-Z_]+_/, "").toLowerCase();

    const complaint = String(complaintRaw || "unknown");

    byComplaint[complaint] ??= { failures: 0, safetyMisses: 0 };

    if (!row.top_prediction_match || !row.disposition_match) {
      byComplaint[complaint].failures += 1;
    }
    if (row.safety_miss_flag) {
      byComplaint[complaint].safetyMisses += 1;
    }
  }

  const items: HardeningQueueItem[] = [];

  for (const [complaint, stat] of Object.entries(byComplaint)) {
    if (stat.failures === 0 && stat.safetyMisses === 0) continue;

    let priority: HardeningQueueItem["priority"] = "low";
    if (stat.safetyMisses > 0) priority = "critical";
    else if (stat.failures >= 5) priority = "high";
    else if (stat.failures >= 2) priority = "medium";

    items.push({
      complaint,
      priority,
      reason:
        stat.safetyMisses > 0
          ? `${stat.safetyMisses} safety miss(es) detected`
          : `${stat.failures} prediction/disposition failure(s)`,
      failureCount: stat.failures,
      safetyMissCount: stat.safetyMisses,
      createdAt: new Date().toISOString(),
    });
  }

  items.sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    return rank[b.priority] - rank[a.priority];
  });

  return items;
}
