import * as fs from "fs/promises";
import * as path from "path";
import { reprioritizeQuestionsFromOutcomes } from "./questionReprioritizer";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

export async function saveQuestionReprioritization() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  const rows = await reprioritizeQuestionsFromOutcomes();
  const outPath = path.join(RUNTIME_DIR, "question_reprioritization.json");
  await fs.writeFile(outPath, JSON.stringify(rows, null, 2), "utf8");
  console.log(`Saved -> ${outPath}`);
  return rows;
}
