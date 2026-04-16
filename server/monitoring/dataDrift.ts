import { emitEvent } from "../controlTower/eventBus";

interface DriftBaseline {
  avgAge: number;
  avgConfidence: number;
  topComplaint: string;
  sampleSize: number;
  capturedAt: string;
}

interface PatientFlowSample {
  ageYears?: number;
  confidence?: number;
  complaint?: string;
}

const MAX_SAMPLES = 500;
const BASELINE_MIN_SAMPLES = 50;
// FIX: Baseline was computed once and never refreshed — seasonal/demographic
// shifts rendered drift detection meaningless over time. Now refreshed on a
// rolling 7-day window so the detector stays calibrated to the current clinic population.
const BASELINE_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

let recentSamples: PatientFlowSample[] = [];
let baseline: DriftBaseline | null = null;
let lastBaselineRefreshAt = 0;

function maybeRefreshBaseline(): void {
  const now = Date.now();
  const shouldInit    = !baseline && recentSamples.length >= BASELINE_MIN_SAMPLES;
  const shouldRefresh = !!baseline && (now - lastBaselineRefreshAt) > BASELINE_REFRESH_INTERVAL_MS;

  if (shouldInit || shouldRefresh) {
    baseline             = computeBaseline(recentSamples);
    lastBaselineRefreshAt = now;
    console.log(`[DataDrift] Baseline ${shouldInit ? "established" : "refreshed"} from ${recentSamples.length} samples:`, baseline);
  }
}

export function recordSample(sample: PatientFlowSample): void {
  recentSamples.push(sample);
  if (recentSamples.length > MAX_SAMPLES) recentSamples.shift();
  maybeRefreshBaseline();
}

function computeBaseline(samples: PatientFlowSample[]): DriftBaseline {
  const ages = samples.filter(s => s.ageYears !== undefined).map(s => s.ageYears!);
  const confs = samples.filter(s => s.confidence !== undefined).map(s => s.confidence!);
  const complaints = samples.filter(s => s.complaint).map(s => s.complaint!);

  const complaintCounts: Record<string, number> = {};
  for (const c of complaints) {
    const key = c.toLowerCase().slice(0, 30);
    complaintCounts[key] = (complaintCounts[key] ?? 0) + 1;
  }
  const topComplaint = Object.entries(complaintCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  return {
    avgAge: ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
    avgConfidence: confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
    topComplaint,
    sampleSize: samples.length,
    capturedAt: new Date().toISOString(),
  };
}

export interface DriftReport {
  drift: boolean;
  dimensions: Array<{ name: string; delta: number; threshold: number; drifted: boolean; message: string }>;
  summary: string;
}

export async function detectDrift(): Promise<DriftReport> {
  if (!baseline || recentSamples.length < 20) {
    return { drift: false, dimensions: [], summary: "Insufficient data for drift detection" };
  }

  const recent = recentSamples.slice(-100);
  const recentStats = computeBaseline(recent);
  const dimensions: DriftReport["dimensions"] = [];

  const ageDelta = Math.abs(recentStats.avgAge - baseline.avgAge);
  dimensions.push({
    name: "patient_age",
    delta: ageDelta,
    threshold: 10,
    drifted: ageDelta > 10,
    message: ageDelta > 10
      ? `Patient age distribution shifted by ${ageDelta.toFixed(1)} years (baseline: ${baseline.avgAge.toFixed(1)}, current: ${recentStats.avgAge.toFixed(1)})`
      : `Age distribution stable (delta: ${ageDelta.toFixed(1)} years)`,
  });

  const confDelta = Math.abs(recentStats.avgConfidence - baseline.avgConfidence);
  dimensions.push({
    name: "model_confidence",
    delta: confDelta,
    threshold: 0.15,
    drifted: confDelta > 0.15,
    message: confDelta > 0.15
      ? `Model confidence shifted by ${(confDelta * 100).toFixed(1)}% — possible input distribution change`
      : `Confidence distribution stable (delta: ${(confDelta * 100).toFixed(1)}%)`,
  });

  const complaintDrifted = recentStats.topComplaint !== baseline.topComplaint;
  dimensions.push({
    name: "complaint_distribution",
    delta: complaintDrifted ? 1 : 0,
    threshold: 1,
    drifted: complaintDrifted,
    message: complaintDrifted
      ? `Top complaint shifted from "${baseline.topComplaint}" to "${recentStats.topComplaint}"`
      : `Complaint distribution stable (top: "${recentStats.topComplaint}")`,
  });

  const overallDrift = dimensions.some(d => d.drifted);

  if (overallDrift) {
    const driftedDims = dimensions.filter(d => d.drifted).map(d => d.name).join(", ");
    emitEvent({
      type: "DATA_DRIFT",
      payload: {
        message: `Data drift detected in: ${driftedDims}`,
        severity: "HIGH",
        dimensions: dimensions.filter(d => d.drifted),
        baseline: { avgAge: baseline.avgAge, avgConfidence: baseline.avgConfidence },
        current: { avgAge: recentStats.avgAge, avgConfidence: recentStats.avgConfidence },
      },
      timestamp: Date.now(),
    });
    console.warn(`[DataDrift] Drift detected in: ${driftedDims}`);
  }

  return {
    drift: overallDrift,
    dimensions,
    summary: overallDrift
      ? `Drift detected in: ${dimensions.filter(d => d.drifted).map(d => d.message).join("; ")}`
      : "No significant data drift detected",
  };
}

export function getBaselineSnapshot(): DriftBaseline | null {
  return baseline;
}

export function getDriftSampleCount(): number {
  return recentSamples.length;
}

export function resetBaseline(): void {
  baseline = null;
  recentSamples = [];
  console.log("[DataDrift] Baseline and samples reset");
}
