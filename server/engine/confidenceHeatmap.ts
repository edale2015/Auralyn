export interface HeatmapRow {
  diagnosis: string;
  diagnosisLabel: string;
  posterior: number;
  contributions: Array<{
    feature: string;
    value: number;
    direction: "positive" | "negative" | "neutral";
  }>;
}

export function buildHeatmap(
  results: Array<{
    ruleId: string;
    diagnosisLabel: string;
    posterior: number;
    features: Array<{ key: string; logLikelihood: number; contribution?: number; inputValue?: any }>;
  }>
): HeatmapRow[] {
  // Collect all unique feature keys from top 6 diagnoses
  const topResults = results.slice(0, 6);
  const allFeatureKeys = new Set<string>();
  for (const r of topResults) {
    for (const f of r.features) {
      if (Math.abs(f.logLikelihood) > 0.05) allFeatureKeys.add(f.key);
    }
  }
  const featureList = Array.from(allFeatureKeys).slice(0, 12);

  return topResults.map(r => {
    const featureMap: Record<string, number> = {};
    for (const f of r.features) featureMap[f.key] = f.logLikelihood;

    return {
      diagnosis: r.ruleId,
      diagnosisLabel: r.diagnosisLabel,
      posterior: r.posterior,
      contributions: featureList.map(fk => {
        const v = featureMap[fk] ?? 0;
        return {
          feature: fk,
          value: v,
          direction: v > 0.1 ? "positive" : v < -0.1 ? "negative" : "neutral",
        };
      }),
    };
  });
}
