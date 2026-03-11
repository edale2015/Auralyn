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

export async function rankHighYieldQuestions() {
  const skillRuns = await loadNdjson("skill_run_log.ndjson");
  const questionRuns = skillRuns.filter((r) => r.skillName === "select_next_best_question");

  const counts: Record<string, number> = {};

  for (const run of questionRuns) {
    try {
      const output = JSON.parse(run.outputSummary ?? "{}");
      const q = output?.resultKeys?.includes("next_question")
        ? "next_question_present"
        : "unknown_question";
      counts[q] = (counts[q] ?? 0) + 1;
    } catch {
      counts.unknown_question = (counts.unknown_question ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([question, count]) => ({ question, count }))
    .sort((a, b) => b.count - a.count);
}
