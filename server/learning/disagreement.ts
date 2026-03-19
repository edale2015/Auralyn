interface Disagreement {
  aiDiagnosis: string;
  physicianDiagnosis: string;
  aiConfidence: number;
  complaint: string;
  caseId: string;
  timestamp: string;
}

const disagreements: Disagreement[] = [];

export function logDisagreement(
  caseId: string,
  complaint: string,
  aiDiagnosis: string,
  physicianDiagnosis: string,
  aiConfidence: number,
): Disagreement {
  const entry: Disagreement = {
    aiDiagnosis,
    physicianDiagnosis,
    aiConfidence,
    complaint,
    caseId,
    timestamp: new Date().toISOString(),
  };
  disagreements.push(entry);
  if (disagreements.length > 2000) disagreements.splice(0, disagreements.length - 2000);
  return entry;
}

export function analyzeDisagreements(): {
  patterns: Record<string, number>;
  totalDisagreements: number;
  topMismatches: Array<{ pattern: string; count: number }>;
  avgAiConfidenceOnError: number;
} {
  const patterns: Record<string, number> = {};
  let totalConfidence = 0;

  for (const d of disagreements) {
    const key = `${d.aiDiagnosis} → ${d.physicianDiagnosis}`;
    patterns[key] = (patterns[key] || 0) + 1;
    totalConfidence += d.aiConfidence;
  }

  const topMismatches = Object.entries(patterns)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    patterns,
    totalDisagreements: disagreements.length,
    topMismatches,
    avgAiConfidenceOnError: disagreements.length > 0 ? Math.round((totalConfidence / disagreements.length) * 100) / 100 : 0,
  };
}

export function getDisagreements(limit = 100): Disagreement[] {
  return disagreements.slice(-limit);
}
