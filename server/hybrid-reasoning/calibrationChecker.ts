import * as fs from "fs/promises";
import * as path from "path";

const CALIB_FILE  = path.join("data", "calibration_records.ndjson");
const DRIFT_FILE  = path.join("data", "triage_drift_log.ndjson");

export interface CalibrationRecord {
  caseId: string;
  diagnosis: string;
  predicted_prob: number;
  actual_outcome: 0 | 1;
  timestamp: string;
}

export interface DriftRecord {
  date: string;
  total_evaluations: number;
  er_count: number;
  urgent_care_count: number;
  home_care_count: number;
  override_count: number;
  dangerous_miss_count: number;
  er_rate: number;
  dangerous_miss_rate: number;
  avg_confidence: number;
}

export interface CalibrationReport {
  total_records: number;
  brier_score: number;
  calibration_grade: "excellent" | "good" | "fair" | "poor";
  mean_predicted: number;
  mean_actual: number;
  overconfident: boolean;
  underconfident: boolean;
  note: string;
}

export interface DriftReport {
  current: DriftRecord | null;
  historical: DriftRecord[];
  alerts: string[];
  trend_er_rate: "stable" | "rising" | "falling";
  trend_miss_rate: "stable" | "rising" | "falling";
}

async function ensure() { await fs.mkdir("data", { recursive: true }); }

export async function recordPrediction(
  caseId: string,
  diagnosis: string,
  predictedProb: number,
  actualOutcome: 0 | 1
): Promise<void> {
  await ensure();
  const r: CalibrationRecord = {
    caseId, diagnosis,
    predicted_prob: Math.round(predictedProb * 1000) / 1000,
    actual_outcome: actualOutcome,
    timestamp: new Date().toISOString(),
  };
  await fs.appendFile(CALIB_FILE, JSON.stringify(r) + "\n", "utf8");
}

export async function getCalibrationReport(): Promise<CalibrationReport> {
  let records: CalibrationRecord[] = [];
  try {
    const raw = await fs.readFile(CALIB_FILE, "utf8");
    records = raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch {}

  if (records.length === 0) {
    return { total_records: 0, brier_score: 0, calibration_grade: "good", mean_predicted: 0, mean_actual: 0, overconfident: false, underconfident: false, note: "No calibration records yet." };
  }

  const brierSum = records.reduce((s, r) => s + (r.predicted_prob - r.actual_outcome) ** 2, 0);
  const brier = Math.round((brierSum / records.length) * 1000) / 1000;
  const meanPred = Math.round(records.reduce((s, r) => s + r.predicted_prob, 0) / records.length * 1000) / 1000;
  const meanActual = Math.round(records.reduce((s, r) => s + r.actual_outcome, 0) / records.length * 1000) / 1000;

  const overconfident = meanPred > meanActual + 0.15;
  const underconfident = meanActual > meanPred + 0.15;

  const grade: CalibrationReport["calibration_grade"] =
    brier < 0.1 ? "excellent" : brier < 0.2 ? "good" : brier < 0.3 ? "fair" : "poor";

  const note = overconfident
    ? "System is overconfident — predicted probabilities exceed actual outcomes. Consider adding uncertainty dampening."
    : underconfident
    ? "System is underconfident — predicted probabilities below actual outcomes. Model may be too conservative."
    : "Calibration looks reasonable.";

  return { total_records: records.length, brier_score: brier, calibration_grade: grade, mean_predicted: meanPred, mean_actual: meanActual, overconfident, underconfident, note };
}

export async function recordDriftSnapshot(snapshot: Omit<DriftRecord, "date">): Promise<void> {
  await ensure();
  const record: DriftRecord = { date: new Date().toISOString(), ...snapshot };
  await fs.appendFile(DRIFT_FILE, JSON.stringify(record) + "\n", "utf8");
}

export async function getDriftReport(): Promise<DriftReport> {
  let records: DriftRecord[] = [];
  try {
    const raw = await fs.readFile(DRIFT_FILE, "utf8");
    records = raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l)).slice(-30);
  } catch {}

  const alerts: string[] = [];
  const current = records[records.length - 1] ?? null;

  if (current) {
    if (current.er_rate > 0.4) alerts.push(`⚠ ER rate is high: ${(current.er_rate * 100).toFixed(1)}% (expected <40%)`);
    if (current.dangerous_miss_rate > 0.01) alerts.push(`🚨 Dangerous miss rate exceeds 1%: ${(current.dangerous_miss_rate * 100).toFixed(2)}%`);
    if (current.override_count > current.total_evaluations * 0.3) alerts.push(`⚠ High physician override rate detected`);
  }

  function trend(key: "er_rate" | "dangerous_miss_rate"): "stable" | "rising" | "falling" {
    if (records.length < 3) return "stable";
    const last3 = records.slice(-3).map(r => r[key]);
    const rising = last3[2] > last3[0] * 1.1;
    const falling = last3[2] < last3[0] * 0.9;
    return rising ? "rising" : falling ? "falling" : "stable";
  }

  return {
    current,
    historical: records,
    alerts,
    trend_er_rate: trend("er_rate"),
    trend_miss_rate: trend("dangerous_miss_rate"),
  };
}
