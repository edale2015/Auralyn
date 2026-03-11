import * as fs from "fs/promises";
import * as path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function generateComplaintDriftAlerts() {
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");
  const caseAudits = await loadNdjson("case_audit_log.ndjson");

  const complaintStats: Record<string, { total: number; failures: number; safetyMisses: number }> = {};

  for (const recon of reconciliations) {
    const caseId = recon.case_id ?? recon.caseId;
    const audit = caseAudits.find((a) => (a.caseId ?? a.case_id) === caseId);
    const complaint = audit?.complaintId ?? audit?.complaint_id ?? "unknown";

    complaintStats[complaint] ??= { total: 0, failures: 0, safetyMisses: 0 };
    complaintStats[complaint].total += 1;

    if (!recon.top_prediction_match || !recon.disposition_match) {
      complaintStats[complaint].failures += 1;
    }
    if (recon.safety_miss_flag) {
      complaintStats[complaint].safetyMisses += 1;
    }
  }

  return Object.entries(complaintStats)
    .map(([complaint, stat]) => ({
      complaint,
      failureRate: stat.total ? stat.failures / stat.total : 0,
      safetyMissRate: stat.total ? stat.safetyMisses / stat.total : 0,
      ...stat,
      alert:
        stat.total >= 3 &&
        (stat.failures / stat.total > 0.2 || stat.safetyMisses / stat.total > 0.05),
    }))
    .filter((x) => x.alert)
    .sort((a, b) => b.failureRate - a.failureRate);
}
