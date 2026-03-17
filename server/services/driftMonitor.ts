export interface OutcomeRecord {
  timestamp: string;
  correct: boolean;
  complaint: string;
}

export interface DriftResult {
  baselineAccuracy: number;
  recentAccuracy: number;
  delta: number;
  driftDetected: boolean;
  severity: "none" | "mild" | "moderate" | "severe";
  recommendedAction: string;
  baselineSize: number;
  recentSize: number;
}

function computeWindowAccuracy(records: OutcomeRecord[]): number {
  if (!records.length) return 0;
  return records.filter((r) => r.correct).length / records.length;
}

export function detectOutcomeDrift(baseline: OutcomeRecord[], recent: OutcomeRecord[], thresholdDrop = 0.08): DriftResult {
  const baselineAccuracy = computeWindowAccuracy(baseline);
  const recentAccuracy = computeWindowAccuracy(recent);
  const delta = baselineAccuracy - recentAccuracy;
  const driftDetected = delta >= thresholdDrop;

  let severity: DriftResult["severity"] = "none";
  if (delta >= 0.2) severity = "severe";
  else if (delta >= 0.12) severity = "moderate";
  else if (delta >= thresholdDrop) severity = "mild";

  const actions: Record<string, string> = {
    none: "Stable — no action needed",
    mild: "Monitor closely, increase review sampling",
    moderate: "Increase caution thresholds, require more physician review",
    severe: "Critical — pause auto-approvals, inspect complaint clusters, retrain model",
  };

  return {
    baselineAccuracy: Number(baselineAccuracy.toFixed(3)),
    recentAccuracy: Number(recentAccuracy.toFixed(3)),
    delta: Number(delta.toFixed(3)),
    driftDetected,
    severity,
    recommendedAction: actions[severity],
    baselineSize: baseline.length,
    recentSize: recent.length,
  };
}

const seededBaseline: OutcomeRecord[] = Array.from({ length: 40 }, (_, i) => ({
  timestamp: new Date(Date.now() - 86400000 * (40 - i)).toISOString(),
  correct: [true,true,false,true,true,true,true,false,true,true,true,true,true,false,true,true,true,true,false,true,true,true,true,false,true,true,true,true,true,false,true,true,true,true,true,true,false,true,true,true][i],
  complaint: ["sore throat", "ear pain", "cough", "headache", "dizziness"][i % 5],
}));

const seededRecent: OutcomeRecord[] = Array.from({ length: 20 }, (_, i) => ({
  timestamp: new Date(Date.now() - 86400000 * (20 - i)).toISOString(),
  correct: [true,false,true,true,false,true,false,true,true,false,true,true,false,true,false,true,true,false,true,true][i],
  complaint: ["sore throat", "ear pain", "cough", "headache", "dizziness"][i % 5],
}));

export function getDemoDrift(): DriftResult {
  return detectOutcomeDrift(seededBaseline, seededRecent);
}
