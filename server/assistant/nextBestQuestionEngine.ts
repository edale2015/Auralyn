export interface RankedQuestion {
  id: string;
  text: string;
  target: "diagnosis" | "triage" | "safety" | "treatment";
  infoGain: number;
  blockingRisk: boolean;
}

export interface NextBestQuestionResult {
  winner: RankedQuestion | null;
  ranked: RankedQuestion[];
  reason: string;
}

export function chooseNextBestQuestion(params: {
  adaptiveQuestions?: Array<{ id?: string; text?: string; question?: { text: string }; blockingRisk?: boolean }>;
  uncertainty: number;
  debate?: { disagreement?: number; consensusScore?: number };
  missingServices?: string[];
}): NextBestQuestionResult {
  const adaptive = params.adaptiveQuestions ?? [];
  const disagreement = params.debate?.disagreement ?? 0;
  const consensus = params.debate?.consensusScore ?? 1;
  const missing = params.missingServices ?? [];

  const ranked: RankedQuestion[] = adaptive
    .map((q, idx) => {
      const text = q.text ?? q.question?.text ?? "";
      if (!text) return null;

      let infoGain = 0.25;
      if (missing.includes("differential")) infoGain += 0.12;
      if (missing.includes("urgencyScore")) infoGain += 0.18;
      if (disagreement > 0.25) infoGain += 0.18;
      if (params.uncertainty > 0.50) infoGain += 0.20;
      if (consensus < 0.50) infoGain += 0.12;
      if (q.blockingRisk) infoGain += 0.25;

      const target: RankedQuestion["target"] =
        q.blockingRisk ? "safety" :
        disagreement > 0.25 ? "triage" :
        params.uncertainty > 0.5 ? "diagnosis" :
        "diagnosis";

      return {
        id: q.id ?? `q-${idx}`,
        text,
        target,
        infoGain: Math.min(1, Math.round(infoGain * 100) / 100),
        blockingRisk: q.blockingRisk ?? false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.infoGain - a!.infoGain) as RankedQuestion[];

  return {
    winner: ranked[0] ?? null,
    ranked,
    reason: ranked[0]
      ? `Highest info-gain question selected (${(ranked[0].infoGain * 100).toFixed(0)}% gain, target: ${ranked[0].target})`
      : "No adaptive questions available for re-query",
  };
}
