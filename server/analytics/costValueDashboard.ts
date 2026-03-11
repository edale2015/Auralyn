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

export async function computeCostValueDashboard() {
  const skillRuns = await loadNdjson("skill_run_log.ndjson");

  const byCase: Record<
    string,
    {
      complaintId: string;
      totalCostUsd: number;
      totalLatencyMs: number;
    }
  > = {};

  for (const row of skillRuns) {
    const caseId = row.caseId ?? row.case_id;
    if (!caseId) continue;

    byCase[caseId] ??= {
      complaintId: "unknown",
      totalCostUsd: 0,
      totalLatencyMs: 0,
    };

    byCase[caseId].totalCostUsd += Number(row.estimatedCostUsd ?? 0);
    byCase[caseId].totalLatencyMs += Number(row.latencyMs ?? 0);

    try {
      const inputSummary = JSON.parse(row.inputSummary ?? "{}");
      if (inputSummary.complaintId)
        byCase[caseId].complaintId = inputSummary.complaintId;
    } catch {
      // ignore
    }
  }

  const byComplaint: Record<
    string,
    {
      cases: number;
      totalCostUsd: number;
      totalLatencyMs: number;
    }
  > = {};

  for (const item of Object.values(byCase)) {
    byComplaint[item.complaintId] ??= {
      cases: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
    };
    byComplaint[item.complaintId].cases += 1;
    byComplaint[item.complaintId].totalCostUsd += item.totalCostUsd;
    byComplaint[item.complaintId].totalLatencyMs += item.totalLatencyMs;
  }

  const rows = Object.entries(byComplaint).map(([complaint, stat]) => ({
    complaint,
    cases: stat.cases,
    avgCostUsdPerCase: stat.cases ? stat.totalCostUsd / stat.cases : 0,
    avgLatencyMsPerCase: stat.cases ? stat.totalLatencyMs / stat.cases : 0,
    totalCostUsd: stat.totalCostUsd,
  }));

  rows.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  return rows;
}
