export interface DriftBaseline {
  antibioticRate: number;
  returnVisitRate: number;
}

export interface DriftInput {
  antibioticRate: number;
  returnVisitRate: number;
}

export interface DriftAlert {
  type: "antibiotic_rate_drift" | "return_visit_rate_increased" | "antibiotic_rate_low";
  message: string;
  delta: number;
  severity: "warning" | "critical";
}

let baseline: DriftBaseline = {
  antibioticRate:   0.3,
  returnVisitRate:  0.1,
};

export function detectDrift(current: DriftInput): DriftAlert[] {
  const alerts: DriftAlert[] = [];

  const abxDelta = Math.abs(current.antibioticRate - baseline.antibioticRate);
  if (abxDelta > 0.1) {
    alerts.push({
      type: "antibiotic_rate_drift",
      message: "Antibiotic rate drift detected",
      delta: Math.round(abxDelta * 1000) / 1000,
      severity: abxDelta > 0.2 ? "critical" : "warning",
    });
  }

  const rvDelta = current.returnVisitRate - baseline.returnVisitRate;
  if (rvDelta > 0.1) {
    alerts.push({
      type: "return_visit_rate_increased",
      message: "Return visit rate increased significantly",
      delta: Math.round(rvDelta * 1000) / 1000,
      severity: rvDelta > 0.2 ? "critical" : "warning",
    });
  }

  if (current.antibioticRate < 0.05) {
    alerts.push({
      type: "antibiotic_rate_low",
      message: "Antibiotic rate is extremely low — possible under-detection",
      delta: Math.round((baseline.antibioticRate - current.antibioticRate) * 1000) / 1000,
      severity: "warning",
    });
  }

  return alerts;
}

export function resetBaseline(newBaseline: DriftBaseline): void {
  baseline = { ...newBaseline };
}

export function getBaseline(): DriftBaseline {
  return { ...baseline };
}
