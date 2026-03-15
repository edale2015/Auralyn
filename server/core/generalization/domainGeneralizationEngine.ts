export interface DomainSignal {
  feature: string;
  weight: number;
}

export interface GenericCase {
  caseId: string;
  domain: string;
  signals: DomainSignal[];
}

export function scoreGenericCaseSimilarity(target: GenericCase, memory: GenericCase[]) {
  const targetMap = new Map(target.signals.map((s) => [s.feature, s.weight]));
  return memory
    .filter((m) => m.domain === target.domain)
    .map((m) => {
      let score = 0;
      for (const s of m.signals) {
        score += Math.min(s.weight, targetMap.get(s.feature) ?? 0);
      }
      return { caseId: m.caseId, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function createGenericDecisionPacket(domain: string, rankedHypotheses: Array<{ key: string; score: number }>) {
  return {
    domain,
    topHypothesis: rankedHypotheses[0]?.key,
    confidence: rankedHypotheses[0]?.score ?? 0,
    generatedAt: new Date().toISOString(),
  };
}
