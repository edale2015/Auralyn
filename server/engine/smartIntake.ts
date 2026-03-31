import { db } from "../db";
import { sql } from "drizzle-orm";

export interface ScoredQuestion {
  key: string;
  displayText: string;
  score: number;
  infoGain: number;
  redFlagWeight: number;
  required: boolean;
  category: string;
  isRedFlag: boolean;
}

export async function getSmartQuestions(
  dxDist: Array<{ diagnosis: string; posterior: number }>,
  askedKeys: string[],
  complaintId: string
): Promise<ScoredQuestion[]> {
  try {
    const result = await db.execute(sql`
      SELECT question_key, display_text, info_gain, red_flag_weight, required, category
      FROM kb_question_logic
      WHERE is_active = TRUE
        AND (complaint_id = ${complaintId} OR complaint_id = 'global')
      ORDER BY info_gain DESC
    `);
    const rows = (result.rows ?? result) as any[];
    if (!rows.length) return [];

    const scored = rows
      .filter(q => !askedKeys.includes(q.question_key))
      .map(q => {
        let gain = 0;
        for (const dx of dxDist) {
          gain += dx.posterior * (q.info_gain ?? 0.5);
        }
        const score = gain + (q.red_flag_weight ?? 0) * 0.5;
        return {
          key: q.question_key as string,
          displayText: (q.display_text as string) || q.question_key,
          score,
          infoGain: q.info_gain as number,
          redFlagWeight: q.red_flag_weight as number,
          required: q.required as boolean,
          category: (q.category as string) || "general",
          isRedFlag: (q.red_flag_weight as number) >= 0.8,
        };
      });

    // Required questions always float to top, then sort by score
    return scored
      .sort((a, b) => {
        if (a.required && !b.required) return -1;
        if (!a.required && b.required) return 1;
        return b.score - a.score;
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}
