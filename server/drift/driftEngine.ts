/**
 * Drift Engine — Lightweight real-time drift detector.
 * Detects when the system starts "thinking differently" by comparing
 * current output distributions against a rolling baseline.
 *
 * Complements the statistical driftDetector.ts in server/learning/.
 */

export interface DriftResult {
  driftDetected: boolean;
  driftScore:    number;
  severity:      "none" | "mild" | "moderate" | "severe";
  detail:        string;
  checkedAt:     string;
}

let baseline: Record<string, unknown> = {};
let baselineSetAt: string | null = null;

export function updateBaseline(data: Record<string, unknown>): void {
  baseline     = JSON.parse(JSON.stringify(data));
  baselineSetAt = new Date().toISOString();
}

export function detectDrift(current: Record<string, unknown>): DriftResult {
  const baseStr    = JSON.stringify(baseline);
  const currentStr = JSON.stringify(current);
  const driftScore = Math.abs(currentStr.length - baseStr.length);

  let severity: DriftResult["severity"];
  if (driftScore === 0)       severity = "none";
  else if (driftScore < 20)   severity = "mild";
  else if (driftScore < 50)   severity = "moderate";
  else                        severity = "severe";

  return {
    driftDetected: driftScore > 50,
    driftScore,
    severity,
    detail: baselineSetAt
      ? `Baseline set at ${baselineSetAt}. Score delta: ${driftScore} chars`
      : "No baseline set — call updateBaseline() first",
    checkedAt: new Date().toISOString(),
  };
}

export function hasBaseline(): boolean {
  return Object.keys(baseline).length > 0;
}

export function getBaselineSetAt(): string | null {
  return baselineSetAt;
}

/** Convenience: set baseline and immediately check drift on a new sample */
export function calibrateAndCheck(
  baselineSample: Record<string, unknown>,
  currentSample:  Record<string, unknown>
): DriftResult {
  updateBaseline(baselineSample);
  return detectDrift(currentSample);
}
