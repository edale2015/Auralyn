/**
 * Per-complaint confidence & risk drift detector.
 * Separate from the existing rule-based driftDetectionEngine used by /api/monitoring/drift.
 * This one uses a rolling 10-sample window to detect statistically significant behaviour shifts.
 */

export interface DriftMetric {
  complaint:      string;
  avgConfidence:  number;
  avgRisk:        number;
}

export interface DriftResult {
  drift:      boolean;
  difference: number;
  recentAvg:  number;
  olderAvg:   number;
  complaint?: string;
  details?:   string;
}

class DriftDetectionService {
  private readonly history: DriftMetric[] = [];
  private readonly WINDOW        = 10;
  private readonly DRIFT_THRESHOLD = 0.1;

  record(metric: DriftMetric): void {
    this.history.push(metric);
  }

  detect(complaint?: string): DriftResult {
    const samples = complaint
      ? this.history.filter((m) => m.complaint === complaint)
      : this.history;

    if (samples.length < this.WINDOW) {
      return { drift: false, difference: 0, recentAvg: 0, olderAvg: 0, complaint, details: `Insufficient samples (${samples.length} < ${this.WINDOW})` };
    }

    const recent = samples.slice(-5);
    const older  = samples.slice(-this.WINDOW, -5);

    const avg = (arr: DriftMetric[]) =>
      arr.reduce((sum, m) => sum + m.avgConfidence, 0) / arr.length;

    const recentAvg = avg(recent);
    const olderAvg  = avg(older);
    const difference = Math.abs(recentAvg - olderAvg);

    return {
      drift:      difference > this.DRIFT_THRESHOLD,
      difference,
      recentAvg,
      olderAvg,
      complaint,
      details: difference > this.DRIFT_THRESHOLD
        ? `Confidence drift of ${(difference * 100).toFixed(1)}% exceeds ${this.DRIFT_THRESHOLD * 100}% threshold`
        : "Within acceptable drift bounds",
    };
  }

  history_length(): number { return this.history.length; }

  clear(): void { this.history.length = 0; }
}

export const driftDetectionService = new DriftDetectionService();
