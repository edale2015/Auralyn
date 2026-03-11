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

export async function reprioritizeQuestionsFromOutcomes() {
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");
  const skillRuns = await loadNdjson("skill_run_log.ndjson");

  const questionStats: Record<string, { helped: number; harmed: number }> = {};

  for (const recon of reconciliations) {
    const caseId = recon.case_id ?? recon.caseId;
    const caseQuestionRuns = skillRuns.filter(
      (r) => r.caseId === caseId && r.skillName === "select_next_best_question"
    );

    for (const row of caseQuestionRuns) {
      let question = "unknown_question";
      try {
        const output = JSON.parse(row.outputSummary ?? "{}");
        question = output?.result?.next_question ?? "unknown_question";
      } catch {
        question = "unknown_question";
      }

      questionStats[question] ??= { helped: 0, harmed: 0 };

      if (recon.top_prediction_match && recon.disposition_match && !recon.safety_miss_flag) {
        questionStats[question].helped += 1;
      } else {
        questionStats[question].harmed += 1;
      }
    }
  }

  return Object.entries(questionStats)
    .map(([question, stat]) => ({
      question,
      netValue: stat.helped - stat.harmed,
      helped: stat.helped,
      harmed: stat.harmed,
    }))
    .sort((a, b) => b.netValue - a.netValue);
}
