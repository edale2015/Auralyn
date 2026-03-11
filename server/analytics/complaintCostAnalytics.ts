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

export async function computeComplaintCostAnalytics() {
  const skillRuns = await loadNdjson("skill_run_log.ndjson");

  const byComplaint: Record<
    string,
    { count: number; totalCostUsd: number; totalLatencyMs: number }
  > = {};

  for (const row of skillRuns) {
    let complaint = "unknown";
    try {
      const inputSummary = JSON.parse(row.inputSummary ?? "{}");
      complaint = inputSummary.complaintId || row.complaintFamily || "unknown";
    } catch {
      complaint = row.complaintFamily || "unknown";
    }

    byComplaint[complaint] ??= { count: 0, totalCostUsd: 0, totalLatencyMs: 0 };
    byComplaint[complaint].count += 1;
    byComplaint[complaint].totalCostUsd += Number(row.estimatedCostUsd ?? 0);
    byComplaint[complaint].totalLatencyMs += Number(row.latencyMs ?? 0);
  }

  const rows = Object.entries(byComplaint).map(([complaint, info]) => ({
    complaint,
    count: info.count,
    avgCostUsd: info.count ? info.totalCostUsd / info.count : 0,
    avgLatencyMs: info.count ? info.totalLatencyMs / info.count : 0,
    totalCostUsd: info.totalCostUsd,
  }));

  rows.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  return rows;
}
