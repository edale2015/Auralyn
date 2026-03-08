export interface NormalizedTrace {
  caseId: string;
  timestamp: string;
  disposition?: string;
  confidence?: string;
  winningCluster?: string;
  triggeredRedFlags: string[];
  dxCandidates: { clusterId: string; score: number }[];
  scoringSteps: { rule: string; result: string }[];
}

export function normalizeEngineTrace(engineResult: any, caseId: string): NormalizedTrace {
  if (!engineResult) {
    return {
      caseId,
      timestamp: new Date().toISOString(),
      triggeredRedFlags: [],
      dxCandidates: [],
      scoringSteps: [],
    };
  }

  return {
    caseId,
    timestamp: new Date().toISOString(),
    disposition: engineResult.recommendedDisposition,
    confidence: engineResult.confidence,
    winningCluster: engineResult.winningClusterId,
    triggeredRedFlags: engineResult.triggeredRedFlags ?? [],
    dxCandidates: (engineResult.dxCandidates ?? []).map((d: any) => ({
      clusterId: d.clusterId ?? d.id ?? "",
      score: d.score ?? d.probability ?? 0,
    })),
    scoringSteps: (engineResult.trace ?? engineResult.scoringTrace ?? []).map((s: any) => ({
      rule: s.ruleId ?? s.rule ?? "",
      result: s.result ?? s.outcome ?? "",
    })),
  };
}
