import type { SpecialistOpinion } from "../agents/cardiologyLLMAgent";

export interface DebateResult {
  opinions:  SpecialistOpinion[];
  consensus: { diagnosis: string; totalScore: number };
  dissent:   { specialist: string; diagnosis: string; confidence: number }[];
  summary:   string;
}

interface Evaluator {
  name: string;
  evaluate(ctx: Record<string, unknown>): Promise<SpecialistOpinion>;
}

export async function runDebate(
  agents: Evaluator[],
  ctx:    Record<string, unknown>
): Promise<DebateResult> {
  const opinions: SpecialistOpinion[] = await Promise.all(
    agents.map((a) => a.evaluate(ctx))
  );

  // Score by weighted confidence sum
  const scores = new Map<string, number>();
  for (const o of opinions) {
    scores.set(o.diagnosis, (scores.get(o.diagnosis) ?? 0) + o.confidence);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topDx  = sorted[0] ?? ["Unknown", 0];

  const consensus = { diagnosis: topDx[0], totalScore: Number(topDx[1].toFixed(3)) };

  const dissent = opinions
    .filter((o) => o.diagnosis !== consensus.diagnosis)
    .map((o) => ({ specialist: o.specialist, diagnosis: o.diagnosis, confidence: o.confidence }));

  const agreeCount = opinions.filter((o) => o.diagnosis === consensus.diagnosis).length;
  const summary = `${agreeCount}/${opinions.length} specialists agree on "${consensus.diagnosis}". ${
    dissent.length > 0
      ? `Dissent from: ${dissent.map((d) => d.specialist).join(", ")}.`
      : "Full consensus."
  }`;

  return { opinions, consensus, dissent, summary };
}
