import { db } from "../db";
import { kbQuestionUtility } from "../../shared/schema";

export interface SuggestedQuestion {
  questionKey: string;
  infoGainScore: number;
  supportingDx: string[];
}

export async function getNextBestQuestions(
  currentDx: Array<{ diagnosis: string; diagnosisLabel?: string; posterior: number }>,
  answeredKeys: string[] = [],
  topN = 5
): Promise<SuggestedQuestion[]> {
  const rows = await db.select().from(kbQuestionUtility);

  const scores: Record<string, { total: number; supportingDx: string[] }> = {};

  for (const dx of currentDx) {
    for (const row of rows) {
      if (row.diagnosis !== dx.diagnosis) continue;
      if (answeredKeys.includes(row.questionKey)) continue;
      if (!scores[row.questionKey]) scores[row.questionKey] = { total: 0, supportingDx: [] };
      scores[row.questionKey].total += dx.posterior * row.infoGain;
      scores[row.questionKey].supportingDx.push(dx.diagnosis);
    }
  }

  return Object.entries(scores)
    .map(([key, val]) => ({
      questionKey: key,
      infoGainScore: val.total,
      supportingDx: [...new Set(val.supportingDx)],
    }))
    .sort((a, b) => b.infoGainScore - a.infoGainScore)
    .slice(0, topN);
}
