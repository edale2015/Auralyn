export interface ConsistencyRecord {
  decision: string;
  complaint: string;
  timestamp: Date;
}

export interface ConsistencyResult {
  consistent: boolean;
  mismatchCount: number;
  totalChecked: number;
  mismatchRate: number;
  dominantDecision: string | null;
  alertRequired: boolean;
}

export function checkConsistency(
  history: ConsistencyRecord[],
  newDecision: string,
  threshold = 2
): ConsistencyResult {
  const totalChecked = history.length;

  if (totalChecked === 0) {
    return {
      consistent: true,
      mismatchCount: 0,
      totalChecked: 0,
      mismatchRate: 0,
      dominantDecision: newDecision,
      alertRequired: false,
    };
  }

  const mismatchCount = history.filter((h) => h.decision !== newDecision).length;
  const mismatchRate  = Math.round((mismatchCount / totalChecked) * 1000) / 1000;

  const decisionCounts: Record<string, number> = {};
  for (const h of history) {
    decisionCounts[h.decision] = (decisionCounts[h.decision] || 0) + 1;
  }
  const dominantDecision =
    Object.entries(decisionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    consistent:       mismatchCount < threshold,
    mismatchCount,
    totalChecked,
    mismatchRate,
    dominantDecision,
    alertRequired:    mismatchCount >= threshold,
  };
}

export function buildConsistencyRecord(
  decision: string,
  complaint: string
): ConsistencyRecord {
  return { decision, complaint, timestamp: new Date() };
}
