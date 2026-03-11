import * as fs from "fs/promises";
import * as path from "path";
import { ReviewQueueItem } from "./platformTypes";
import { generateComplaintDriftAlerts } from "../learning/complaintDriftAlerts";
import { buildComplaintHardeningQueue } from "../learning/complaintHardeningQueue";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function buildUnifiedReviewQueue(): Promise<ReviewQueueItem[]> {
  const driftAlerts = await generateComplaintDriftAlerts();
  const hardeningQueue = await buildComplaintHardeningQueue();
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");

  const items: ReviewQueueItem[] = [];

  for (const alert of driftAlerts) {
    items.push({
      id: `DRIFT_${alert.complaint}`,
      type: "hardening_review",
      complaint: alert.complaint,
      priority: alert.safetyMissRate > 0.05 ? "critical" : "high",
      createdAt: new Date().toISOString(),
      payload: alert,
    });
  }

  for (const item of hardeningQueue) {
    items.push({
      id: `HARDEN_${item.complaint}`,
      type: "hardening_review",
      complaint: item.complaint,
      priority: item.priority,
      createdAt: item.createdAt,
      payload: item,
    });
  }

  for (const rec of reconciliations.slice(-25)) {
    if (
      rec.top_prediction_match &&
      rec.disposition_match &&
      !rec.safety_miss_flag
    )
      continue;

    items.push({
      id: `REC_${rec.case_id ?? rec.caseId}`,
      type: "reconciliation_review",
      caseId: rec.case_id ?? rec.caseId,
      priority: rec.safety_miss_flag ? "critical" : "medium",
      createdAt: rec.recordedAt ?? new Date().toISOString(),
      payload: rec,
    });
  }

  return items.sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    return rank[b.priority] - rank[a.priority];
  });
}
