import fs from "fs";
import path from "path";

const MEMORY_PATH = path.join(process.cwd(), "clinical_memory.ndjson");

export interface ClinicalCase {
  complaint: string;
  answers: Record<string, any>;
  predictedDifferentials: any[];
  predictedDisposition: string;
  finalDiagnosis?: string;
  finalDisposition?: string;
  outcomeKnown?: boolean;
  timestamp: string;
}

export function storeClinicalCase(caseData: ClinicalCase): void {
  try {
    const line = JSON.stringify(caseData);
    fs.appendFileSync(MEMORY_PATH, line + "\n", "utf8");
  } catch (err) {
    console.warn("[ClinicalMemory] Failed to store case:", (err as Error).message);
  }
}

export function loadClinicalMemory(): ClinicalCase[] {
  try {
    if (!fs.existsSync(MEMORY_PATH)) return [];
    const lines = fs.readFileSync(MEMORY_PATH, "utf8").split("\n");
    return lines.filter(Boolean).map((l) => JSON.parse(l));
  } catch (err) {
    console.warn("[ClinicalMemory] Failed to load memory:", (err as Error).message);
    return [];
  }
}

export function findSimilarMemoryCases(
  complaint: string,
  answers: Record<string, any>,
  limit = 5
): Array<{ case: ClinicalCase; score: number }> {
  const cases = loadClinicalMemory();

  const scored = cases.map((c) => {
    let score = 0;
    if (c.complaint === complaint) score += 2;
    for (const k of Object.keys(answers)) {
      if (answers[k] !== undefined && answers[k] === c.answers?.[k]) score += 1;
    }
    return { case: c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function updateCaseOutcome(
  timestamp: string,
  finalDiagnosis: string,
  finalDisposition: string
): void {
  try {
    if (!fs.existsSync(MEMORY_PATH)) return;
    const lines = fs.readFileSync(MEMORY_PATH, "utf8").split("\n").filter(Boolean);
    const updated = lines.map((l) => {
      const c: ClinicalCase = JSON.parse(l);
      if (c.timestamp === timestamp) {
        return JSON.stringify({ ...c, finalDiagnosis, finalDisposition, outcomeKnown: true });
      }
      return l;
    });
    fs.writeFileSync(MEMORY_PATH, updated.join("\n") + "\n", "utf8");
  } catch (err) {
    console.warn("[ClinicalMemory] Failed to update outcome:", (err as Error).message);
  }
}
