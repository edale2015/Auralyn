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

export async function computeSkillLayerAnalytics() {
  const skillRuns = await loadNdjson("skill_run_log.ndjson");
  const caseAudits = await loadNdjson("case_audit_log.ndjson");
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");

  const bySkill: Record<string, { count: number; avgLatency: number }> = {};
  for (const run of skillRuns) {
    const skill = run.skillName ?? "unknown";
    bySkill[skill] ??= { count: 0, avgLatency: 0 };
    const current = bySkill[skill];
    current.avgLatency =
      (current.avgLatency * current.count + (run.latencyMs ?? 0)) / (current.count + 1);
    current.count += 1;
  }

  const dispositionCounts: Record<string, number> = {};
  for (const audit of caseAudits) {
    const d = audit.disposition ?? "unknown";
    dispositionCounts[d] = (dispositionCounts[d] ?? 0) + 1;
  }

  const safetyMisses = reconciliations.filter((r) => r.safety_miss_flag).length;

  return {
    totalSkillRuns: skillRuns.length,
    totalCases: caseAudits.length,
    dispositionCounts,
    bySkill,
    safetyMisses,
  };
}
