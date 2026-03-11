import { loadCsvTable, getFirstValue } from "../skills/shared/csvTableLoader";

export async function getRuleGovernanceSummary() {
  const files = [
    "RED_FLAG_RULES.csv",
    "DISPOSITION_RULES.csv",
    "CLUSTER_SCORING_RULES.csv",
    "QUESTION_IMPACT.csv",
  ];

  const summaries: any[] = [];

  for (const file of files) {
    try {
      const rows = await loadCsvTable(file);
      summaries.push({
        file,
        rowCount: rows.length,
        sampleIds: rows
          .slice(0, 5)
          .map((r) =>
            getFirstValue(r, ["RULE_ID", "RF_ID", "ID", "BEST_CLUSTER_ID", "CC_ID"])
          ),
      });
    } catch {
      summaries.push({
        file,
        rowCount: 0,
        sampleIds: [],
      });
    }
  }

  return summaries;
}
