export interface RankerCandidate {
  token: string;
  questionText: string;
  askOrder?: number;
  priorityScore?: number;
}

export interface RankerInput {
  candidates: RankerCandidate[];
  answers: Record<string, unknown>;
  criticalTokens: string[];
  winningClusterId?: string;
  dxCandidates?: Array<{ clusterId?: string }>;
  triggeredRedFlags?: string[];
}

export function rankNextQuestions(input: RankerInput): RankerCandidate[] {
  const { candidates, answers, criticalTokens } = input;

  const unanswered = candidates.filter((c) => {
    const val = answers[c.token];
    return val === undefined || val === null || val === "";
  });

  const scored = unanswered.map((c) => {
    let priority = 0;

    if (criticalTokens.includes(c.token)) {
      priority += 100;
    }

    if (c.askOrder !== undefined) {
      priority += Math.max(0, 50 - c.askOrder);
    }

    return { ...c, priorityScore: priority };
  });

  scored.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  return scored;
}
