export interface AccuracyRecord {
  date: number;
  accuracy: number;
  source?: string;
}

export interface DriftAnalysis {
  drift: boolean;
  driftMagnitude: number;
  avgRecent: number;
  avgOlder: number;
  trend: "improving" | "stable" | "degrading";
  dataPoints: number;
  recommendation?: string;
}

const MAX_HISTORY = 365;
const accuracyHistory: AccuracyRecord[] = [];

export function recordAccuracy(accuracy: number, source?: string) {
  accuracyHistory.push({
    date: Date.now(),
    accuracy,
    source,
  });

  if (accuracyHistory.length > MAX_HISTORY) {
    accuracyHistory.shift();
  }
}

export function detectModelDrift(windowSize = 10, threshold = 0.05): DriftAnalysis {
  const minRequired = windowSize * 2;

  if (accuracyHistory.length < minRequired) {
    return {
      drift: false,
      driftMagnitude: 0,
      avgRecent: 0,
      avgOlder: 0,
      trend: "stable",
      dataPoints: accuracyHistory.length,
      recommendation: `Need at least ${minRequired} data points (have ${accuracyHistory.length})`,
    };
  }

  const recent = accuracyHistory.slice(-windowSize);
  const older = accuracyHistory.slice(-minRequired, -windowSize);

  const avgRecent = Math.round((recent.reduce((s, r) => s + r.accuracy, 0) / recent.length) * 1000) / 1000;
  const avgOlder = Math.round((older.reduce((s, r) => s + r.accuracy, 0) / older.length) * 1000) / 1000;
  const driftMagnitude = Math.round(Math.abs(avgOlder - avgRecent) * 1000) / 1000;
  const drift = avgOlder - avgRecent > threshold;

  let trend: "improving" | "stable" | "degrading" = "stable";
  if (avgRecent - avgOlder > 0.02) trend = "improving";
  else if (avgOlder - avgRecent > 0.02) trend = "degrading";

  let recommendation: string | undefined;
  if (drift) {
    recommendation = `Model accuracy dropped ${(driftMagnitude * 100).toFixed(1)}% — consider retraining or investigating data distribution changes`;
  } else if (trend === "improving") {
    recommendation = "Performance improving — current learning pipeline is effective";
  }

  return { drift, driftMagnitude, avgRecent, avgOlder, trend, dataPoints: accuracyHistory.length, recommendation };
}

export function getAccuracyHistory() {
  return {
    total: accuracyHistory.length,
    maxCapacity: MAX_HISTORY,
    records: accuracyHistory.slice(-50),
  };
}
